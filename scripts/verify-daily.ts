/**
 * End-to-end verifier: fetch today's Daily Bridge from the running app, compute
 * a real alternation-respecting solution from the graph, then PLAY it through
 * the live /api/move route to prove the puzzle is winnable server-side.
 *
 *   (dev server must be running)  npx tsx scripts/verify-daily.ts
 */
import { getSink } from "../src/lib/sink.js";
import { Graph } from "../src/lib/graph.js";

const BASE = process.env.BASE ?? "http://localhost:3000";

async function main() {
  const snap = await getSink().readLatest();
  if (!snap) throw new Error("no snapshot");
  const graph = new Graph(snap);

  const daily = (await (await fetch(`${BASE}/api/daily`)).json()) as {
    date: string;
    startId: string;
    targetId: string;
    par: number;
  };
  const startName = graph.getPlayer(daily.startId)?.name;
  const targetName = graph.getPlayer(daily.targetId)?.name;
  console.log(`Daily ${daily.date}: ${startName} → ${targetName} (par ${daily.par})`);

  const path = graph.alternationPath(daily.startId, daily.targetId, "college", 12);
  if (!path) throw new Error("FAIL: no alternation-respecting solution exists!");
  console.log("Solution path:", path.map((id) => graph.getPlayer(id)?.name).join(" → "), `(${path.length - 1} links)`);

  // Play it through the live move API.
  const chain = [daily.startId];
  for (let i = 1; i < path.length; i++) {
    const res = await fetch(`${BASE}/api/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "daily", chainIds: chain, candidateId: path[i], targetId: daily.targetId }),
    });
    const data = await res.json();
    const who = graph.getPlayer(path[i])?.name;
    if (!data.ok) {
      console.error(`  ✗ move ${i} (${who}) REJECTED: ${data.status} — ${data.reason}`);
      process.exit(1);
    }
    console.log(`  ✓ ${data.linkType === "college" ? "🎓" : "🏀"} ${who} — ${data.matchedValue}${data.reachedTarget ? "  [TARGET REACHED]" : ""}`);
    chain.push(path[i]);
  }
  console.log("\n✓ Daily is solvable end-to-end through the live API.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
