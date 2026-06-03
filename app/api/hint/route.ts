import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/lib/server/snapshot";
import { linkTypeForChainLength } from "@/lib/linktype";

/**
 * POST /api/hint { chainIds:[...], targetId? }
 *  → one VALID next player for the current turn, computed from the graph.
 *
 * Used by both the Hint button and "stuck — reveal & end". For Daily, when a
 * targetId is supplied we prefer a hint that moves toward the target (a step on
 * a shortest path) so hints are actually useful.
 */
export async function POST(req: NextRequest) {
  let body: { chainIds?: unknown; targetId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const chainIds = Array.isArray(body.chainIds) ? body.chainIds.map(String) : [];
  if (chainIds.length === 0) return NextResponse.json({ error: "chainIds required" }, { status: 400 });

  const graph = await getGraph();
  const last = chainIds[chainIds.length - 1];
  const linkType = linkTypeForChainLength(chainIds.length);
  const used = new Set(chainIds);

  const targetId = body.targetId != null ? String(body.targetId) : undefined;

  // Daily: try to pick a valid next that also lies on a shortest path to target.
  if (targetId) {
    const candidates =
      linkType === "college" ? graph.collegeNeighbors(last) : graph.teamNeighbors(last);
    let best: { id: string; dist: number } | null = null;
    for (const c of candidates) {
      if (used.has(c)) continue;
      if (c === targetId) {
        best = { id: c, dist: 0 };
        break;
      }
      const path = graph.shortestPath(c, targetId, 7);
      const dist = path ? path.length - 1 : Infinity;
      if (!best || dist < best.dist) best = { id: c, dist };
    }
    if (best && best.dist !== Infinity) {
      const match = graph.checkLink(last, best.id, linkType);
      const p = graph.getPlayer(best.id)!;
      return NextResponse.json({
        id: p.id,
        name: p.name,
        linkType,
        matchedValue: match.matchedValue,
        matchedIcon: linkType === "college" ? "🎓" : "🏀",
      });
    }
  }

  const nextId = graph.findValidNext(last, linkType, used);
  if (!nextId) {
    return NextResponse.json({ none: true, linkType });
  }
  const match = graph.checkLink(last, nextId, linkType);
  const p = graph.getPlayer(nextId)!;
  return NextResponse.json({
    id: p.id,
    name: p.name,
    linkType,
    matchedValue: match.matchedValue,
    matchedIcon: linkType === "college" ? "🎓" : "🏀",
  });
}
