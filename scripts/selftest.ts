/**
 * Logic self-test against a tiny synthetic snapshot — no API needed.
 * Verifies: link checks, alternation parity, BFS par, hint, connectivity.
 * Run: npx tsx scripts/selftest.ts
 */
import { Graph } from "../src/lib/graph.js";
import { linkTypeForChainLength } from "../lib/linktype.js";
import type { GraphSnapshot } from "../src/types.js";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) process.stdout.write(`  ✓ ${msg}\n`);
  else {
    failures++;
    process.stdout.write(`  ✗ ${msg}\n`);
  }
}

// Players: A,B share college "Duke"; B,C share team "t1"; C,D share college "UCLA".
const snap: GraphSnapshot = {
  version: new Date().toISOString(),
  league: "test",
  teamHistoryDepth: "shallow",
  teamHistoryNote: "",
  players: [
    { id: "A", name: "Alpha", searchKey: "alpha", aliases: ["alpha"], college: "Duke", teams: ["t0"] },
    { id: "B", name: "Bravo", searchKey: "bravo", aliases: ["bravo"], college: "Duke", teams: ["t1"] },
    { id: "C", name: "Charlie", searchKey: "charlie", aliases: ["charlie"], college: "UCLA", teams: ["t1"] },
    { id: "D", name: "Delta", searchKey: "delta", aliases: ["delta"], college: "UCLA", teams: ["t2"] },
    { id: "Z", name: "Zulu", searchKey: "zulu", aliases: ["zulu"], college: null, teams: [] }, // orphan
  ],
  teams: [
    { id: "t0", name: "Team Zero", abbr: "T0", playerIds: ["A"] },
    { id: "t1", name: "Team One", abbr: "T1", playerIds: ["B", "C"] },
    { id: "t2", name: "Team Two", abbr: "T2", playerIds: ["D"] },
  ],
  colleges: [
    { id: "col_duke", name: "Duke", playerIds: ["A", "B"] },
    { id: "col_ucla", name: "UCLA", playerIds: ["C", "D"] },
  ],
};

const g = new Graph(snap);

// Link checks
assert(g.checkLink("A", "B", "college").ok && g.checkLink("A", "B", "college").matchedValue === "Duke", "A↔B share college Duke");
assert(!g.checkLink("A", "B", "team").ok, "A↔B do NOT share a team");
assert(g.checkLink("B", "C", "team").ok && g.checkLink("B", "C", "team").matchedValue === "Team One", "B↔C share Team One");
assert(g.checkLink("C", "D", "college").ok, "C↔D share college UCLA");
assert(!g.checkLink("A", "D", "college").ok && !g.checkLink("A", "D", "team").ok, "A↔D share nothing directly");
assert(g.anyLink("B", "C") && g.anyLink("C", "D") && !g.anyLink("A", "D"), "anyLink matches college or team overlap");

// Alternation parity (college off the seed, then team, then college…)
assert(linkTypeForChainLength(1) === "college", "turn 1 (off seed) = college");
assert(linkTypeForChainLength(2) === "team", "turn 2 = team");
assert(linkTypeForChainLength(3) === "college", "turn 3 = college");

// BFS shortest path / par: A→D should be A-B-C-D = 3 links
const path = g.shortestPath("A", "D");
assert(!!path && path.length === 4 && path.join("") === "ABCD", `par(A→D)=3 via A-B-C-D (got ${path?.join("-")})`);

// Alternation-aware path: A→D college-first = A-B-C-D (college,team,college) ✓
const altPath = g.alternationPath("A", "D", "college");
assert(!!altPath && altPath.join("") === "ABCD", `alternation path A→D = A-B-C-D (got ${altPath?.join("-")})`);
// A→C college-first: A-B(college)-C(team) = valid; check it exists
assert(!!g.alternationPath("A", "C", "college"), "alternation path A→C exists (college then team)");

// Hint: from A on a college turn, valid next excluding A = B
assert(g.findValidNext("A", "college", new Set(["A"])) === "B", "hint from A (college) → B");

// Connectivity: largest component {A,B,C,D}=4, one orphan (Z)
const conn = g.connectivityStats();
assert(conn.largestComponent === 4 && conn.orphans === 1, `largest component 4, 1 orphan (got ${conn.largestComponent}, ${conn.orphans})`);

process.stdout.write(failures === 0 ? "\nALL LOGIC TESTS PASSED\n" : `\n${failures} TEST(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
