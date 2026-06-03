import type { PlayerCardData } from "@/lib/types";

/**
 * A player card in the chain ladder: rank number, big condensed-display name,
 * a cool-blue college pill, and amber team pills. `tone` highlights the daily
 * start (green-ish) / target (amber) endpoints.
 */
export function PlayerCard({
  card,
  rank,
  tone = "default",
  label,
  isNew = false,
}: {
  card: PlayerCardData;
  rank?: number;
  tone?: "default" | "start" | "target";
  label?: string;
  isNew?: boolean;
}) {
  const ring =
    tone === "start"
      ? "ring-1 ring-emerald-400/40 bg-emerald-950/20"
      : tone === "target"
        ? "ring-1 ring-amber-hard/50 bg-amber-hard/5"
        : "ring-1 ring-court-line bg-court-panel/70";

  return (
    <div
      className={`relative rounded-xl ${ring} px-4 py-3 backdrop-blur-sm ${isNew ? "animate-pop-in" : ""}`}
    >
      {label && (
        <span className="absolute -top-2 left-3 rounded bg-court-black px-2 text-[0.6rem] font-semibold uppercase tracking-widest text-white/50">
          {label}
        </span>
      )}
      <div className="flex items-baseline gap-3">
        {rank != null && (
          <span className="font-display text-2xl leading-none text-white/30 tabular-nums">
            {rank}
          </span>
        )}
        <span className="font-display text-2xl leading-none tracking-wide text-white sm:text-3xl">
          {card.name}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {card.college && (
          <span className="rounded-full border border-college-dim bg-college/10 px-2 py-0.5 text-xs font-medium text-college">
            🎓 {card.college}
          </span>
        )}
        {card.teams.length === 0 && !card.college && (
          <span className="text-xs italic text-white/30">no college/team data</span>
        )}
        {card.teams.map((t) => (
          <span
            key={t.id}
            title={t.name}
            className="rounded-full border border-team-dim bg-team/10 px-2 py-0.5 text-xs font-medium text-team/90"
          >
            🏀 {t.abbr}
          </span>
        ))}
      </div>
    </div>
  );
}
