# Crossover — Build Prompts for Claude Code

A daily sports association-chain game. Starting from one player, you build a chain where each step links to the previous player by a **shared college** (🎓) or a **shared pro team** (🏀), alternating link types. Player/college/team data comes from an external trusted API and is refreshed on a schedule so it never goes stale.

Hand these to Claude Code in order: **Prompt A** builds the data pipeline + verified graph; **Prompt B** builds the game on top of it. They're separate so each is independently testable — do not start B until A's snapshot validates.

## Data source decision (read first)

- **Primary API: BALLDONTLIE** (`https://api.balldontlie.io`). Chosen because its NBA player records include a `college` field plus the current `team` — the college→pro link that most sports APIs lack. Auth is an API key sent in the `Authorization` header; there's a free tier (rate-limited) and paid tiers. It also serves NFL, MLB, NHL, EPL, WNBA, NCAAF, NCAAB through the same shape, so adding leagues later is config, not a rewrite.
- **The catch:** the player object exposes only a player's *current* team. **Team history must be derived** during ingestion from the stats / season-averages endpoints (collect the distinct teams a player appears with across seasons). College never changes; current team changes with trades — both are kept fresh by re-running ingestion on a schedule.
- **Verify before building:** confirm current base URL, endpoint paths, auth, rate limits, and which historical endpoints your plan includes at https://docs.balldontlie.io — deep team history may require a paid tier. Keep all of this in one config file.
- **Architecture rule:** never call the sports API at play time. Ingest into your own graph snapshot on a schedule; the game validates moves against that snapshot (fast, offline, accurate). No LLM is involved in deciding whether two players are connected — connections are data, not generation.

---

# PROMPT A — Data pipeline & verified graph

```
Build the data layer for "Crossover," a sports association-chain game. This task ONLY builds the ingestion pipeline and the graph it produces. No game UI yet.

GOAL
Produce a versioned, self-contained GRAPH SNAPSHOT of players, colleges, and pro teams that the game can load and query offline. Refresh it on a schedule so it never goes stale.

TECH
- TypeScript. A Node ingestion script (run locally and on a schedule). Output is a static JSON snapshot (committed or written to object storage / a KV store — make the sink swappable behind an interface).
- HTTP client with retry + exponential backoff + concurrency limiting (respect API rate limits).

DATA SOURCE: BALLDONTLIE (https://api.balldontlie.io). API key in env BALLDONTLIE_API_KEY, sent as the `Authorization` header, SERVER-SIDE ONLY. Centralize base URL, league path, endpoints, and rate-limit settings in /src/config.ts. Start with the NBA league path; structure the code so other leagues plug in via config.

INGESTION STEPS
1. Fetch ALL players (paginate fully; include historical players, not just active). Capture: external id, full name, college (may be null/empty for prep-to-pro or international players), current team.
2. Derive TEAM HISTORY per player: the player record only has the current team, so query the most efficient available endpoint that exposes team-by-season (season averages or game stats) and collect the DISTINCT teams the player has appeared with across their career. Cache per-player results and make this step incremental (skip players already resolved unless --full is passed) to stay within rate limits. If historical data isn't available on the current plan, fall back to current-team-only and clearly flag the snapshot as "shallow team history."
3. Normalize names: a canonical display name + a lowercased search key + an array of known aliases (nicknames, "Jr."/"III" variants, accent-stripped forms) for autocomplete matching later.

GRAPH MODEL (emit as the snapshot)
  interface Player { id:string; name:string; searchKey:string; aliases:string[]; college:string|null; teams:string[]; }  // teams = team ids
  interface Team   { id:string; name:string; abbr:string; playerIds:string[]; }
  interface College{ id:string; name:string; playerIds:string[]; }
  interface GraphSnapshot {
    version:string;        // ISO timestamp of build
    league:string;         // "nba"
    teamHistoryDepth:"full"|"shallow";
    players:Player[]; teams:Team[]; colleges:College[];
  }
Also emit prebuilt adjacency to make validation O(1): for each college, its playerIds; for each team, its playerIds (already above). The game will use these inverted indexes.

VALIDATION & QUALITY GATES (fail the build loudly if these don't hold)
- Every player.teams id resolves to a real team; every non-null college resolves to a college node.
- Connectivity sanity: the share-college and share-team relations form a largely connected graph (report the size of the largest connected component and the count of orphan players with no links — orphans are fine to keep but log the number).
- Spot-check fixtures: assert a handful of KNOWN truths so a bad ingest is caught early, e.g. Stephen Curry.college === "Davidson"; Kevin Durant.teams includes the Thunder/Oklahoma City and the Warriors; JJ Redick.college === "Duke". Keep these in /src/fixtures.ts and run them as part of the build.
- Write a SUMMARY to stdout: player/team/college counts, teamHistoryDepth, largest component size, orphan count, build duration.

SCHEDULING / FRESHNESS
- Provide an `npm run ingest` (incremental) and `npm run ingest:full`.
- Provide a scheduled entrypoint (e.g. a Vercel Cron route or a GitHub Action) that re-ingests on a cadence (suggest weekly in-season, plus a manual trigger after trade deadlines) and bumps `version`. College is immutable; this mainly refreshes current-team/roster changes.
- The game must always load the LATEST valid snapshot and never a half-written one (write to a temp key, validate, then atomically promote).

ACCEPTANCE CRITERIA
- `npm run ingest:full` produces a snapshot that passes all quality gates and fixtures.
- The snapshot is loadable by a tiny demo script that, given two player names, prints whether they share a college and/or a team and which one — proving the graph answers the only question the game asks.
- API key never appears client-side; all network calls are server/script-side.
```

---

# PROMPT B — The game (on top of the Prompt A graph)

```
Build "Crossover," a daily sports association-chain game, on top of the graph snapshot from the data pipeline (Prompt A is done; reuse its GraphSnapshot and inverted indexes). A working visual mockup (crossover.html) defines the look and feel — match its aesthetic; this prompt re-specs the mechanics so it's self-contained.

TECH
- Next.js (App Router) + TypeScript + Tailwind. Deploy to Vercel.
- The graph snapshot loads server-side (from the committed JSON or KV). All chain validation happens server-side against the graph via an internal API route; the client never gets the full graph (keeps payload small and prevents trivial answer-scraping). The client only receives: an autocomplete index (names + ids, no answers) and per-move validation results.

GAME MECHANICS
- A chain starts from one seed player. Each turn the player names another player who links to the PREVIOUS player by the CURRENT link type. Link type ALTERNATES: college (🎓) → team (🏀) → college → … starting with college off the seed.
  - College link valid iff both players share the same college.
  - Team link valid iff the two players share at least one team (any era).
- A player may not be reused within a chain.
- Reveal which value matched (e.g. "Both played for the Warriors", "Both went to Duke").
- 3 misses ends the run. A miss = submitting a real player who does NOT satisfy the current link. Submitting an unknown name or an already-used player is a soft block (no miss, friendly toast).
- 3 hints: a hint reveals one valid next player computed from the graph. A "stuck — reveal & end" button ends the run and shows a valid link they could have played.

TWO MODES
- ENDLESS (the mockup's mode): chain as long as you can; score = chain length. Good casual/bonus mode.
- DAILY BRIDGE (the headline mode, drives sharing): everyone gets the same START and TARGET player for the day and must connect them. Compute the true shortest path with BFS over the graph at generation time so the puzzle has a real "PAR" (fewest links). Pick start/target pairs with a par of ~3–5 and verify solvability before publishing. Score = links used vs par. Make the daily deterministic by date (seeded selection) and cache it.
- Lead the home screen with Daily Bridge; offer Endless as a secondary mode.

SERVER ROUTES
- GET /api/autocomplete?q=... → up to ~8 name matches (id + display name + a subtle disambiguator like college or recent team). Match on searchKey + aliases; accent-insensitive.
- POST /api/move { mode, chainIds:[...], candidateId, linkType } → { ok, matchedValue?, reason? } validated against the graph. Never trust the client's notion of validity.
- GET /api/daily → today's { startId, targetId, par } (no path leaked).
- GET /api/validate-path (server-internal, for daily generation/BFS) — not exposed publicly.

UI / UX (match crossover.html)
- Dark broadcast aesthetic: near-black background with a warm radial "stadium light" glow + faint grain; Bebas Neue scoreboard display + Barlow Condensed for names/UI. Hardwood-amber primary accent.
- Functional color coding: college links tinted cool blue, team links tinted amber, used consistently on connector badges and the turn prompt.
- The chain renders as a vertical ladder of player cards (rank number, big name, college pill + team pills) joined by connector badges showing the matched college/team with the 🎓/🏀 icon and a connecting line.
- Sticky bottom dock: the turn prompt ("Name a player who went to DUKE" / "…who shares a PRO TEAM with X"), an autocomplete text input (arrow-key + click selection), a Hint button with remaining count, and a "stuck — reveal & end" link. Scoreboard chips for current score + best (Daily also shows PAR). 3 basketball "miss" indicators that deplete.
- Animations: staggered load, new card pop-in, connector draw, shake on a miss. Respect prefers-reduced-motion. Full keyboard play; ARIA on the input, suggestions, and result modal; never color-only state cues.
- Game-over modal: final score (Daily: vs par), a recap of the chain, a SHARE button.

SHARE GRID (growth mechanic)
- Daily Bridge emoji result, NYT-style: title "Crossover Bridge — <date>", a row of 🟦 (college link) / 🟧 (team link) emoji, one per link used, plus "X links · par Y". Copy to clipboard / navigator.share. Never reveal the player names in the share text.

STALENESS / DATA
- Load the newest valid GraphSnapshot at build/runtime; surface its `version` and `teamHistoryDepth` in a small "data updated <date>" footer. If teamHistoryDepth is "shallow," soften team-link copy accordingly.
- No localStorage of answers; best score and streak may live in localStorage (no accounts in v1). The daily and validation are server-authoritative.

ACCEPTANCE CRITERIA
- Endless and Daily Bridge both playable. Daily has a real BFS-computed par and is identical for all users that day.
- Every connection shown to the player is backed by the graph (no client-side guessing of validity); autocomplete never leaks whether a name is a correct answer.
- Matches the mockup's look; fully keyboard accessible; share text copies and excludes player names.
- With the API/snapshot unavailable, the app loads the last good snapshot and still plays (it never needs the live API at play time).
```

---

# Notes & decisions

- **Why a snapshot, not live API calls:** validation is a pure graph lookup, so play is instant, free of rate limits, and works even if balldontlie is down. Freshness comes from re-ingesting on a schedule, not from per-move calls.
- **Team history is the load-bearing data task.** Budget for it: deriving distinct teams per player across seasons is the heaviest part of ingestion and may need a paid plan for full historical depth. The build degrades gracefully to current-team-only and labels itself, so you can ship shallow and deepen later.
- **Multi-sport later:** the same pipeline + game work for NFL/MLB/etc. via config. NBA first because its college data is cleanest (one-and-done era). Soccer has no college layer — for soccer you'd swap "college" for "national team" or "youth academy," which is a content/config change in the graph model, not new code.
- **Hand Claude Code the mockup.** Attach crossover.html alongside Prompt B so the agent matches the approved design exactly rather than reinventing it.