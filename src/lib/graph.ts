/**
 * Runtime graph helpers over a GraphSnapshot.
 *
 * The snapshot already ships inverted indexes (college.playerIds, team.playerIds)
 * so connection checks are O(1)-ish. This wraps them in Maps for fast lookup and
 * provides the only two questions the game ever asks:
 *   - do two players share a college?  (college link)
 *   - do two players share a team?      (team link)
 * plus BFS for the Daily Bridge shortest-path "par".
 */

import type { College, GraphSnapshot, Player, Team } from "../types.js";

export type LinkType = "college" | "team";

export interface MatchResult {
  ok: boolean;
  linkType: LinkType;
  /** Display value that matched, e.g. "Duke" or "Golden State Warriors". */
  matchedValue?: string;
  /** Id of the matched college/team. */
  matchedId?: string;
}

export class Graph {
  readonly snapshot: GraphSnapshot;
  private readonly playersById = new Map<string, Player>();
  private readonly teamsById = new Map<string, Team>();
  private readonly collegesById = new Map<string, College>();
  /** player id -> Set of college ids (size 0 or 1 today, future-proofed as a set). */
  private readonly playerColleges = new Map<string, Set<string>>();
  /** player id -> Set of team ids. */
  private readonly playerTeams = new Map<string, Set<string>>();

  constructor(snapshot: GraphSnapshot) {
    this.snapshot = snapshot;
    for (const p of snapshot.players) this.playersById.set(p.id, p);
    for (const t of snapshot.teams) this.teamsById.set(t.id, t);
    for (const c of snapshot.colleges) this.collegesById.set(c.id, c);
    for (const p of snapshot.players) {
      this.playerTeams.set(p.id, new Set(p.teams));
      // College id is derived from the college name (see ingest). We map via name.
    }
    // Build player->college id sets from the college inverted index (authoritative).
    for (const c of snapshot.colleges) {
      for (const pid of c.playerIds) {
        let set = this.playerColleges.get(pid);
        if (!set) this.playerColleges.set(pid, (set = new Set()));
        set.add(c.id);
      }
    }
  }

  getPlayer(id: string): Player | undefined {
    return this.playersById.get(id);
  }
  getTeam(id: string): Team | undefined {
    return this.teamsById.get(id);
  }
  getCollege(id: string): College | undefined {
    return this.collegesById.get(id);
  }
  get players(): Player[] {
    return this.snapshot.players;
  }

  /** Players who share a college with `playerId` (excluding self). */
  collegeNeighbors(playerId: string): string[] {
    const cols = this.playerColleges.get(playerId);
    if (!cols) return [];
    const out = new Set<string>();
    for (const cid of cols) {
      const col = this.collegesById.get(cid);
      if (!col) continue;
      for (const pid of col.playerIds) if (pid !== playerId) out.add(pid);
    }
    return [...out];
  }

  /** Players who share a team with `playerId` (excluding self). */
  teamNeighbors(playerId: string): string[] {
    const teams = this.playerTeams.get(playerId);
    if (!teams) return [];
    const out = new Set<string>();
    for (const tid of teams) {
      const team = this.teamsById.get(tid);
      if (!team) continue;
      for (const pid of team.playerIds) if (pid !== playerId) out.add(pid);
    }
    return [...out];
  }

  /** All neighbors regardless of link type — used for connectivity + BFS. */
  allNeighbors(playerId: string): string[] {
    const set = new Set<string>([
      ...this.collegeNeighbors(playerId),
      ...this.teamNeighbors(playerId),
    ]);
    return [...set];
  }

  /** Check whether a -> b satisfies a given link type, returning what matched. */
  checkLink(aId: string, bId: string, linkType: LinkType): MatchResult {
    const a = this.playersById.get(aId);
    const b = this.playersById.get(bId);
    if (!a || !b) return { ok: false, linkType };

    if (linkType === "college") {
      const ac = this.playerColleges.get(aId);
      const bc = this.playerColleges.get(bId);
      if (ac && bc) {
        for (const cid of ac) {
          if (bc.has(cid)) {
            return {
              ok: true,
              linkType,
              matchedId: cid,
              matchedValue: this.collegesById.get(cid)?.name,
            };
          }
        }
      }
      return { ok: false, linkType };
    }

    // team
    const at = this.playerTeams.get(aId);
    const bt = this.playerTeams.get(bId);
    if (at && bt) {
      for (const tid of at) {
        if (bt.has(tid)) {
          return {
            ok: true,
            linkType,
            matchedId: tid,
            matchedValue: this.teamsById.get(tid)?.name,
          };
        }
      }
    }
    return { ok: false, linkType };
  }

  /** True if two players share a college and/or a pro team. */
  anyLink(aId: string, bId: string): boolean {
    return this.checkLink(aId, bId, "college").ok || this.checkLink(aId, bId, "team").ok;
  }

  /**
   * Find one valid next player for a hint: someone linked to `fromId` by
   * `linkType` who is not in `exclude`. Returns undefined if none.
   */
  findValidNext(fromId: string, linkType: LinkType, exclude: Set<string>): string | undefined {
    const candidates =
      linkType === "college" ? this.collegeNeighbors(fromId) : this.teamNeighbors(fromId);
    for (const c of candidates) if (!exclude.has(c)) return c;
    return undefined;
  }

  /**
   * Shortest path (by number of links) between two players over the combined
   * relation, ignoring the alternation rule — this is the puzzle "par".
   * Returns the path of player ids inclusive of both ends, or null if unreachable.
   */
  shortestPath(startId: string, targetId: string, maxDepth = 8): string[] | null {
    if (startId === targetId) return [startId];
    const visited = new Set<string>([startId]);
    const prev = new Map<string, string>();
    let frontier = [startId];
    let depth = 0;
    while (frontier.length && depth < maxDepth) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const nb of this.allNeighbors(id)) {
          if (visited.has(nb)) continue;
          visited.add(nb);
          prev.set(nb, id);
          if (nb === targetId) {
            // reconstruct
            const path = [nb];
            let cur = nb;
            while (cur !== startId) {
              cur = prev.get(cur)!;
              path.push(cur);
            }
            return path.reverse();
          }
          next.push(nb);
        }
      }
      frontier = next;
      depth++;
    }
    return null;
  }

  /**
   * Alternation-aware path: the game forces link types to alternate starting
   * with `firstLink` off the seed. This finds a simple-ish path from start to
   * target respecting that constraint (state = player + the link type required
   * for the NEXT step). Returns the player-id path inclusive of both ends, or
   * null if the target can't be reached under the rules. Used to VERIFY a daily
   * is actually solvable (not merely BFS-connected) before publishing.
   */
  alternationPath(
    startId: string,
    targetId: string,
    firstLink: LinkType = "college",
    maxLinks = 8,
  ): string[] | null {
    if (startId === targetId) return [startId];
    // state key = `${playerId}|${nextLinkType}`
    const startKey = `${startId}|${firstLink}`;
    const visited = new Set<string>([startKey]);
    const prev = new Map<string, { player: string; key: string }>();
    let frontier: Array<{ player: string; next: LinkType }> = [{ player: startId, next: firstLink }];
    let links = 0;
    while (frontier.length && links < maxLinks) {
      const nextFrontier: Array<{ player: string; next: LinkType }> = [];
      for (const { player, next } of frontier) {
        const neighbors = next === "college" ? this.collegeNeighbors(player) : this.teamNeighbors(player);
        const after: LinkType = next === "college" ? "team" : "college";
        for (const nb of neighbors) {
          const key = `${nb}|${after}`;
          if (visited.has(key)) continue;
          visited.add(key);
          prev.set(key, { player, key: `${player}|${next}` });
          if (nb === targetId) {
            // reconstruct
            const path = [nb];
            let curKey = key;
            while (curKey !== startKey) {
              const p = prev.get(curKey)!;
              path.push(p.player);
              curKey = p.key;
            }
            return path.reverse();
          }
          nextFrontier.push({ player: nb, next: after });
        }
      }
      frontier = nextFrontier;
      links++;
    }
    return null;
  }

  /**
   * Alternation-constrained shortest distances (in links) from `startId` to
   * every reachable player, respecting the college→team→… alternation off the
   * seed. This is the par a human can ACTUALLY achieve (the unconstrained BFS
   * par can be lower than any legal alternating path). Returns min links per
   * player id.
   */
  alternationDistances(startId: string, firstLink: LinkType = "college", maxLinks = 8): Map<string, number> {
    const best = new Map<string, number>([[startId, 0]]);
    const visited = new Set<string>([`${startId}|${firstLink}`]);
    let frontier: Array<{ player: string; next: LinkType }> = [{ player: startId, next: firstLink }];
    let links = 0;
    while (frontier.length && links < maxLinks) {
      const nextFrontier: Array<{ player: string; next: LinkType }> = [];
      for (const { player, next } of frontier) {
        const neighbors = next === "college" ? this.collegeNeighbors(player) : this.teamNeighbors(player);
        const after: LinkType = next === "college" ? "team" : "college";
        for (const nb of neighbors) {
          const key = `${nb}|${after}`;
          if (visited.has(key)) continue;
          visited.add(key);
          if (!best.has(nb) || best.get(nb)! > links + 1) best.set(nb, links + 1);
          nextFrontier.push({ player: nb, next: after });
        }
      }
      frontier = nextFrontier;
      links++;
    }
    return best;
  }

  /** Size of the largest connected component + count of orphans (no links). */
  connectivityStats(): { largestComponent: number; orphans: number; components: number } {
    const seen = new Set<string>();
    let largest = 0;
    let orphans = 0;
    let components = 0;
    for (const p of this.snapshot.players) {
      if (seen.has(p.id)) continue;
      // BFS this component.
      let size = 0;
      const stack = [p.id];
      seen.add(p.id);
      while (stack.length) {
        const id = stack.pop()!;
        size++;
        for (const nb of this.allNeighbors(id)) {
          if (!seen.has(nb)) {
            seen.add(nb);
            stack.push(nb);
          }
        }
      }
      components++;
      if (size === 1) orphans++;
      if (size > largest) largest = size;
    }
    return { largestComponent: largest, orphans, components };
  }
}
