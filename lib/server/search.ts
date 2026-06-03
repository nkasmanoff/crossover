import "server-only";

/**
 * Autocomplete index. The client never receives the full graph — only these
 * lightweight {id, name, hint} matches, and crucially NO indication of whether a
 * name is a correct answer for the current turn. Matching is accent-insensitive
 * over searchKey + aliases.
 */

import type { Graph } from "@/src/lib/graph.js";
import { toSearchKey } from "@/src/lib/normalize.js";

export interface SearchHit {
  id: string;
  name: string;
  /** Subtle disambiguator: college, else current/most-recent team, else "". */
  hint: string;
}

interface IndexEntry {
  id: string;
  name: string;
  hint: string;
  keys: string[]; // searchKey + aliases
}

const indexCache = new WeakMap<Graph, IndexEntry[]>();

function buildIndex(graph: Graph): IndexEntry[] {
  const cached = indexCache.get(graph);
  if (cached) return cached;
  const entries: IndexEntry[] = graph.players.map((p) => {
    let hint = "";
    if (p.college) hint = p.college;
    else if (p.teams.length) hint = graph.getTeam(p.teams[p.teams.length - 1])?.name ?? "";
    return { id: p.id, name: p.name, hint, keys: [p.searchKey, ...p.aliases] };
  });
  indexCache.set(graph, entries);
  return entries;
}

export function search(graph: Graph, q: string, limit = 8): SearchHit[] {
  const key = toSearchKey(q);
  if (!key) return [];
  const index = buildIndex(graph);

  type Scored = { entry: IndexEntry; score: number };
  const scored: Scored[] = [];
  for (const entry of index) {
    let best = Infinity;
    for (const k of entry.keys) {
      if (k === key) best = Math.min(best, 0);
      else if (k.startsWith(key)) best = Math.min(best, 1);
      else if (k.includes(key)) best = Math.min(best, 2);
    }
    if (best !== Infinity) scored.push({ entry, score: best });
  }

  scored.sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name));
  return scored.slice(0, limit).map(({ entry }) => ({ id: entry.id, name: entry.name, hint: entry.hint }));
}
