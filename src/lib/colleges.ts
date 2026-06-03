/**
 * College-name canonicalization.
 *
 * The source data labels the same school inconsistently (e.g. Jason Kidd =
 * "California" but Ivan Rabb = "University of California, Berkeley"), which would
 * split one school into two graph nodes and break legitimate college links.
 *
 * We fix this with a CURATED alias map rather than fuzzy matching, because
 * fuzzy rules both over-merge distinct schools (Boston College ≠ Boston
 * University; College of Charleston ≠ University of Charleston) and miss real
 * equivalences (California = UC Berkeley). Each entry below was confirmed
 * against the actual ingested data. Canonical form = the variant most players
 * already use. Add new equivalences here as they surface.
 */

/** canonical display name -> the variant strings that mean the same school */
const CANONICAL_TO_ALIASES: Record<string, string[]> = {
  California: ["University of California, Berkeley"],
  Texas: ["University of Texas at Austin", "Texas-Austin"],
  Colorado: ["University of Colorado Boulder"],
  Dayton: ["University of Dayton"],
  American: ["American University"],
  Campbell: ["Campbell University"],
  Rider: ["Rider University"],
  "Saint Mary's": ["St. Mary's", "St. Mary's College"],
  "Southern California": ["USC"],
  "Central Florida": ["UCF"],
  TCU: ["Texas Christian"],
};

/** Normalize for matching: accent-stripped, lowercased, punctuation-collapsed. */
function aliasKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ALIAS_LOOKUP = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(CANONICAL_TO_ALIASES)) {
  ALIAS_LOOKUP.set(aliasKey(canonical), canonical); // canonical maps to itself
  for (const a of aliases) ALIAS_LOOKUP.set(aliasKey(a), canonical);
}

/**
 * Canonicalize a raw college string. Returns null for empty/missing values.
 * Unknown names pass through trimmed (so the map only ever merges, never drops).
 */
export function canonicalCollege(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return ALIAS_LOOKUP.get(aliasKey(trimmed)) ?? trimmed;
}
