/**
 * Pluggable data-source abstraction.
 *
 * The ingester consumes a PlayerSource and knows nothing about which API it is.
 * Adding a league or provider = a new implementation here, not a rewrite. Each
 * source emits normalized records; the ingester turns those into the canonical
 * GraphSnapshot (names, aliases, college nodes, inverted indexes, validation).
 */

export interface SourceTeam {
  id: string;
  name: string;
  abbr: string;
}

export interface SourcePlayer {
  id: string;
  firstName: string;
  lastName: string;
  /** May be null/empty for prep-to-pro or international players. */
  college: string | null;
  /** Current (or latest) team id; may be null for never-rostered players. */
  currentTeamId: string | null;
  /** Draft position — used only to rank "notable" daily seeds. */
  draftRound: number | null;
  draftNumber: number | null;
  /** Last season played (e.g. 2025). Recency signal for "notable" seeds. */
  toYear: number | null;
}

/** A team reference discovered while deriving history (id + abbr, name optional). */
export interface TeamRef {
  id: string;
  abbr: string;
  name?: string;
}

export interface PlayerSource {
  /** Stable id, e.g. "balldontlie" | "nba-stats". */
  id: string;
  label: string;
  /** True if fetchTeamHistory derives full career team history. */
  supportsFullHistory: boolean;
  /** Human note describing the depth/limitation, surfaced in the snapshot. */
  teamHistoryNote: string;

  fetchTeams(): Promise<SourceTeam[]>;
  fetchPlayers(): Promise<SourcePlayer[]>;
  /**
   * Distinct career teams for a player. Present iff supportsFullHistory.
   * Returns refs so the ingester can mint team nodes for franchises that don't
   * appear in fetchTeams() (e.g. long-defunct teams).
   */
  fetchTeamHistory?(playerId: string): Promise<TeamRef[]>;
}
