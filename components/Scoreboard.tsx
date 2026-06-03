/** Scoreboard chips: current score + best, plus PAR in Daily mode. */
export function Scoreboard({
  score,
  best,
  par,
}: {
  score: number;
  best?: number;
  par?: number;
}) {
  return (
    <div className="flex items-stretch gap-2">
      <Chip label="Chain" value={score} accent />
      {par != null && <Chip label="Par" value={par} />}
      {best != null && <Chip label="Best" value={best} />}
    </div>
  );
}

function Chip({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`flex min-w-[3.5rem] flex-col items-center rounded-lg border px-3 py-1 ${
        accent ? "border-amber-hard/40 bg-amber-hard/10" : "border-court-line bg-court-panel/60"
      }`}
    >
      <span className="text-[0.6rem] font-semibold uppercase tracking-widest text-white/45">
        {label}
      </span>
      <span
        className={`font-display text-2xl leading-none tabular-nums ${
          accent ? "text-amber-hard text-glow" : "text-white/85"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** Three basketball "miss" indicators that deplete. */
export function Misses({ misses, max = 3 }: { misses: number; max?: number }) {
  return (
    <div
      className="flex items-center gap-1"
      role="status"
      aria-label={`${misses} of ${max} misses used`}
    >
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`text-xl transition-opacity ${i < misses ? "opacity-25 grayscale" : "opacity-100"}`}
          title={i < misses ? "miss" : "remaining"}
        >
          🏀
        </span>
      ))}
    </div>
  );
}
