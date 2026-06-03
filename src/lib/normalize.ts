/**
 * Name normalization for search + autocomplete matching.
 *
 * Produces, for a player:
 *  - a canonical display name (cleaned of stray whitespace),
 *  - a lowercased, accent-stripped search key,
 *  - an array of known aliases (accent-stripped form, suffix-free form,
 *    last-name-only, and first-initial-last forms) for fuzzy matching.
 */

/** Strip diacritics: "Dončić" -> "Doncic", "Nikola Jokić" -> "Nikola Jokic". */
export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Lowercased, accent-stripped, punctuation-collapsed key. */
export function toSearchKey(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Canonical college node id. Raw college strings vary ("St. John's (NY)" vs
 * "St. John's (N.Y.)"); slugging the search key merges those variants into one
 * node. Used by BOTH the ingester (when building nodes) and the validator (when
 * checking referential integrity) so they agree.
 */
export function collegeId(name: string): string {
  return "col_" + toSearchKey(name).replace(/\s+/g, "-");
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

export function canonicalName(first: string, last: string): string {
  return `${first} ${last}`.replace(/\s+/g, " ").trim();
}

/**
 * Build a de-duplicated alias list for matching. Includes:
 *  - the accent-stripped full name,
 *  - the name without a trailing suffix (Jr./III/...),
 *  - last name only,
 *  - first-initial + last (e.g. "s curry").
 */
export function buildAliases(name: string): string[] {
  const aliases = new Set<string>();
  const baseKey = toSearchKey(name);
  aliases.add(baseKey);

  const tokens = baseKey.split(" ").filter(Boolean);
  if (tokens.length === 0) return [];

  // Suffix-free variant.
  const noSuffix = tokens.filter((t) => !SUFFIXES.has(t));
  if (noSuffix.length && noSuffix.length !== tokens.length) {
    aliases.add(noSuffix.join(" "));
  }

  const core = noSuffix.length ? noSuffix : tokens;
  const last = core[core.length - 1];
  const first = core[0];

  // Last name only (common search shorthand).
  if (last && core.length > 1) aliases.add(last);
  // First-initial + last (e.g. "s curry").
  if (first && last && core.length > 1) aliases.add(`${first[0]} ${last}`);

  // Don't keep the base key duplicated as an "alias" of itself for callers
  // that store searchKey separately — but harmless to include; the game dedupes.
  aliases.delete("");
  return [...aliases];
}
