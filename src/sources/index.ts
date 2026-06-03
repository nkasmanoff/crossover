import type { PlayerSource } from "./types.js";
import { balldontlieSource } from "./balldontlie.js";
import { nbaStatsSource } from "./nbaStats.js";

const SOURCES: Record<string, PlayerSource> = {
  [balldontlieSource.id]: balldontlieSource,
  [nbaStatsSource.id]: nbaStatsSource,
};

/** Resolve a source by id (e.g. "balldontlie" | "nba-stats"). */
export function getSource(id: string): PlayerSource {
  const src = SOURCES[id];
  if (!src) {
    throw new Error(`Unknown source "${id}". Available: ${Object.keys(SOURCES).join(", ")}`);
  }
  return src;
}

export type { PlayerSource } from "./types.js";
