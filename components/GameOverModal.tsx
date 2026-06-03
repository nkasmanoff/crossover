"use client";

import { useEffect, useRef, useState } from "react";
import type { ChainNode, Mode } from "@/lib/types";
import { buildShareText, shareOrCopy } from "@/lib/share";

/**
 * Game-over modal: final score (Daily: vs par), a recap of the chain, and a
 * SHARE button. Share text is the emoji grid only — never player names.
 * Focus is trapped to the dialog and Escape/Play-again restart.
 */
export function GameOverModal({
  mode,
  nodes,
  par,
  date,
  solved,
  revealNode,
  onPlayAgain,
  onClose,
}: {
  mode: Mode;
  nodes: ChainNode[];
  par?: number;
  date?: string;
  solved: boolean;
  /** Optional "a valid link you could have played" recap for reveal-and-end. */
  revealNode?: { name: string; via?: ChainNode["via"] } | null;
  onPlayAgain: () => void;
  onClose: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "shared" | "copied" | "failed">("idle");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const links = nodes.length - 1;
  const isDaily = mode === "daily";

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = isDaily
    ? solved
      ? "Bridge complete!"
      : "Run ended"
    : "Run ended";

  const scoreLine = isDaily
    ? solved
      ? `${links} link${links === 1 ? "" : "s"} · par ${par}`
      : `Unsolved · par ${par}`
    : `Chain of ${links}`;

  async function doShare() {
    const text = isDaily
      ? buildShareText({ date: date ?? "", nodes, par: par ?? 0, solved })
      : `Crossover Endless — chain of ${links}\nplay: crossover`;
    setCopyState(await shareOrCopy(text));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-up"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="go-title"
        className="w-full max-w-md rounded-2xl border border-court-line bg-court-panel p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <h2 id="go-title" className="font-display text-4xl tracking-wide text-amber-hard text-glow">
            {title}
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-white/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        <p className="mt-1 font-condensed text-xl text-white/80">{scoreLine}</p>

        {isDaily && (
          <div className="mt-3 text-2xl tracking-widest" aria-hidden="true">
            {nodes.slice(1).map((n, i) => (
              <span key={i}>{n.via?.linkType === "college" ? "🟦" : "🟧"}</span>
            ))}
          </div>
        )}

        {revealNode && (
          <p className="mt-3 rounded-lg border border-court-line bg-court-black/50 px-3 py-2 text-sm text-white/70">
            A link you could have played:{" "}
            <span className="font-semibold text-white">{revealNode.name}</span>
            {revealNode.via && (
              <>
                {" "}
                <span className="text-white/50">
                  ({revealNode.via.icon} {revealNode.via.matchedValue})
                </span>
              </>
            )}
          </p>
        )}

        {/* Chain recap (names visible in-app; only the share text omits them). */}
        <div className="mt-4 max-h-44 overflow-auto rounded-lg border border-court-line bg-court-black/40 p-3">
          <ol className="space-y-1">
            {nodes.map((n, i) => (
              <li key={n.card.id} className="font-condensed text-sm text-white/80">
                {n.via && (
                  <span className="mr-1 text-white/40">
                    {n.via.icon} {n.via.matchedValue} →
                  </span>
                )}
                <span className="font-semibold text-white">{n.card.name}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={doShare}
            className="flex-1 rounded-xl bg-amber-hard px-4 py-2 font-display text-xl tracking-wide text-court-black hover:bg-amber-glow"
          >
            {copyState === "copied" ? "Copied!" : copyState === "shared" ? "Shared!" : copyState === "failed" ? "Copy failed" : "Share"}
          </button>
          {mode === "endless" && (
            <button
              onClick={onPlayAgain}
              className="flex-1 rounded-xl border border-court-line px-4 py-2 font-display text-xl tracking-wide text-white hover:bg-white/5"
            >
              Play again
            </button>
          )}
        </div>
        {copyState !== "idle" && (
          <p className="mt-2 text-center text-xs text-white/40" role="status">
            {copyState === "copied" && "Result copied to clipboard (no names)."}
            {copyState === "shared" && "Shared!"}
            {copyState === "failed" && "Couldn't access clipboard."}
          </p>
        )}
      </div>
    </div>
  );
}
