/** Client-safe shapes shared between the API routes and the React components. */

export type LinkType = "college" | "team";

export interface PlayerCardData {
  id: string;
  name: string;
  college: string | null;
  teams: { id: string; abbr: string; name: string }[];
}

export interface MoveResponse {
  ok: boolean;
  status: "ok" | "miss" | "unknown" | "reused";
  linkType: LinkType;
  matchedValue?: string;
  matchedIcon?: "🎓" | "🏀";
  reachedTarget?: boolean;
  reason?: string;
  card?: PlayerCardData;
}

export interface SearchHit {
  id: string;
  name: string;
  hint: string;
}

export interface DailyData {
  date: string;
  startId: string;
  targetId: string;
  par: number;
  startCard: PlayerCardData;
  targetCard: PlayerCardData;
}

export interface HintResponse {
  id?: string;
  name?: string;
  linkType: LinkType;
  matchedValue?: string;
  matchedIcon?: "🎓" | "🏀";
  none?: boolean;
}

export type Mode = "daily" | "endless";

/** A link in the rendered chain (the connector between two cards). */
export interface ChainLink {
  linkType: LinkType;
  matchedValue: string;
  icon: "🎓" | "🏀";
}

/** A node in the rendered chain. */
export interface ChainNode {
  card: PlayerCardData;
  /** The link that connected this node to the PREVIOUS one (undefined for seed). */
  via?: ChainLink;
}

export interface SnapshotMeta {
  version: string;
  league: string;
  teamHistoryDepth: "full" | "shallow";
  teamHistoryNote: string;
  players: number;
}
