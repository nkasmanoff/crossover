/**
 * BALLDONTLIE source. Free tier: bulk players (with college + current team) and
 * teams. Career-stats endpoints are paid-tier only, so this source provides
 * CURRENT-team data only → shallow team history. (Switch to the nba-stats source
 * for full career history.)
 */

import { apiUrl, config } from "../config.js";
import { getJson } from "../lib/http.js";
import type { PlayerSource, SourcePlayer, SourceTeam } from "./types.js";

interface RawTeam {
  id: number;
  full_name: string;
  abbreviation: string;
}
interface RawPlayer {
  id: number;
  first_name: string;
  last_name: string;
  college: string | null;
  team: RawTeam | null;
  draft_round: number | null;
  draft_number: number | null;
}
interface Paged<T> {
  data: T[];
  meta: { next_cursor?: number | null; per_page: number };
}

export const balldontlieSource: PlayerSource = {
  id: "balldontlie",
  label: "BALLDONTLIE (free tier)",
  supportsFullHistory: false,
  teamHistoryNote:
    "BALLDONTLIE free tier exposes only each player's current/last team; team links use that single team (shallow). Career-stats endpoints require a paid plan.",

  async fetchTeams(): Promise<SourceTeam[]> {
    const res = await getJson<Paged<RawTeam>>(apiUrl(config.endpoints.teams), {
      query: { per_page: 100 },
    });
    return res.data.map((t) => ({ id: String(t.id), name: t.full_name, abbr: t.abbreviation }));
  },

  async fetchPlayers(): Promise<SourcePlayer[]> {
    const players: SourcePlayer[] = [];
    let cursor: number | null | undefined = undefined;
    let page = 0;
    for (;;) {
      const res: Paged<RawPlayer> = await getJson<Paged<RawPlayer>>(apiUrl(config.endpoints.players), {
        query: { per_page: config.perPage, cursor },
      });
      for (const rp of res.data) {
        players.push({
          id: String(rp.id),
          firstName: rp.first_name,
          lastName: rp.last_name,
          college: rp.college,
          currentTeamId: rp.team ? String(rp.team.id) : null,
          draftRound: rp.draft_round,
          draftNumber: rp.draft_number,
          toYear: null, // not exposed by the BALLDONTLIE players endpoint
        });
      }
      page++;
      process.stdout.write(`  …players page ${page}: +${res.data.length} (total ${players.length})\n`);
      if (res.meta.next_cursor == null) break;
      cursor = res.meta.next_cursor;
    }
    return players;
  },
};
