import type { ChainLink } from "@/lib/types";

/**
 * The connector between two cards: a drawn vertical line + a badge showing the
 * matched college/team with its 🎓/🏀 icon. College links are cool-blue, team
 * links amber — the same functional coding used on the turn prompt.
 */
export function ConnectorBadge({ link }: { link: ChainLink }) {
  const isCollege = link.linkType === "college";
  const color = isCollege
    ? "border-college-dim bg-college/10 text-college"
    : "border-team-dim bg-team/10 text-team";
  const line = isCollege ? "bg-college/40" : "bg-team/40";
  return (
    <div className="flex flex-col items-center py-1" aria-hidden="false">
      <span className={`h-3 w-px origin-top animate-draw-line ${line}`} />
      <span
        className={`rounded-full border ${color} px-3 py-1 text-xs font-semibold uppercase tracking-wide`}
      >
        <span aria-hidden="true">{link.icon} </span>
        {link.matchedValue}
      </span>
      <span className={`h-3 w-px origin-top animate-draw-line ${line}`} />
    </div>
  );
}
