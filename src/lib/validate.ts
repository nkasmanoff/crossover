/**
 * Quality gates. The build FAILS LOUDLY if invariants don't hold so a bad
 * ingest never gets promoted to the live snapshot the game plays against.
 */

import type { GraphSnapshot } from "../types.js";
import { Graph } from "./graph.js";
import { runFixtures } from "../fixtures.js";
import { collegeId } from "./normalize.js";

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  stats: {
    players: number;
    teams: number;
    colleges: number;
    playersWithCollege: number;
    playersWithTeam: number;
    largestComponent: number;
    orphans: number;
    components: number;
    fixturesPassed: number;
    fixturesSkipped: number;
  };
}

export function validateSnapshot(snap: GraphSnapshot): ValidationReport {
  const errors: string[] = [];
  const teamIds = new Set(snap.teams.map((t) => t.id));
  const collegeIds = new Set(snap.colleges.map((c) => c.id));
  const collegeById = new Map(snap.colleges.map((c) => [c.id, c] as const));

  // --- Referential integrity: every player.teams id resolves to a real team,
  //     every non-null college resolves to a college node (matched by canonical
  //     id, since raw college strings are merged into one node by slug). ---
  let refErrors = 0;
  for (const p of snap.players) {
    for (const tid of p.teams) {
      if (!teamIds.has(tid)) {
        if (refErrors++ < 5) errors.push(`Player ${p.name} (${p.id}) references unknown team id ${tid}`);
      }
    }
    if (p.college) {
      const col = collegeById.get(collegeId(p.college));
      if (!col) {
        if (refErrors++ < 5) errors.push(`Player ${p.name} (${p.id}) college "${p.college}" has no college node`);
      } else if (!col.playerIds.includes(p.id)) {
        if (refErrors++ < 5) errors.push(`College "${p.college}" inverted index missing player ${p.id}`);
      }
    }
  }
  if (refErrors > 5) errors.push(`…and ${refErrors - 5} more referential-integrity errors`);

  // --- Inverted-index integrity: every id referenced by a node exists. ---
  for (const t of snap.teams) {
    for (const pid of t.playerIds) {
      if (!snap.players.find((p) => p.id === pid)) {
        errors.push(`Team ${t.name} references unknown player id ${pid}`);
        break;
      }
    }
  }
  for (const c of snap.colleges) {
    if (!collegeIds.has(c.id)) errors.push(`Duplicate/invalid college id ${c.id}`);
  }

  // --- Connectivity sanity. Orphans are allowed but reported. ---
  const graph = new Graph(snap);
  const conn = graph.connectivityStats();
  const largestPct = snap.players.length ? conn.largestComponent / snap.players.length : 0;
  if (snap.players.length > 50 && largestPct < 0.5) {
    errors.push(
      `Graph too fragmented: largest component is ${conn.largestComponent}/${snap.players.length} (${(largestPct * 100).toFixed(1)}%) — expected a largely connected graph`,
    );
  }

  // --- Fixtures (known truths). ---
  const fx = runFixtures(snap);
  for (const f of fx.failures) errors.push(`Fixture failed: ${f}`);

  const playersWithCollege = snap.players.filter((p) => p.college).length;
  const playersWithTeam = snap.players.filter((p) => p.teams.length > 0).length;

  return {
    ok: errors.length === 0,
    errors,
    stats: {
      players: snap.players.length,
      teams: snap.teams.length,
      colleges: snap.colleges.length,
      playersWithCollege,
      playersWithTeam,
      largestComponent: conn.largestComponent,
      orphans: conn.orphans,
      components: conn.components,
      fixturesPassed: fx.passed,
      fixturesSkipped: fx.skipped,
    },
  };
}
