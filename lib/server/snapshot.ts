import "server-only";

/**
 * Server-side snapshot access. Loads the newest valid GraphSnapshot ONCE and
 * caches it + a Graph instance for the process. The game never touches the live
 * sports API at play time — everything answers from this snapshot, so the app
 * keeps working even if balldontlie is down (it just serves the last good data).
 */

import { getSink } from "@/src/lib/sink.js";
import { Graph } from "@/src/lib/graph.js";
import type { GraphSnapshot } from "@/src/types.js";

interface Loaded {
  snapshot: GraphSnapshot;
  graph: Graph;
}

let cache: Loaded | null = null;

export async function getGraph(): Promise<Graph> {
  return (await load()).graph;
}

export async function getSnapshotMeta(): Promise<{
  version: string;
  league: string;
  teamHistoryDepth: GraphSnapshot["teamHistoryDepth"];
  teamHistoryNote: string;
  players: number;
}> {
  const { snapshot } = await load();
  return {
    version: snapshot.version,
    league: snapshot.league,
    teamHistoryDepth: snapshot.teamHistoryDepth,
    teamHistoryNote: snapshot.teamHistoryNote,
    players: snapshot.players.length,
  };
}

async function load(): Promise<Loaded> {
  if (cache) return cache;
  const snapshot = await getSink().readLatest();
  if (!snapshot) {
    throw new Error(
      "No graph snapshot found. Run `npm run ingest:full` to build data/snapshot.json before starting the app.",
    );
  }
  cache = { snapshot, graph: new Graph(snapshot) };
  return cache;
}
