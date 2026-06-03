import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/lib/server/snapshot";
import { search } from "@/lib/server/search";

/**
 * GET /api/autocomplete?q=...  → up to ~8 {id, name, hint} matches.
 * Never reveals whether a name satisfies the current turn (no answer leak).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ results: [] });
  const graph = await getGraph();
  return NextResponse.json({ results: search(graph, q, 8) });
}
