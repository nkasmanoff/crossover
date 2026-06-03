import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/lib/server/snapshot";
import { pickEndlessSeed } from "@/lib/server/daily";
import { playerCard } from "@/lib/server/present";

/** GET /api/seed → a fresh well-connected start player (card) for Endless. */
export async function GET(req: NextRequest) {
  const salt = req.nextUrl.searchParams.get("salt") ?? "";
  const graph = await getGraph();
  const seed = pickEndlessSeed(graph, salt);
  return NextResponse.json({ ...seed, card: playerCard(graph, seed.id) });
}
