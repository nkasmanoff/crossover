/**
 * Demo: given two player names, print whether they share a college and/or a team
 * — proving the graph answers the only question the game asks.
 *
 *   npm run demo -- "Stephen Curry" "Seth Curry"
 *   npm run demo -- "Kevin Durant" "Russell Westbrook"
 */

import { getSink } from "../src/lib/sink.js";
import { Graph } from "../src/lib/graph.js";
import { makeFinder } from "../src/fixtures.js";

async function main() {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) {
    process.stderr.write('Usage: npm run demo -- "Player One" "Player Two"\n');
    process.exit(1);
  }

  const snap = await getSink().readLatest();
  if (!snap) {
    process.stderr.write("No snapshot found. Run `npm run ingest:full` first.\n");
    process.exit(1);
  }
  const graph = new Graph(snap);
  const find = makeFinder(snap);

  const pa = find(a);
  const pb = find(b);
  if (!pa) return fail(`Player not found: "${a}"`);
  if (!pb) return fail(`Player not found: "${b}"`);

  process.stdout.write(`\nSnapshot ${snap.version} (${snap.league}, ${snap.teamHistoryDepth} team history)\n`);
  process.stdout.write(`\n${pa.name}  ⇄  ${pb.name}\n`);

  const college = graph.checkLink(pa.id, pb.id, "college");
  const team = graph.checkLink(pa.id, pb.id, "team");

  process.stdout.write(
    `  🎓 college: ${college.ok ? `YES — both attended ${college.matchedValue}` : "no shared college"}\n`,
  );
  process.stdout.write(
    `  🏀 team:    ${team.ok ? `YES — both played for ${team.matchedValue}` : "no shared team"}\n`,
  );

  if (!college.ok && !team.ok) {
    const path = graph.shortestPath(pa.id, pb.id);
    if (path) {
      const names = path.map((id) => graph.getPlayer(id)?.name).join("  →  ");
      process.stdout.write(`\n  No direct link, but a chain of ${path.length - 1} exists:\n    ${names}\n`);
    } else {
      process.stdout.write("\n  No path between them in the graph.\n");
    }
  }
  process.stdout.write("\n");
}

function fail(msg: string): never {
  process.stderr.write(msg + "\n");
  process.exit(1);
}

main();
