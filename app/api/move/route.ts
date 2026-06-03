import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/lib/server/snapshot";
import { playerCard, type PlayerCardData } from "@/lib/server/present";
import type { LinkType } from "@/src/lib/graph.js";

/**
 * POST /api/move { mode, chainIds:[...], candidateId }
 *  → { ok, status, linkType, matchedValue?, reachedTarget?, reason? }
 *
 * All validity is decided HERE against the graph — the client's notion of
 * validity is never trusted. The required link type is DERIVED from chain
 * position (college off the seed, then alternating) rather than taken from the
 * client. Soft blocks (unknown / reused) are not misses.
 */

export interface MoveResponse {
  ok: boolean;
  status: "ok" | "miss" | "unknown" | "reused";
  linkType: LinkType;
  matchedValue?: string;
  matchedIcon?: "🎓" | "🏀";
  reachedTarget?: boolean;
  reason?: string;
  /** The played player's own card, so the client can render it in the chain. */
  card?: PlayerCardData;
}

import { linkTypeForChainLength } from "@/lib/linktype";

/** Link connecting chain[i] -> chain[i+1] is college when i is even. */
function linkTypeForIncoming(chainLength: number): LinkType {
  return linkTypeForChainLength(chainLength);
}

export async function POST(req: NextRequest) {
  let body: { mode?: string; chainIds?: unknown; candidateId?: unknown; targetId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const chainIds = Array.isArray(body.chainIds) ? body.chainIds.map(String) : [];
  const candidateId = body.candidateId != null ? String(body.candidateId) : "";
  if (chainIds.length === 0 || !candidateId) {
    return NextResponse.json({ error: "chainIds and candidateId required" }, { status: 400 });
  }

  const graph = await getGraph();
  const candidate = graph.getPlayer(candidateId);

  // Unknown player → soft block (no miss).
  if (!candidate) {
    const res: MoveResponse = {
      ok: false,
      status: "unknown",
      linkType: linkTypeForIncoming(chainIds.length),
      reason: "Not a player we know — try another name.",
    };
    return NextResponse.json(res);
  }

  // Reuse → soft block (no miss).
  if (chainIds.includes(candidateId)) {
    const res: MoveResponse = {
      ok: false,
      status: "reused",
      linkType: linkTypeForIncoming(chainIds.length),
      reason: `${candidate.name} is already in your chain.`,
    };
    return NextResponse.json(res);
  }

  const linkType = linkTypeForIncoming(chainIds.length);
  const last = chainIds[chainIds.length - 1];
  const match = graph.checkLink(last, candidateId, linkType);

  if (!match.ok) {
    const prev = graph.getPlayer(last);
    const reason =
      linkType === "college"
        ? `${candidate.name} didn't go to the same college as ${prev?.name ?? "the previous player"}.`
        : `${candidate.name} never shared a pro team with ${prev?.name ?? "the previous player"}.`;
    const res: MoveResponse = { ok: false, status: "miss", linkType, reason };
    return NextResponse.json(res);
  }

  const res: MoveResponse = {
    ok: true,
    status: "ok",
    linkType,
    matchedValue: match.matchedValue,
    matchedIcon: linkType === "college" ? "🎓" : "🏀",
    reachedTarget: body.targetId != null && String(body.targetId) === candidateId,
    card: playerCard(graph, candidateId) ?? undefined,
  };
  return NextResponse.json(res);
}
