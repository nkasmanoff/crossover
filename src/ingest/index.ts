/**
 * Crossover ingestion pipeline (Prompt A).
 *
 * Produces a versioned, self-contained GRAPH SNAPSHOT of players, colleges and
 * pro teams that the game loads and queries offline. Never called at play time.
 *
 *   npm run ingest                    # incremental (reuse caches)
 *   npm run ingest:full               # --full: re-derive everything
 *   SOURCE=nba-stats npm run ingest:full   # full career team history
 *
 * Data comes from a pluggable PlayerSource (see src/sources). Flow: fetch teams
 * + players -> derive team history (if the source supports it) -> normalize
 * names -> build nodes + inverted indexes -> validate (gates + fixtures) ->
 * atomically promote via the sink -> notable sidecar -> summary.
 */

import { config, getSourceId } from "../config.js";
import { getSink } from "../lib/sink.js";
import { buildAliases, canonicalName, collegeId, toSearchKey } from "../lib/normalize.js";
import { canonicalCollege } from "../lib/colleges.js";
import { validateSnapshot } from "../lib/validate.js";
import { getSource } from "../sources/index.js";
import type { SourcePlayer, SourceTeam, TeamRef } from "../sources/types.js";
import type { College, GraphSnapshot, Player, Team, TeamHistoryDepth } from "../types.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const ensureDir = () => {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
};

// ---- per-source caches ----
type TeamHistoryCache = Record<string, TeamRef[]>;

function historyCachePath(sourceId: string) {
  return join(DATA_DIR, `team-history.${sourceId}.cache.json`);
}
function loadHistoryCache(sourceId: string): TeamHistoryCache {
  try {
    return JSON.parse(readFileSync(historyCachePath(sourceId), "utf8")) as TeamHistoryCache;
  } catch {
    return {};
  }
}
function saveHistoryCache(sourceId: string, cache: TeamHistoryCache): void {
  ensureDir();
  writeFileSync(historyCachePath(sourceId), JSON.stringify(cache), "utf8");
}

const RAW_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
interface RawCache {
  fetchedAt: string;
  teams: SourceTeam[];
  players: SourcePlayer[];
}
function rawCachePath(sourceId: string) {
  return join(DATA_DIR, `raw.${sourceId}.cache.json`);
}
function loadRawCache(sourceId: string): RawCache | null {
  try {
    const c = JSON.parse(readFileSync(rawCachePath(sourceId), "utf8")) as RawCache;
    if (Date.now() - new Date(c.fetchedAt).getTime() > RAW_CACHE_MAX_AGE_MS) return null;
    return c;
  } catch {
    return null;
  }
}
function saveRawCache(sourceId: string, teams: SourceTeam[], players: SourcePlayer[]): void {
  ensureDir();
  writeFileSync(
    rawCachePath(sourceId),
    JSON.stringify({ fetchedAt: new Date().toISOString(), teams, players } satisfies RawCache),
    "utf8",
  );
}

// ---- CLI helpers (mainly for testing the nba-stats source on a subset) ----
function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const start = Date.now();
  const full = process.argv.includes("--full");
  const source = getSource(getSourceId());
  const limit = argValue("--limit=") ? Number(argValue("--limit=")) : undefined;
  const onlyIds = argValue("--players=")
    ? new Set(argValue("--players=")!.split(",").map((s) => s.trim()).filter(Boolean))
    : undefined;

  process.stdout.write(
    `\n▶ Crossover ingest  source=${source.label}  mode=${full ? "FULL" : "incremental"}\n\n`,
  );

  // 1 + 2. Teams + players (reuse a recent raw fetch on incremental runs).
  let srcTeams: SourceTeam[];
  let srcPlayers: SourcePlayer[];
  const rawCache = full ? null : loadRawCache(source.id);
  if (rawCache) {
    srcTeams = rawCache.teams;
    srcPlayers = rawCache.players;
    process.stdout.write(
      `Reusing raw cache from ${rawCache.fetchedAt} (${srcTeams.length} teams, ${srcPlayers.length} players). --full to re-fetch.\n\n`,
    );
  } else {
    process.stdout.write("Fetching teams…\n");
    srcTeams = await source.fetchTeams();
    process.stdout.write(`  ${srcTeams.length} teams.\n\nFetching players (all-time)…\n`);
    srcPlayers = await source.fetchPlayers();
    process.stdout.write(`  ${srcPlayers.length} players.\n\n`);
    saveRawCache(source.id, srcTeams, srcPlayers);
  }

  // Optional subset filters (testing).
  if (onlyIds) srcPlayers = srcPlayers.filter((p) => onlyIds.has(p.id));
  if (limit != null) srcPlayers = srcPlayers.slice(0, limit);
  if (onlyIds || limit != null) {
    process.stdout.write(`  (subset: ${srcPlayers.length} players)\n\n`);
  }

  const teams: Map<string, Team> = new Map();
  for (const t of srcTeams) {
    teams.set(t.id, { id: t.id, name: t.name, abbr: t.abbr, playerIds: [] });
  }
  /** Mint a team node for a franchise discovered during history derivation. */
  const ensureTeam = (ref: TeamRef) => {
    if (!teams.has(ref.id)) {
      teams.set(ref.id, { id: ref.id, name: ref.name ?? ref.abbr ?? ref.id, abbr: ref.abbr ?? "", playerIds: [] });
    }
  };

  // 3. Team-history depth is a property of the source.
  const useHistory = source.supportsFullHistory && typeof source.fetchTeamHistory === "function";
  const depth: TeamHistoryDepth = useHistory ? "full" : "shallow";
  process.stdout.write(`teamHistoryDepth = ${depth.toUpperCase()} — ${source.teamHistoryNote}\n\n`);

  const cache = loadHistoryCache(source.id);
  let derived = 0;
  let cached = 0;

  // 4. Build players + assign teams.
  const players: Player[] = [];
  for (const sp of srcPlayers) {
    const name = canonicalName(sp.firstName, sp.lastName);
    let teamRefs: TeamRef[] = [];

    if (useHistory) {
      if (!full && cache[sp.id]) {
        teamRefs = cache[sp.id];
        cached++;
      } else {
        try {
          teamRefs = await source.fetchTeamHistory!(sp.id);
        } catch {
          teamRefs = [];
        }
        // Always include current team in case stats lag a recent trade.
        if (sp.currentTeamId && !teamRefs.some((r) => r.id === sp.currentTeamId)) {
          const cur = teams.get(sp.currentTeamId);
          teamRefs.push({ id: sp.currentTeamId, abbr: cur?.abbr ?? "", name: cur?.name });
        }
        cache[sp.id] = teamRefs;
        derived++;
        if (derived % 50 === 0) {
          saveHistoryCache(source.id, cache);
          process.stdout.write(`  …derived team history for ${derived} players\n`);
        }
      }
    } else if (sp.currentTeamId) {
      teamRefs = [{ id: sp.currentTeamId, abbr: teams.get(sp.currentTeamId)?.abbr ?? "" }];
    }

    for (const ref of teamRefs) ensureTeam(ref);
    const teamIds = teamRefs.map((r) => r.id).filter((id) => teams.has(id));

    players.push({
      id: sp.id,
      name,
      searchKey: toSearchKey(name),
      aliases: buildAliases(name),
      college: canonicalCollege(sp.college),
      teams: [...new Set(teamIds)],
    });
  }
  if (useHistory) saveHistoryCache(source.id, cache);

  // 5. Inverted indexes: team.playerIds and college nodes.
  for (const p of players) {
    for (const tid of p.teams) teams.get(tid)?.playerIds.push(p.id);
  }

  const colleges: Map<string, College> = new Map();
  for (const p of players) {
    if (!p.college) continue;
    const cid = collegeId(p.college);
    let col = colleges.get(cid);
    if (!col) colleges.set(cid, (col = { id: cid, name: p.college, playerIds: [] }));
    col.playerIds.push(p.id);
  }

  // Drop team nodes that ended up with no players (e.g. minted then filtered).
  const usedTeams = [...teams.values()].filter((t) => t.playerIds.length > 0);

  const snapshot: GraphSnapshot = {
    version: new Date().toISOString(),
    league: config.league.id,
    teamHistoryDepth: depth,
    teamHistoryNote: source.teamHistoryNote,
    players,
    teams: usedTeams,
    colleges: [...colleges.values()],
  };

  // 6. Validate BEFORE promoting.
  process.stdout.write("\nValidating snapshot (quality gates + fixtures)…\n");
  const report = validateSnapshot(snapshot);

  // 7. Summary.
  const durationS = ((Date.now() - start) / 1000).toFixed(1);
  const s = report.stats;
  process.stdout.write(
    [
      "\n──────── SUMMARY ────────",
      `source:            ${source.label}`,
      `league:            ${snapshot.league}`,
      `version:           ${snapshot.version}`,
      `teamHistoryDepth:  ${snapshot.teamHistoryDepth}`,
      `players:           ${s.players}  (with college: ${s.playersWithCollege}, with team: ${s.playersWithTeam})`,
      `teams:             ${s.teams}`,
      `colleges:          ${s.colleges}`,
      `largest component: ${s.largestComponent}  (${((s.largestComponent / Math.max(s.players, 1)) * 100).toFixed(1)}%)`,
      `components:        ${s.components}`,
      `orphans (no link): ${s.orphans}`,
      `fixtures:          ${s.fixturesPassed} passed, ${s.fixturesSkipped} skipped`,
      `team history:      derived ${derived}, cached ${cached}`,
      `build duration:    ${durationS}s`,
      "─────────────────────────\n",
    ].join("\n") + "\n",
  );

  if (!report.ok) {
    process.stderr.write("\n✗ VALIDATION FAILED — snapshot NOT promoted:\n");
    for (const e of report.errors) process.stderr.write(`   • ${e}\n`);
    process.exit(1);
  }

  // 8. Atomic promote.
  await getSink().promote(snapshot);
  process.stdout.write("✓ Snapshot validated and promoted.\n");

  // 9. Notable-players sidecar (NOT part of the canonical graph model). The
  //    Daily Bridge seeds from this list so puzzles use RECOGNIZABLE players.
  //    Signal = recency (last season played) + draft position: prefer players
  //    active in roughly the last 15 seasons, lottery/early picks first. When a
  //    source lacks recency (toYear), fall back to draft-position only. The game
  //    degrades gracefully if this file is absent.
  const RECENT_FROM = new Date().getUTCFullYear() - 18; // ~last 18 seasons
  const hasRecency = srcPlayers.some((p) => p.toYear != null);
  const drafted = srcPlayers
    // draftRound/draftNumber of 0 means UNDRAFTED in nba-stats — exclude.
    .filter((p) => (p.draftRound ?? 0) >= 1 && (p.draftNumber ?? 0) >= 1)
    .filter((p) => !hasRecency || (p.toYear != null && p.toYear >= RECENT_FROM))
    .sort((a, b) => a.draftRound! - b.draftRound! || a.draftNumber! - b.draftNumber!)
    .map((p) => p.id);
  ensureDir();
  writeFileSync(
    join(DATA_DIR, "notable.json"),
    JSON.stringify({ version: snapshot.version, playerIds: drafted.slice(0, 2500) }),
    "utf8",
  );
  process.stdout.write(`✓ Wrote ${Math.min(drafted.length, 2500)} notable seeds (notable.json).\n\n`);
}

main().catch((err) => {
  process.stderr.write(`\n✗ Ingest crashed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
