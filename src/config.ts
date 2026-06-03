/**
 * Central config for the Crossover data pipeline.
 *
 * Everything that might change when we swap leagues, plans, or hosts lives here:
 * base URL, league path, endpoint paths, auth, and rate-limit settings.
 *
 * Verified against https://docs.balldontlie.io on 2026-06-03:
 *  - Base: https://api.balldontlie.io , versioned league paths (NBA = /v1).
 *  - Auth: API key in the `Authorization` header (no "Bearer " prefix).
 *  - /players paginates with an opaque `cursor` (meta.next_cursor), max per_page 100,
 *    and includes `college` + current `team` — the college->pro link other APIs lack.
 *  - Free tier: 5 requests/minute. /stats, /season_averages, /players/active are
 *    PAID-tier only (return "Unauthorized" on the free key), so full team history
 *    is unavailable on this plan — see teamHistoryDepth handling in the ingester.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Load a .env file by hand so the scripts have zero runtime dependencies. */
function loadDotEnv(): void {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // No .env file — rely on the ambient environment (CI secrets, etc.).
  }
}
loadDotEnv();

/** API key is read server/script side ONLY. It must never reach the client bundle. */
export function getApiKey(): string {
  // Support both the documented name and the one present in this repo's .env.
  const key =
    process.env.BALLDONTLIE_API_KEY ?? process.env.BALL_DONT_LIE_API_KEY ?? "";
  if (!key) {
    throw new Error(
      "Missing API key. Set BALLDONTLIE_API_KEY (or BALL_DONT_LIE_API_KEY) in your environment or .env.",
    );
  }
  return key;
}

export interface LeagueConfig {
  /** Snapshot/league identifier, e.g. "nba". */
  id: string;
  /** Human label for logs/UI. */
  label: string;
  /** Version path segment for this league on the API, e.g. "v1" for NBA. */
  apiVersion: string;
}

export interface ApiConfig {
  baseUrl: string;
  /** The league we ingest. Other leagues plug in by adding entries here. */
  league: LeagueConfig;
  endpoints: {
    players: string;
    teams: string;
    /** Paid-tier only on the current plan; used opportunistically for deep history. */
    stats: string;
    seasonAverages: string;
  };
  /** Max records the API will return per page (players). */
  perPage: number;
  rateLimit: {
    /** Requests allowed per window. Free tier = 5. */
    requestsPerWindow: number;
    /** Window length in ms (free tier window = 60s). */
    windowMs: number;
    /** Extra safety pad between requests, in ms. */
    minSpacingPadMs: number;
  };
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  /** Max in-flight requests at once. With a 5/min budget this stays low. */
  concurrency: number;
}

export const NBA: LeagueConfig = {
  id: "nba",
  label: "NBA",
  apiVersion: "v1",
};

export const config: ApiConfig = {
  baseUrl: "https://api.balldontlie.io",
  league: NBA,
  endpoints: {
    players: "players",
    teams: "teams",
    stats: "stats",
    seasonAverages: "season_averages",
  },
  perPage: 100,
  rateLimit: {
    // Free tier is 5 req/min. Pace conservatively so a burst never trips a 429.
    requestsPerWindow: 5,
    windowMs: 60_000,
    minSpacingPadMs: 250,
  },
  retry: {
    maxAttempts: 6,
    baseDelayMs: 1_000,
    maxDelayMs: 60_000,
  },
  concurrency: 2,
};

/** Build a fully-qualified endpoint URL for the configured league. */
export function apiUrl(endpoint: string): string {
  return `${config.baseUrl}/${config.league.apiVersion}/${endpoint}`;
}

/** Where snapshots are written/read. The sink abstraction (see lib/sink.ts) owns IO. */
export const SNAPSHOT_DIR = join(process.cwd(), "data");
export const SNAPSHOT_FILE = "snapshot.json";

/**
 * Which data source the ingester uses. "balldontlie" = free, shallow team
 * history; "nba-stats" = stats.nba.com (nba_api endpoints), full career history.
 * Override with SOURCE=nba-stats or --source=nba-stats.
 */
export function getSourceId(): string {
  const fromArg = process.argv.find((a) => a.startsWith("--source="))?.split("=")[1];
  return fromArg ?? process.env.SOURCE ?? "nba-stats";
}

/**
 * stats.nba.com (nba_api) settings. These endpoints are undocumented and
 * header-sensitive: they silently stall unless browser-like headers are sent,
 * and they rate-limit aggressively, so calls are paced single-file with retry.
 */
export const nbaStatsConfig = {
  baseUrl: "https://stats.nba.com/stats",
  leagueId: "00", // NBA
  // Required browser-like headers; without these the server hangs (0 bytes).
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.nba.com/",
    Origin: "https://www.nba.com",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "Sec-Fetch-Site": "same-site",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    Connection: "keep-alive",
  } as Record<string, string>,
  rateLimit: {
    minSpacingMs: 700, // pace requests single-file
    requestTimeoutMs: 30_000,
  },
  retry: {
    maxAttempts: 5,
    baseDelayMs: 1_500,
    maxDelayMs: 45_000,
  },
} as const;
