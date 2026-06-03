"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChainNode,
  DailyData,
  HintResponse,
  Mode,
  MoveResponse,
  SearchHit,
  SnapshotMeta,
} from "@/lib/types";
import { ChainLadder } from "./ChainLadder";
import { TurnDock } from "./TurnDock";
import { Misses, Scoreboard } from "./Scoreboard";
import { GameOverModal } from "./GameOverModal";
import { linkTypeForChainLength } from "@/lib/linktype";

const MAX_MISSES = 3;
const MAX_HINTS = 3;

export function Game({
  daily,
  meta,
}: {
  daily: DailyData | null;
  meta: SnapshotMeta;
}) {
  const [mode, setMode] = useState<Mode>(daily ? "daily" : "endless");
  const [nodes, setNodes] = useState<ChainNode[]>([]);
  const [misses, setMisses] = useState(0);
  const [hintsLeft, setHintsLeft] = useState(MAX_HINTS);
  const [over, setOver] = useState(false);
  const [solved, setSolved] = useState(false);
  const [revealNode, setRevealNode] = useState<{ name: string; via?: ChainNode["via"] } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [newestId, setNewestId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [best, setBest] = useState<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shallow = meta.teamHistoryDepth === "shallow";

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // ---- run setup ----
  const startEndless = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/seed?salt=${Date.now()}`);
      const data = (await res.json()) as { id: string; name: string; card: ChainNode["card"] };
      setNodes([{ card: data.card }]);
    } catch {
      flashToast("Couldn't load a starting player. Check your snapshot.");
    } finally {
      setBusy(false);
    }
  }, [flashToast]);

  const resetRun = useCallback(
    (m: Mode) => {
      setMisses(0);
      setHintsLeft(MAX_HINTS);
      setOver(false);
      setSolved(false);
      setRevealNode(null);
      setNewestId(undefined);
      if (m === "daily" && daily) {
        setNodes([{ card: daily.startCard }]);
      } else {
        setNodes([]);
        void startEndless();
      }
    },
    [daily, startEndless],
  );

  // initialise on mount / mode change
  useEffect(() => {
    resetRun(mode);
    setBest(readBest(mode, daily?.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const links = Math.max(nodes.length - 1, 0);
  const linkType = linkTypeForChainLength(nodes.length);
  const prevCard = nodes[nodes.length - 1]?.card;

  // ---- actions ----
  const submit = useCallback(
    async (hit: SearchHit) => {
      if (over || busy || !prevCard) return;
      setBusy(true);
      try {
        const res = await fetch("/api/move", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode,
            chainIds: nodes.map((n) => n.card.id),
            candidateId: hit.id,
            targetId: mode === "daily" ? daily?.targetId : undefined,
          }),
        });
        const data = (await res.json()) as MoveResponse;

        if (data.status === "unknown" || data.status === "reused") {
          flashToast(data.reason ?? "Try another name.");
          return;
        }
        if (data.status === "miss") {
          const m = misses + 1;
          setMisses(m);
          setShakeKey((k) => k + 1);
          flashToast(data.reason ?? "Not a valid link.");
          if (m >= MAX_MISSES) endRun(false, null);
          return;
        }

        // ok
        const node: ChainNode = {
          card: data.card!,
          via: { linkType: data.linkType, matchedValue: data.matchedValue ?? "", icon: data.matchedIcon ?? "🏀" },
        };
        const nextNodes = [...nodes, node];
        setNodes(nextNodes);
        setNewestId(node.card.id);

        if (mode === "daily" && data.reachedTarget) {
          endRun(true, null, nextNodes);
        }
      } catch {
        flashToast("Network hiccup — your move wasn't recorded. Try again.");
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [over, busy, prevCard, mode, nodes, daily, misses, flashToast],
  );

  const useHint = useCallback(async () => {
    if (over || busy || hintsLeft <= 0 || !prevCard) return;
    setBusy(true);
    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainIds: nodes.map((n) => n.card.id),
          targetId: mode === "daily" ? daily?.targetId : undefined,
        }),
      });
      const data = (await res.json()) as HintResponse;
      setHintsLeft((h) => h - 1);
      if (data.none || !data.name) {
        flashToast("No valid next player from here — you may be stuck.");
      } else {
        flashToast(`Hint: try ${data.name} (${data.matchedIcon} ${data.matchedValue})`);
      }
    } catch {
      flashToast("Couldn't fetch a hint.");
    } finally {
      setBusy(false);
    }
  }, [over, busy, hintsLeft, prevCard, nodes, mode, daily, flashToast]);

  const reveal = useCallback(async () => {
    if (over || busy || !prevCard) return;
    setBusy(true);
    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainIds: nodes.map((n) => n.card.id),
          targetId: mode === "daily" ? daily?.targetId : undefined,
        }),
      });
      const data = (await res.json()) as HintResponse;
      const rn =
        data.name && !data.none
          ? { name: data.name, via: { linkType: data.linkType, matchedValue: data.matchedValue ?? "", icon: data.matchedIcon ?? ("🏀" as const) } }
          : null;
      endRun(false, rn);
    } catch {
      endRun(false, null);
    } finally {
      setBusy(false);
    }
  }, [over, busy, prevCard, nodes, mode, daily]);

  function endRun(didSolve: boolean, rn: typeof revealNode, finalNodes?: ChainNode[]) {
    const used = (finalNodes ?? nodes).length - 1;
    setSolved(didSolve);
    setRevealNode(rn);
    setOver(true);
    // persist best
    if (mode === "endless") {
      const b = readBest("endless");
      if (b == null || used > b) {
        writeBest("endless", used);
        setBest(used);
      }
    } else if (didSolve && daily) {
      const b = readBest("daily", daily.date);
      if (b == null || used < b) {
        writeBest("daily", used, daily.date);
        setBest(used);
      }
    }
  }

  // ---- render ----
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4">
      {/* Header */}
      <header className="sticky top-0 z-20 -mx-4 border-b border-court-line bg-court-black/80 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl leading-none tracking-wide text-white">
              CROSS<span className="text-amber-hard text-glow">OVER</span>
            </h1>
            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-white/40">
              {mode === "daily" ? "Daily Bridge" : "Endless"}
            </p>
          </div>
          <Scoreboard
            score={links}
            best={best ?? undefined}
            par={mode === "daily" ? daily?.par : undefined}
          />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <ModeTabs mode={mode} setMode={setMode} dailyAvailable={!!daily} />
          <Misses misses={misses} max={MAX_MISSES} />
        </div>

        {mode === "daily" && daily && (
          <p className="mt-2 text-center font-condensed text-sm text-white/60">
            Bridge <span className="font-semibold text-emerald-300">{daily.startCard.name}</span> to{" "}
            <span className="font-semibold text-amber-hard">{daily.targetCard.name}</span> · par {daily.par}
          </p>
        )}
      </header>

      {/* Chain */}
      <main className={`flex-1 py-5 ${shakeKey ? "" : ""}`}>
        <div key={shakeKey} className={shakeKey ? "animate-shake" : ""}>
          {nodes.length === 0 ? (
            <p className="py-10 text-center text-white/40">Loading…</p>
          ) : (
            <ChainLadder
              nodes={nodes}
              target={mode === "daily" ? daily?.targetCard : undefined}
              reached={solved}
              newestId={newestId}
            />
          )}
        </div>
      </main>

      {/* Sticky dock */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-court-line bg-court-black/85 px-4 py-3 backdrop-blur">
        {toast && (
          <div
            role="status"
            className="mx-auto mb-2 w-fit max-w-full rounded-full border border-court-line bg-court-panel px-4 py-1.5 text-center text-sm text-white/85 shadow-lg"
          >
            {toast}
          </div>
        )}
        {!over && prevCard ? (
          <TurnDock
            linkType={linkType}
            prevCard={prevCard}
            hintsLeft={hintsLeft}
            disabled={busy}
            onSubmit={submit}
            onHint={useHint}
            onReveal={reveal}
          />
        ) : (
          over && (
            <button
              onClick={() => resetRun(mode)}
              className="mx-auto block rounded-xl bg-amber-hard px-6 py-2 font-display text-xl tracking-wide text-court-black hover:bg-amber-glow"
            >
              {mode === "daily" ? "Replay today" : "New run"}
            </button>
          )
        )}
        <p className="mt-2 text-center text-[0.65rem] text-white/30">
          data updated {new Date(meta.version).toLocaleDateString()} ·{" "}
          {shallow ? "team links use current rosters (shallow history)" : "full team history"}
        </p>
      </div>

      {over && (
        <GameOverModal
          mode={mode}
          nodes={nodes}
          par={daily?.par}
          date={daily?.date}
          solved={solved}
          revealNode={revealNode}
          onPlayAgain={() => resetRun(mode)}
          onClose={() => setOver(false)}
        />
      )}
    </div>
  );
}

function ModeTabs({
  mode,
  setMode,
  dailyAvailable,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  dailyAvailable: boolean;
}) {
  return (
    <div role="tablist" aria-label="Game mode" className="flex gap-1 rounded-lg border border-court-line bg-court-panel/60 p-1">
      <Tab active={mode === "daily"} disabled={!dailyAvailable} onClick={() => setMode("daily")}>
        Daily Bridge
      </Tab>
      <Tab active={mode === "endless"} onClick={() => setMode("endless")}>
        Endless
      </Tab>
    </div>
  );
}

function Tab({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-sm font-semibold uppercase tracking-wide transition-colors ${
        active ? "bg-amber-hard text-court-black" : "text-white/55 hover:text-white disabled:opacity-30"
      }`}
    >
      {children}
    </button>
  );
}

// ---- localStorage best/streak (no answers stored) ----
function bestKey(mode: Mode, date?: string) {
  return mode === "daily" ? `crossover.daily.${date}` : "crossover.endlessBest";
}
function readBest(mode: Mode, date?: string): number | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(bestKey(mode, date));
  return v == null ? null : Number(v);
}
function writeBest(mode: Mode, value: number, date?: string) {
  try {
    window.localStorage.setItem(bestKey(mode, date), String(value));
  } catch {
    /* ignore */
  }
}
