/**
 * Spot-check fixtures: a handful of KNOWN truths so a bad ingest is caught early.
 *
 * College facts are immutable and always checked. Multi-team facts depend on
 * career team history, which is only available on a paid plan — those are gated
 * behind `requiresFullHistory` and skipped (with a log) on a shallow snapshot
 * rather than failing the build for a known data-plan limitation.
 */

import type { GraphSnapshot } from "./types.js";
import { toSearchKey } from "./lib/normalize.js";

export interface Fixture {
  description: string;
  /** Only meaningful when the snapshot has full team history. */
  requiresFullHistory?: boolean;
  /** Return null if OK, or an error message describing the mismatch. */
  check: (snap: GraphSnapshot, find: (name: string) => GraphSnapshot["players"][number] | undefined) => string | null;
}

export const fixtures: Fixture[] = [
  {
    description: 'Stephen Curry.college === "Davidson"',
    check: (_s, find) => {
      const p = find("Stephen Curry");
      if (!p) return "Stephen Curry not found";
      return p.college === "Davidson" ? null : `expected Davidson, got ${JSON.stringify(p.college)}`;
    },
  },
  {
    description: 'JJ Redick.college === "Duke"',
    check: (_s, find) => {
      const p = find("JJ Redick") ?? find("J.J. Redick");
      if (!p) return "JJ Redick not found";
      return p.college === "Duke" ? null : `expected Duke, got ${JSON.stringify(p.college)}`;
    },
  },
  {
    description: 'Seth Curry.college === "Duke"',
    check: (_s, find) => {
      const p = find("Seth Curry");
      if (!p) return "Seth Curry not found";
      return p.college === "Duke" ? null : `expected Duke, got ${JSON.stringify(p.college)}`;
    },
  },
  {
    description: 'College normalization: Jason Kidd and Ivan Rabb both === "California" (UC Berkeley)',
    check: (_s, find) => {
      const kidd = find("Jason Kidd");
      const rabb = find("Ivan Rabb");
      if (!kidd) return "Jason Kidd not found";
      if (!rabb) return "Ivan Rabb not found";
      if (kidd.college !== "California") return `Kidd college expected California, got ${JSON.stringify(kidd.college)}`;
      if (rabb.college !== "California") return `Rabb college expected California (was "University of California, Berkeley"), got ${JSON.stringify(rabb.college)}`;
      return null;
    },
  },
  {
    description: "Kevin Durant.teams includes Oklahoma City Thunder and Golden State Warriors",
    requiresFullHistory: true,
    check: (snap, find) => {
      const p = find("Kevin Durant");
      if (!p) return "Kevin Durant not found";
      const teamNames = new Set(
        p.teams
          .map((id) => snap.teams.find((t) => t.id === id)?.name)
          .filter(Boolean) as string[],
      );
      const hasOkc = [...teamNames].some((n) => /thunder/i.test(n));
      const hasGsw = [...teamNames].some((n) => /warriors/i.test(n));
      if (hasOkc && hasGsw) return null;
      return `expected Thunder & Warriors, got ${[...teamNames].join(", ") || "(none)"}`;
    },
  },
];

/** Build a name finder over a snapshot using the same search-key normalization. */
export function makeFinder(snap: GraphSnapshot) {
  const byKey = new Map<string, GraphSnapshot["players"][number]>();
  for (const p of snap.players) {
    if (!byKey.has(p.searchKey)) byKey.set(p.searchKey, p);
    for (const a of p.aliases) if (!byKey.has(a)) byKey.set(a, p);
  }
  return (name: string) => byKey.get(toSearchKey(name));
}

export interface FixtureRunResult {
  passed: number;
  skipped: number;
  failures: string[];
}

/** Run all fixtures against a snapshot. Returns failures (empty = all good). */
export function runFixtures(snap: GraphSnapshot): FixtureRunResult {
  const find = makeFinder(snap);
  const failures: string[] = [];
  let passed = 0;
  let skipped = 0;
  for (const fx of fixtures) {
    if (fx.requiresFullHistory && snap.teamHistoryDepth !== "full") {
      skipped++;
      process.stdout.write(`  ⊘ SKIP (shallow history): ${fx.description}\n`);
      continue;
    }
    const err = fx.check(snap, find);
    if (err) {
      failures.push(`${fx.description} — ${err}`);
      process.stdout.write(`  ✗ FAIL: ${fx.description} — ${err}\n`);
    } else {
      passed++;
      process.stdout.write(`  ✓ ${fx.description}\n`);
    }
  }
  return { passed, skipped, failures };
}
