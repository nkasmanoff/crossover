import type { ChainNode } from "./types";

/**
 * NYT-style emoji result for Daily Bridge. One square per link used:
 * 🟦 for a college link, 🟧 for a team link. Player NAMES are never included.
 */
export function buildShareText(opts: {
  date: string;
  nodes: ChainNode[];
  par: number;
  solved: boolean;
}): string {
  const { date, nodes, par, solved } = opts;
  const links = nodes.slice(1).map((n) => (n.via?.linkType === "college" ? "🟦" : "🟧"));
  const linksUsed = links.length;
  const grid = links.join("");
  const header = `Crossover Bridge — ${date}`;
  const scoreLine = solved
    ? `${linksUsed} link${linksUsed === 1 ? "" : "s"} · par ${par}`
    : `unsolved · par ${par}`;
  return `${header}\n${grid}\n${scoreLine}\nplay: crossover`;
}

/** Copy text to clipboard, preferring the share sheet on mobile. */
export async function shareOrCopy(text: string): Promise<"shared" | "copied" | "failed"> {
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ text });
      return "shared";
    }
  } catch {
    // user cancelled share sheet — fall through to copy
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
