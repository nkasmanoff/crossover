import { Game } from "@/components/Game";
import { getGraph, getSnapshotMeta } from "@/lib/server/snapshot";
import { getDaily } from "@/lib/server/daily";
import { playerCard } from "@/lib/server/present";
import type { DailyData, SnapshotMeta } from "@/lib/types";

// The daily puzzle changes by date; don't statically cache the page forever.
export const dynamic = "force-dynamic";

export default async function Home() {
  let meta: SnapshotMeta;
  let daily: DailyData | null = null;

  try {
    meta = await getSnapshotMeta();
  } catch {
    return <NoData />;
  }

  try {
    const graph = await getGraph();
    const puzzle = getDaily(graph);
    daily = {
      date: puzzle.date,
      startId: puzzle.startId,
      targetId: puzzle.targetId,
      par: puzzle.par,
      startCard: playerCard(graph, puzzle.startId)!,
      targetCard: playerCard(graph, puzzle.targetId)!,
    };
  } catch {
    // Daily generation failed (e.g. sparse snapshot) — Endless still works.
    daily = null;
  }

  return <Game daily={daily} meta={meta} />;
}

function NoData() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-5xl tracking-wide text-white">
        CROSS<span className="text-amber-hard text-glow">OVER</span>
      </h1>
      <p className="mt-4 text-white/60">
        No graph snapshot found. Build one first:
      </p>
      <pre className="mt-3 rounded-lg border border-court-line bg-court-panel px-4 py-2 text-sm text-amber-hard">
        npm run ingest:full
      </pre>
    </div>
  );
}
