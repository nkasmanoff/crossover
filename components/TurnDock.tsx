"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { LinkType, PlayerCardData, SearchHit } from "@/lib/types";

/**
 * Sticky bottom dock: the turn prompt, an accessible autocomplete combobox
 * (arrow-key + click selection, ARIA), a Hint button with remaining count, and
 * a "stuck — reveal & end" link. Functional color coding matches the link type.
 */
export function TurnDock({
  linkType,
  prevCard,
  hintsLeft,
  disabled,
  onSubmit,
  onHint,
  onReveal,
}: {
  linkType: LinkType;
  prevCard: PlayerCardData;
  hintsLeft: number;
  disabled: boolean;
  onSubmit: (hit: SearchHit) => void;
  onHint: () => void;
  onReveal: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const reqSeq = useRef(0);

  const isCollege = linkType === "college";
  const accent = isCollege ? "text-college" : "text-team";
  const ring = isCollege ? "focus-within:ring-college/60" : "focus-within:ring-team/60";

  const prompt = isCollege
    ? prevCard.college
      ? <>Name a player who went to <span className={`font-bold ${accent}`}>{prevCard.college.toUpperCase()}</span></>
      : <>Name a player who shares a <span className={`font-bold ${accent}`}>COLLEGE</span> with {prevCard.name}</>
    : <>Name a player who shares a <span className={`font-bold ${accent}`}>PRO TEAM</span> with {prevCard.name}</>;

  // Debounced autocomplete fetch.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const seq = ++reqSeq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as { results: SearchHit[] };
        if (seq !== reqSeq.current) return; // stale
        setResults(data.results);
        setActive(data.results.length ? 0 : -1);
        setOpen(true);
      } catch {
        /* offline / transient — leave previous results */
      }
    }, 140);
    return () => clearTimeout(t);
  }, [query]);

  const choose = useCallback(
    (hit: SearchHit) => {
      onSubmit(hit);
      setQuery("");
      setResults([]);
      setOpen(false);
      setActive(-1);
      inputRef.current?.focus();
    },
    [onSubmit],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) {
      if (e.key === "Enter" && query.trim().length >= 2) e.preventDefault();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[active] ?? results[0];
      if (hit) choose(hit);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="pointer-events-auto w-full">
      <div
        aria-live="polite"
        className="mb-2 text-center font-condensed text-base text-white/80 sm:text-lg"
      >
        {prompt}
      </div>

      <div className="relative">
        {open && results.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Player suggestions"
            className="absolute bottom-full mb-2 max-h-64 w-full overflow-auto rounded-xl border border-court-line bg-court-panel/95 p-1 shadow-2xl backdrop-blur"
          >
            {results.map((hit, i) => (
              <li
                key={hit.id}
                id={`opt-${hit.id}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(hit);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2 ${
                  i === active ? "bg-white/10" : ""
                }`}
              >
                <span className="font-condensed text-lg text-white">{hit.name}</span>
                {hit.hint && <span className="text-xs text-white/40">{hit.hint}</span>}
              </li>
            ))}
          </ul>
        )}

        <div
          className={`flex items-center gap-2 rounded-xl border border-court-line bg-court-black/80 px-3 py-2 ring-2 ring-transparent ${ring}`}
        >
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 && results[active] ? `opt-${results[active].id}` : undefined}
            aria-label={isCollege ? "Name a player by shared college" : "Name a player by shared pro team"}
            autoComplete="off"
            disabled={disabled}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => results.length && setOpen(true)}
            placeholder="Type a player's name…"
            className="min-w-0 flex-1 bg-transparent font-condensed text-lg text-white placeholder:text-white/30 focus:outline-none disabled:opacity-40"
          />
          <button
            type="button"
            onClick={onHint}
            disabled={disabled || hintsLeft <= 0}
            className="shrink-0 rounded-lg border border-amber-hard/40 bg-amber-hard/10 px-3 py-1 text-sm font-semibold text-amber-hard disabled:opacity-30"
          >
            Hint
            <span className="ml-1 tabular-nums text-amber-hard/70">{hintsLeft}</span>
          </button>
        </div>
      </div>

      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={onReveal}
          disabled={disabled}
          className="text-xs uppercase tracking-widest text-white/40 underline-offset-2 hover:text-white/70 hover:underline disabled:opacity-30"
        >
          stuck — reveal &amp; end
        </button>
      </div>
    </div>
  );
}
