import type { ChainNode, PlayerCardData } from "@/lib/types";
import { PlayerCard } from "./PlayerCard";
import { ConnectorBadge } from "./ConnectorBadge";

/**
 * The chain rendered as a vertical ladder of player cards joined by connector
 * badges. In Daily mode the target is pinned at the bottom as a goal card.
 */
export function ChainLadder({
  nodes,
  target,
  reached,
  newestId,
}: {
  nodes: ChainNode[];
  target?: PlayerCardData | null;
  reached?: boolean;
  newestId?: string;
}) {
  return (
    <ol className="flex flex-col" aria-label="Player chain">
      {nodes.map((node, i) => (
        <li key={node.card.id} className="flex flex-col">
          {node.via && <ConnectorBadge link={node.via} />}
          <PlayerCard
            card={node.card}
            rank={i + 1}
            tone={i === 0 ? "start" : "default"}
            label={i === 0 ? "START" : undefined}
            isNew={node.card.id === newestId}
          />
        </li>
      ))}

      {target && !reached && (
        <li className="flex flex-col">
          <div className="flex flex-col items-center py-1 opacity-60" aria-hidden="true">
            <span className="h-3 w-px bg-white/20" />
            <span className="text-white/30">⋮</span>
            <span className="h-3 w-px bg-white/20" />
          </div>
          <PlayerCard card={target} tone="target" label="TARGET" />
        </li>
      )}
    </ol>
  );
}
