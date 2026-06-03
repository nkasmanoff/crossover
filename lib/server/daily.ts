// NOTE: intentionally not "server-only" — this module holds pure graph logic
// (no secrets, no fs beyond the public notable sidecar) and is imported only by
// server route handlers. Keeping it import-free lets the ingest/QA scripts unit-
// test daily generation directly. The leak-risk modules (snapshot/search/present)
// remain server-only.

/**
 * Daily Bridge puzzle generation.
 *
 * Everyone gets the SAME start + target for a given date. We pick the pair
 * deterministically from a date-seeded PRNG, then compute the true shortest
 * path with BFS so the puzzle has a real PAR (fewest links) and is verified
 * solvable before it's published. Results are cached per date for the process.
 *
 * Target par: 3–5 links. The combined college/team relation is used for par
 * (the alternation rule only constrains how a human plays, not reachability).
 */

import type { Graph } from "@/src/lib/graph.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Optional notable-players sidecar written by the ingester (drafted players,
 * earlier picks first). Used to bias daily seeds toward recognizable names.
 * Absent → we fall back to any major-franchise player.
 */
let notableCache: Set<string> | null | undefined;
function loadNotable(): Set<string> | null {
  if (notableCache !== undefined) return notableCache;
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "data", "notable.json"), "utf8")) as {
      playerIds: string[];
    };
    notableCache = new Set(raw.playerIds);
  } catch {
    notableCache = null;
  }
  return notableCache;
}

export interface DailyPuzzle {
  date: string; // YYYY-MM-DD
  startId: string;
  targetId: string;
  startName: string;
  targetName: string;
  par: number; // shortest number of links
}

const MIN_PAR = 3;
const MAX_PAR = 5;
const cache = new Map<string, DailyPuzzle>();

/** YYYY-MM-DD in UTC so the daily flips at a single global moment. */
export function todayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// --- deterministic PRNG (mulberry32) seeded from the date string ---
function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Candidate seed players: well-connected, named players with BOTH a college and
 * a team so either link type is playable. Sorted for determinism.
 */
export function seedPool(graph: Graph): string[] {
  // "Major" franchises = the big-roster teams (the 30 modern NBA franchises,
  // which carry their legends). Seeding from players affiliated with one biases
  // the daily toward recognizable players and away from obscure 1950s names on
  // defunct teams, without a separate fame dataset. League-agnostic: it's a
  // fraction of the largest roster, so it self-adjusts for other leagues.
  let maxRoster = 0;
  for (const t of graph.snapshot.teams) maxRoster = Math.max(maxRoster, t.playerIds.length);
  const majorTeams = new Set(
    graph.snapshot.teams.filter((t) => t.playerIds.length >= 0.25 * maxRoster).map((t) => t.id),
  );
  const notable = loadNotable();

  const consider = (requireNotable: boolean): string[] => {
    const pool: string[] = [];
    for (const p of graph.players) {
      if (!p.college) continue;
      if (p.teams.length === 0) continue;
      if (!p.teams.some((t) => majorTeams.has(t))) continue;
      if (requireNotable && notable && !notable.has(p.id)) continue;
      // Some connectivity so puzzles aren't dead-ends.
      const degree = graph.collegeNeighbors(p.id).length + graph.teamNeighbors(p.id).length;
      if (degree >= 8) pool.push(p.id);
    }
    return pool.sort();
  };

  // Prefer notable (drafted) players; fall back to all major-franchise players
  // if the sidecar is missing or too small to make varied puzzles.
  const preferred = consider(true);
  return preferred.length >= 50 ? preferred : consider(false);
}

export function getDaily(graph: Graph, date: string = todayKey()): DailyPuzzle {
  const hit = cache.get(date);
  if (hit) return hit;

  const pool = seedPool(graph);
  if (pool.length < 2) throw new Error("Snapshot too small/sparse to generate a daily puzzle.");

  const rand = mulberry32(hashString("crossover:" + date));
  const poolSet = new Set(pool);

  // Try several seeds until we find a start with a recognizable target at an
  // ACHIEVABLE par 3–5. Par is the alternation-constrained distance (college
  // off the seed) — the true fewest links a player can play. (The full-history
  // graph has unconstrained diameter ~2, so the alternation rule is what gives
  // puzzles their depth.) Both endpoints come from the recognizable pool.
  for (let attempt = 0; attempt < 400; attempt++) {
    const start = pool[Math.floor(rand() * pool.length)];
    const dist = graph.alternationDistances(start, "college", MAX_PAR);
    // Prefer the hardest available par; collect recognizable targets per par.
    let target: string | undefined;
    let par = 0;
    for (let p = MAX_PAR; p >= MIN_PAR; p--) {
      const cands: string[] = [];
      for (const [id, d] of dist) if (d === p && id !== start && poolSet.has(id)) cands.push(id);
      if (cands.length) {
        cands.sort();
        target = cands[Math.floor(rand() * cands.length)];
        par = p;
        break;
      }
    }
    if (!target) continue;

    // Confirm a concrete alternation-respecting path of exactly `par` exists.
    const path = graph.alternationPath(start, target, "college", par);
    if (!path || path.length - 1 !== par) continue;

    const puzzle: DailyPuzzle = {
      date,
      startId: start,
      targetId: target,
      startName: graph.getPlayer(start)!.name,
      targetName: graph.getPlayer(target)!.name,
      par,
    };
    cache.set(date, puzzle);
    return puzzle;
  }

  throw new Error(`Could not generate a daily puzzle for ${date} within attempt budget.`);
}

/**
 * Pick a well-connected seed for an Endless run. `salt` lets the client request
 * a fresh start; with no salt it's stable per-process so reloads are consistent.
 */
export function pickEndlessSeed(graph: Graph, salt = ""): { id: string; name: string } {
  const pool = seedPool(graph);
  if (pool.length === 0) throw new Error("No seed players available.");
  const rand = mulberry32(hashString("endless:" + salt + ":" + Date.now()));
  const id = pool[Math.floor(rand() * pool.length)];
  return { id, name: graph.getPlayer(id)!.name };
}

/**
 * Internal helper for daily generation / BFS validation. Exposed for the
 * server-internal validate-path route; NOT a public answer leak (server-only).
 */
export function validatePath(graph: Graph, ids: string[]): { ok: boolean; reason?: string } {
  if (ids.length < 2) return { ok: false, reason: "path too short" };
  for (let i = 0; i + 1 < ids.length; i++) {
    const a = ids[i];
    const b = ids[i + 1];
    const linked =
      graph.checkLink(a, b, "college").ok || graph.checkLink(a, b, "team").ok;
    if (!linked) return { ok: false, reason: `no link between ${a} and ${b}` };
  }
  return { ok: true };
}
