/**
 * nba-stats source — stats.nba.com (the endpoints behind nba.com, a.k.a. the
 * "nba_api" endpoints). Free and gives FULL career team history:
 *
 *   - playerindex        → all players (id, name, college, draft, current team)
 *                          + the active-franchise team metadata, in one request.
 *   - playercareerstats  → one row per season w/ TEAM_ID → distinct career teams
 *                          (one request per player; the TOT split-season row,
 *                          TEAM_ID 0, is excluded).
 *
 * Caveat: these endpoints stall non-residential IPs and rate-limit hard, so run
 * the ingest from a residential connection. Calls are paced single-file w/ retry.
 */

import { nbaStatsConfig } from "../config.js";
import type { PlayerSource, SourcePlayer, SourceTeam, TeamRef } from "./types.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface NbaResultSet {
  name: string;
  headers: string[];
  rowSet: (string | number | null)[][];
}
interface NbaResponse {
  resultSets: NbaResultSet[];
}

/** Parse to a finite number, or null (nba-stats uses "Undrafted" etc. for N/A). */
function numOrNull(v: string | number | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Map a result set's rows to objects keyed by header name. */
function rowsAsObjects(rs: NbaResultSet): Record<string, string | number | null>[] {
  return rs.rowSet.map((row) => {
    const o: Record<string, string | number | null> = {};
    rs.headers.forEach((h, i) => (o[h] = row[i]));
    return o;
  });
}

// --- single-file paced fetch with retry/backoff ---
let lastCall = 0;
async function nbaGet(path: string, params: Record<string, string | number>): Promise<NbaResponse> {
  const url = new URL(`${nbaStatsConfig.baseUrl}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const { retry, rateLimit, headers } = nbaStatsConfig;
  let lastErr: unknown;
  for (let attempt = 0; attempt < retry.maxAttempts; attempt++) {
    // Pace requests single-file.
    const wait = lastCall + rateLimit.minSpacingMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), rateLimit.requestTimeoutMs);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return (await res.json()) as NbaResponse;
      if (res.status === 429 || res.status >= 500) {
        const delay = Math.min(retry.baseDelayMs * 2 ** attempt, retry.maxDelayMs);
        process.stderr.write(`  ↻ ${res.status} on ${path} — retry in ${Math.round(delay)}ms\n`);
        await sleep(delay);
        continue;
      }
      throw new Error(`nba-stats ${path} failed: ${res.status} ${res.statusText}`);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const delay = Math.min(retry.baseDelayMs * 2 ** attempt, retry.maxDelayMs);
      process.stderr.write(`  ↻ ${path} error (${String(err)}) — retry in ${Math.round(delay)}ms\n`);
      await sleep(delay);
    }
  }
  throw new Error(`nba-stats ${path} exhausted retries: ${String(lastErr)}`);
}

// --- one-time playerindex fetch, memoized (drives both teams + players) ---
let indexCache: { players: SourcePlayer[]; teams: SourceTeam[] } | null = null;

async function loadIndex(): Promise<{ players: SourcePlayer[]; teams: SourceTeam[] }> {
  if (indexCache) return indexCache;
  process.stdout.write("  fetching playerindex (all-time players + college + teams)…\n");
  const res = await nbaGet("playerindex", {
    LeagueID: nbaStatsConfig.leagueId,
    Season: currentSeason(),
    Historical: 1, // include retired players
  });
  const rs = res.resultSets.find((r) => r.name === "PlayerIndex");
  if (!rs) throw new Error("playerindex: PlayerIndex result set missing");
  const rows = rowsAsObjects(rs);

  const teams = new Map<string, SourceTeam>();
  const players: SourcePlayer[] = [];
  for (const r of rows) {
    const teamId = r.TEAM_ID != null && Number(r.TEAM_ID) !== 0 ? String(r.TEAM_ID) : null;
    if (teamId && !teams.has(teamId)) {
      const city = (r.TEAM_CITY ?? "").toString().trim();
      const name = (r.TEAM_NAME ?? "").toString().trim();
      teams.set(teamId, {
        id: teamId,
        name: `${city} ${name}`.trim() || String(r.TEAM_ABBREVIATION ?? teamId),
        abbr: String(r.TEAM_ABBREVIATION ?? "").trim(),
      });
    }
    players.push({
      id: String(r.PERSON_ID),
      firstName: String(r.PLAYER_FIRST_NAME ?? "").trim(),
      lastName: String(r.PLAYER_LAST_NAME ?? "").trim(),
      college: r.COLLEGE ? String(r.COLLEGE).trim() : null,
      currentTeamId: teamId,
      draftRound: numOrNull(r.DRAFT_ROUND),
      draftNumber: numOrNull(r.DRAFT_NUMBER),
      toYear: numOrNull(r.TO_YEAR),
    });
  }
  process.stdout.write(`  playerindex: ${players.length} players, ${teams.size} active-franchise teams.\n`);
  indexCache = { players, teams: [...teams.values()] };
  return indexCache;
}

/** NBA season string like "2025-26" for the current/most-recent season. */
function currentSeason(): string {
  const now = new Date();
  // The NBA season spans Oct→Jun; treat Jul+ as the start of the next season.
  const startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const end = (startYear + 1) % 100;
  return `${startYear}-${end.toString().padStart(2, "0")}`;
}

export const nbaStatsSource: PlayerSource = {
  id: "nba-stats",
  label: "stats.nba.com (nba_api)",
  supportsFullHistory: true,
  teamHistoryNote:
    "Team history derived from per-season career stats (stats.nba.com), covering every franchise a player appeared with.",

  async fetchTeams(): Promise<SourceTeam[]> {
    return (await loadIndex()).teams;
  },

  async fetchPlayers(): Promise<SourcePlayer[]> {
    return (await loadIndex()).players;
  },

  async fetchTeamHistory(playerId: string): Promise<TeamRef[]> {
    const res = await nbaGet("playercareerstats", {
      PlayerID: playerId,
      PerMode: "Totals",
      LeagueID: nbaStatsConfig.leagueId,
    });
    const rs = res.resultSets.find((r) => r.name === "SeasonTotalsRegularSeason");
    if (!rs) return [];
    const ti = rs.headers.indexOf("TEAM_ID");
    const ta = rs.headers.indexOf("TEAM_ABBREVIATION");
    const refs = new Map<string, TeamRef>();
    for (const row of rs.rowSet) {
      const id = Number(row[ti]);
      if (!id) continue; // TEAM_ID 0 = multi-team "TOT" total row → skip
      const sid = String(id);
      if (!refs.has(sid)) refs.set(sid, { id: sid, abbr: String(row[ta] ?? "").trim() });
    }
    return [...refs.values()];
  },
};
