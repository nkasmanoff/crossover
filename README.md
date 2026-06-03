# Crossover

A daily sports association-chain game (NBA). Starting from one player, build a
chain where each step links to the previous player by a **shared college (🎓)**
or a **shared pro team (🏀)**, alternating link types. In Daily Bridge you
**win by bridging to the target** — your last played player must validly link to
the previous player, and share a college or pro team with the target (you do not
need to name the target).

Team history comes from a **pluggable data source** (`src/sources`):

- **`nba-stats` (default)** — the stats.nba.com endpoints (a.k.a. `nba_api`).
  Free and yields **full career team history**: `playerindex` (players +
  college + draft + current team) and `playercareerstats` (every team a player
  appeared with). Snapshot is `teamHistoryDepth: "full"`. ⚠️ These endpoints
  stall non-residential IPs and rate-limit hard, so **run the ingest from a
  residential connection** (a local machine), not CI/serverless. The full run
  derives ~5k players one request each, so it takes a while — but it's paced,
  retried, and **incremental/resumable** (cached per player).
- **`balldontlie` (fallback)** — one bulk call, but the free tier exposes only
  each player's **current/last team** → `teamHistoryDepth: "shallow"`. Fast and
  works from any IP; good for CI or a quick start.

Switch with `SOURCE=balldontlie npm run ingest`. The game reads whatever
snapshot is committed and surfaces its depth in the footer; on a `shallow`
snapshot it softens the team-link copy ("team links use current rosters").

It's two independently-testable layers:

1. **Data pipeline (Prompt A)** — ingests players/colleges/teams into a
   verified, offline **graph snapshot** (`data/snapshot.json`) from the
   configured source. Refreshed on a schedule; never called at play time.
2. **The game (Prompt B)** — a Next.js app that validates every move
   server-side against that snapshot. The client never receives the full graph.

## Quick start

```bash
npm install

# Build the FULL-history snapshot from stats.nba.com (run on a residential IP).
# ~5k players, one request each, paced + resumable — leave it running.
npm run ingest:full

# Prove the graph answers the only question the game asks:
npm run demo -- "Kevin Durant" "Russell Westbrook"   # share the Thunder

# Play:
npm run dev   # http://localhost:3000
```

For a fast start that works from any network (CI included), use the shallow
BALLDONTLIE source instead (needs `BALLDONTLIE_API_KEY` in `.env`):

```bash
echo 'BALLDONTLIE_API_KEY=your-key' > .env
SOURCE=balldontlie npm run ingest:full   # ~10 min, 5 req/min, shallow history
```

## Data sources

Everything source-specific lives in [`src/config.ts`](src/config.ts) and
[`src/sources/`](src/sources). The ingester consumes a `PlayerSource`
(`fetchTeams` / `fetchPlayers` / optional `fetchTeamHistory`) and is otherwise
source-agnostic, so adding a league or provider is a new module, not a rewrite.

| Source | History | IP needs | Notes |
| --- | --- | --- | --- |
| `nba-stats` *(default)* | **full** | residential | `playerindex` + `playercareerstats`; every franchise a player appeared with. Slow but resumable. |
| `balldontlie` | shallow | any | one bulk call; free tier = current/last team only. Career stats are paid-tier. |

Both emit the identical `GraphSnapshot`; only `teamHistoryDepth` differs.

## Architecture rule

The sports API is **never** called at play time. Validation is a pure graph
lookup against the snapshot — instant, offline, rate-limit-free, and unaffected
if BALLDONTLIE is down. No LLM decides whether two players are connected;
connections are data.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run ingest` | Incremental ingest (reuses team-history cache). |
| `npm run ingest:full` | Full re-ingest; bumps `version`, runs all quality gates + fixtures. |
| `npm run demo -- "A" "B"` | Print whether two players share a college and/or team. |
| `npm run dev` / `build` / `start` | Next.js app. |
| `npm run typecheck` | `tsc --noEmit`. |

## Snapshot freshness

A **GitHub Action** ([`.github/workflows/ingest.yml`](.github/workflows/ingest.yml))
provides a manual `workflow_dispatch` refresh with `source` + `full` inputs; it
commits the refreshed `data/snapshot.json` + `data/notable.json`. Because the
default `nba-stats` source stalls on datacenter IPs, CI can only run the shallow
`balldontlie` source (set `BALLDONTLIE_API_KEY` as a repo secret) — refresh the
**full**-history snapshot locally on a residential connection, or point the job
at a self-hosted runner. The sink writes to a temp file and atomically promotes
only a **validated** snapshot, so the game never loads a half-written one.

The storage backend is swappable behind `SnapshotSink`
([`src/lib/sink.ts`](src/lib/sink.ts)) — drop in an object-store/KV
implementation without touching ingestion.

## Graph model

```ts
interface Player  { id; name; searchKey; aliases[]; college|null; teams[] }
interface Team    { id; name; abbr; playerIds[] }
interface College { id; name; playerIds[] }
interface GraphSnapshot {
  version; league; teamHistoryDepth: "full"|"shallow";
  players[]; teams[]; colleges[];
}
```

The inverted indexes (`team.playerIds`, `college.playerIds`) make connection
checks O(1)-ish — see [`src/lib/graph.ts`](src/lib/graph.ts).

## Server routes (game)

- `GET /api/autocomplete?q=` — ≤8 name matches (id + name + subtle hint). No answer leak.
- `POST /api/move` — server-authoritative move validation against the graph.
- `GET /api/daily` — today's `{ startId, targetId, par }` (path never leaked).
- `GET /api/seed` — a fresh start player for Endless.
- `POST /api/hint` — one valid next player computed from the graph.
- `GET /api/validate-path` — server-internal (token-gated) BFS check.

## Modes

- **Daily Bridge** (headline): everyone gets the same start + target for the
  day; connect them. Par = the **alternation-constrained** shortest path
  (college→team→…, the fewest links actually playable), computed at generation
  time and verified solvable. Deterministic by date. Share a name-free emoji grid.
- **Endless**: chain as long as you can; score = chain length.
# crossover
