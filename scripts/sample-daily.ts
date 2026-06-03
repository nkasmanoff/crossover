/**
 * QA: sample the Daily Bridge across many dates to eyeball puzzle quality
 * (recognizable endpoints, par distribution). No server needed.
 *   npx tsx scripts/sample-daily.ts [count]
 */
import { getSink } from "../src/lib/sink.js";
import { Graph } from "../src/lib/graph.js";
import { getDaily } from "../lib/server/daily.js";

(async () => {
  const g = new Graph((await getSink().readLatest())!);
  const count = Number(process.argv[2] ?? 14);
  const base = new Date("2026-06-03T00:00:00Z");
  const pars: number[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10);
    try {
      const p = getDaily(g, d);
      pars.push(p.par);
      console.log(`${d}  par ${p.par}   ${p.startName}  →  ${p.targetName}`);
    } catch (e) {
      console.log(`${d}  (no puzzle: ${(e as Error).message})`);
    }
  }
  console.log(`\npar distribution:`, pars.reduce((m: Record<number, number>, p) => ((m[p] = (m[p] ?? 0) + 1), m), {}));
})();
