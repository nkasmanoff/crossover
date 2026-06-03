import type { LinkType } from "./types";

/**
 * The link type for the NEXT move given the current chain length.
 * College off the seed, then alternating: the link joining chain[i]→chain[i+1]
 * is college when i is even. A candidate joins at index = chainLength, so its
 * incoming link index is chainLength-1.
 *
 * This mirrors the server's authoritative derivation (app/api/move) so the UI
 * can label the turn prompt without trusting or duplicating server state.
 */
export function linkTypeForChainLength(chainLength: number): LinkType {
  return (chainLength - 1) % 2 === 0 ? "college" : "team";
}
