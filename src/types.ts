/**
 * The graph model emitted as the snapshot. This is the single contract shared
 * between the ingestion pipeline (Prompt A) and the game (Prompt B).
 */

export interface Player {
  id: string;
  name: string;
  /** Lowercased, accent-stripped canonical key for search. */
  searchKey: string;
  /** Known aliases (nicknames, Jr./III variants, accent-stripped forms). */
  aliases: string[];
  /** May be null/empty for prep-to-pro or international players. */
  college: string | null;
  /** Team ids the player has appeared with (shallow = current only). */
  teams: string[];
}

export interface Team {
  id: string;
  name: string;
  abbr: string;
  /** Inverted index: every player who has appeared with this team. */
  playerIds: string[];
}

export interface College {
  id: string;
  name: string;
  /** Inverted index: every player who attended this college. */
  playerIds: string[];
}

export type TeamHistoryDepth = "full" | "shallow";

export interface GraphSnapshot {
  /** ISO timestamp of build — also the snapshot version. */
  version: string;
  /** League id, e.g. "nba". */
  league: string;
  /** "full" if derived from career stats; "shallow" if current-team-only. */
  teamHistoryDepth: TeamHistoryDepth;
  /** Why the depth is what it is — surfaced in logs and (softened) in the UI. */
  teamHistoryNote: string;
  players: Player[];
  teams: Team[];
  colleges: College[];
}
