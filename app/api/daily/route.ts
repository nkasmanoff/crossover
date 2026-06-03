import { NextResponse } from "next/server";
import { getGraph } from "@/lib/server/snapshot";
import { getDaily } from "@/lib/server/daily";
import { playerCard } from "@/lib/server/present";

// Date-dependent: must run per request, never be frozen to the build date.
export const dynamic = "force-dynamic";

/**
 * GET /api/daily → today's puzzle: endpoints + par + start/target cards.
 * The solution PATH is never leaked — only the endpoints and the par.
 */
export async function GET() {
  const graph = await getGraph();
  const puzzle = getDaily(graph);
  return NextResponse.json({
    date: puzzle.date,
    startId: puzzle.startId,
    targetId: puzzle.targetId,
    par: puzzle.par,
    startCard: playerCard(graph, puzzle.startId),
    targetCard: playerCard(graph, puzzle.targetId),
  });
}
