import "server-only";

/**
 * Builds the minimal, client-safe view of a player: just the player's OWN
 * college + teams, used to render a card once they're in the chain (or as the
 * daily start/target). This is not the graph and not an answer key — it never
 * reveals who else connects to anyone.
 */

import type { Graph } from "@/src/lib/graph.js";

export interface PlayerCardData {
  id: string;
  name: string;
  college: string | null;
  teams: { id: string; abbr: string; name: string }[];
}

export function playerCard(graph: Graph, id: string): PlayerCardData | null {
  const p = graph.getPlayer(id);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    college: p.college,
    teams: p.teams
      .map((tid) => graph.getTeam(tid))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ id: t.id, abbr: t.abbr, name: t.name })),
  };
}
