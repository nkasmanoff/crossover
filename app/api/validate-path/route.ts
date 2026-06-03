import { NextRequest, NextResponse } from "next/server";
import { getGraph } from "@/lib/server/snapshot";
import { validatePath } from "@/lib/server/daily";

// Header-gated: must be evaluated per request, never prerendered.
export const dynamic = "force-dynamic";

/**
 * Server-INTERNAL path validation (used by daily generation / BFS tooling).
 * It is NOT a public endpoint: it 404s unless called with the internal token
 * (INTERNAL_API_TOKEN). The actual daily generation calls validatePath()
 * directly in-process; this route only exists for offline tooling/debugging.
 */
export async function GET(req: NextRequest) {
  const token = process.env.INTERNAL_API_TOKEN;
  if (!token || req.headers.get("x-internal-token") !== token) {
    return new NextResponse("Not found", { status: 404 });
  }
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const graph = await getGraph();
  return NextResponse.json(validatePath(graph, ids));
}
