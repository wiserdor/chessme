"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

type MoveRow = {
  id: string;
  ply: number;
  san: string;
  fenBefore: string;
  fenAfter: string;
  moveBy: string;
  tags: string[];
};

type CriticalMomentRow = {
  ply: number;
  label: string;
  deltaCp: number;
  whatHappened?: string;
  whyItMatters?: string;
  whatToThink?: string;
  trainingFocus?: string;
  aiAvailable?: boolean;
};

function formatCriticalLabel(label: string) {
  return label.replace(/-/g, " ");
}

function normalizeMoveBy(moveBy: string): "white" | "black" | null {
  if (moveBy === "white" || moveBy === "black") {
    return moveBy;
  }

  return null;
}

function labelForMoveOwner(moveBy: string, playerColor?: "white" | "black") {
  const normalizedMoveBy = normalizeMoveBy(moveBy);
  if (!normalizedMoveBy) {
    return "Move";
  }

  if (!playerColor) {
    return normalizedMoveBy === "white" ? "White move" : "Black move";
  }

  return normalizedMoveBy === playerColor ? "Your move" : "Opponent move";
}

function getMoveSquares(fenBefore: string, san: string) {
  try {
    const chess = new Chess(fenBefore);
    const move = chess.move(san, { strict: false });
    if (!move) {
      return null;
    }

    return {
      from: move.from,
      to: move.to
    };
  } catch {
    return null;
  }
}

export function GameReviewBoard(props: {
  moves: MoveRow[];
  criticalMoments?: CriticalMomentRow[];
  initialPly?: number;
  selectedPly?: number;
  onSelectPly?: (ply: number) => void;
  showSelectedDetails?: boolean;
  sidePanel?: ReactNode;
  orientation?: "white" | "black";
  playerColor?: "white" | "black";
}) {
  const [moveFilter, setMoveFilter] = useState<"all" | "mine">("all");
  const boardContainerRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const initialPly = useMemo(() => {
    if (!props.initialPly) {
      return props.moves[0]?.ply ?? 0;
    }

    const found = props.moves.find((move) => move.ply === props.initialPly);
    return found?.ply ?? props.moves[0]?.ply ?? 0;
  }, [props.initialPly, props.moves]);
  const [internalSelectedPly, setInternalSelectedPly] = useState(initialPly);
  const selectedPly = props.selectedPly ?? internalSelectedPly;

  function updateSelectedPly(ply: number) {
    if (props.selectedPly === undefined) {
      setInternalSelectedPly(ply);
    }
    props.onSelectPly?.(ply);
  }

  useEffect(() => {
    if (props.selectedPly === undefined) {
      setInternalSelectedPly(initialPly);
    }
  }, [initialPly]);

  const visibleMoves = useMemo(() => {
    if (moveFilter !== "mine" || !props.playerColor) {
      return props.moves;
    }

    return props.moves.filter((move) => normalizeMoveBy(move.moveBy) === props.playerColor);
  }, [moveFilter, props.moves, props.playerColor]);

  useEffect(() => {
    if (!visibleMoves.length) {
      return;
    }

    if (!visibleMoves.some((move) => move.ply === selectedPly)) {
      updateSelectedPly(visibleMoves[0]!.ply);
    }
  }, [selectedPly, visibleMoves]);

  useEffect(() => {
    const container = boardContainerRef.current;
    if (!container) {
      return;
    }

    const updateBoardWidth = () => {
      setBoardWidth(Math.floor(container.clientWidth));
    };

    updateBoardWidth();

    const observer = new ResizeObserver(() => {
      updateBoardWidth();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  const selected = useMemo(() => visibleMoves.find((move) => move.ply === selectedPly) ?? visibleMoves[0] ?? null, [selectedPly, visibleMoves]);
  const criticalByPly = useMemo(
    () => new Map((props.criticalMoments ?? []).map((moment) => [moment.ply, moment])),
    [props.criticalMoments]
  );
  const selectedCriticalMoment = selected ? criticalByPly.get(selected.ply) : null;
  const selectedMoveSquares = useMemo(
    () => (selected ? getMoveSquares(selected.fenBefore, selected.san) : null),
    [selected]
  );

  if (!props.moves.length) {
    return <p className="surface-soft p-5 text-sm text-muted-strong">No move data available yet.</p>;
  }

  return (
    <div className="space-y-6">
      <div
        className={`grid items-start gap-6 ${
          props.sidePanel
            ? "xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]"
            : "xl:grid-cols-[minmax(560px,1.25fr)_minmax(340px,0.75fr)]"
        }`}
      >
        <div className="min-w-0">
          <div className="board-shell">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300/80">Board</p>
                <p className="mt-1 text-sm text-slate-200">
                  {selected ? `Position after ply ${selected.ply}` : "Replay position"}
                </p>
              </div>
              {selectedMoveSquares ? (
                <div className="rounded-full bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
                  {selectedMoveSquares.from.toUpperCase()} → {selectedMoveSquares.to.toUpperCase()}
                </div>
              ) : null}
            </div>
            <div ref={boardContainerRef} className="w-full">
              {boardWidth > 0 ? (
                <Chessboard
                  id="review-board"
                  arePiecesDraggable={false}
                  boardOrientation={props.orientation ?? "white"}
                  boardWidth={boardWidth}
                  position={selected?.fenAfter}
                  customSquareStyles={
                    selectedMoveSquares
                      ? {
                          [selectedMoveSquares.from]: {
                            background:
                              "radial-gradient(circle, rgba(14,165,233,0.38) 0%, rgba(14,165,233,0.22) 55%, rgba(14,165,233,0.1) 100%)",
                            boxShadow: "inset 0 0 0 3px rgba(3, 105, 161, 0.9)"
                          },
                          [selectedMoveSquares.to]: {
                            background:
                              "radial-gradient(circle, rgba(245,158,11,0.36) 0%, rgba(245,158,11,0.2) 55%, rgba(245,158,11,0.08) 100%)",
                            boxShadow: "inset 0 0 0 3px rgba(180, 83, 9, 0.85)"
                          }
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="aspect-square w-full rounded-[18px] bg-[color:var(--panel-soft)]" />
              )}
            </div>
          </div>
        </div>

        <div
          className={`min-w-0 ${
            props.sidePanel ? "space-y-4 xl:sticky xl:top-4" : "xl:max-w-[420px] xl:justify-self-end"
          }`}
          id="review-moves"
        >
          <div className="surface-card p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Move list</p>
                <p className="mt-1 text-sm text-muted-strong">Navigate the game from your decisions first.</p>
              </div>
              {props.playerColor ? (
                <div className="inline-flex rounded-full border border-[color:var(--border)] bg-[color:var(--panel-strong)] p-1 shadow-sm">
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                      moveFilter === "all" ? "bg-[color:var(--primary)] text-[color:var(--primary-text)]" : "text-muted"
                    }`}
                    onClick={() => setMoveFilter("all")}
                    type="button"
                  >
                    All moves
                  </button>
                  <button
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                      moveFilter === "mine" ? "bg-sky-600 text-white" : "text-muted"
                    }`}
                    onClick={() => setMoveFilter("mine")}
                    type="button"
                  >
                    My moves
                  </button>
                </div>
              ) : null}
            </div>
            <div className={`scroll-panel grid gap-2 overflow-auto pr-1 ${props.sidePanel ? "max-h-[320px]" : "max-h-[560px]"}`}>
              {visibleMoves.map((move) => (
              (() => {
                const isPlayerMove = normalizeMoveBy(move.moveBy) === props.playerColor;
                const isSelected = move.ply === selected?.ply;
                const baseClass = isPlayerMove
                  ? isSelected
                    ? "border-sky-400 bg-sky-500/12 shadow-sm"
                    : "border-sky-500/20 bg-[color:var(--panel-strong)]"
                  : isSelected
                    ? "border-amber-400 bg-amber-500/10"
                    : "border-[color:var(--border)] bg-[color:var(--panel-soft)]";

                return (
                  <button
                    key={move.id}
                    className={`rounded-[18px] border px-4 py-3 text-left transition ${baseClass}`}
                    onClick={() => updateSelectedPly(move.ply)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`font-semibold ${isPlayerMove ? "" : "text-muted-strong"}`}>
                          {move.ply}. {move.san}
                        </p>
                        <p
                          className={`mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                            isPlayerMove ? "text-sky-700" : "text-muted"
                          }`}
                        >
                          {labelForMoveOwner(move.moveBy, props.playerColor)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {criticalByPly.has(move.ply) ? (
                          <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-amber-500 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                            Critical
                          </span>
                        ) : null}
                        {criticalByPly.get(move.ply)?.aiAvailable ? (
                          <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-sky-600 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                            AI
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {move.tags.length ? (
                      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-muted">{move.tags.join(" • ")}</p>
                    ) : null}
                    {criticalByPly.get(move.ply)?.aiAvailable ? (
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">AI lesson available</p>
                    ) : null}
                  </button>
                );
              })()
              ))}
            </div>
          </div>

          {props.sidePanel ? <div className="min-w-0">{props.sidePanel}</div> : null}
        </div>
      </div>

      {props.showSelectedDetails === false ? null : (
      <div className="surface-soft p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Selected ply</p>
            <p className="mt-2 font-display text-3xl">{selected?.ply}</p>
          </div>
          {selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                  selected.moveBy === props.playerColor
                    ? "bg-sky-500/15 text-sky-700"
                    : "bg-stone-500/15 text-muted-strong"
                }`}
              >
                {labelForMoveOwner(selected.moveBy, props.playerColor)}
              </span>
              <p className="text-sm text-muted-strong">Played move: {selected.san}</p>
            </div>
          ) : null}
        </div>

        <p className="mt-3 text-xs uppercase tracking-[0.14em] text-muted">Board shows position after this move</p>
        {selectedMoveSquares ? (
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
            From {selectedMoveSquares.from.toUpperCase()} to {selectedMoveSquares.to.toUpperCase()}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {selected?.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel-strong)] px-3 py-1 text-xs uppercase tracking-[0.14em]">
              {tag}
            </span>
          ))}
        </div>

        {selectedCriticalMoment ? (
          <div className="mt-4 rounded-[18px] border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-[color:var(--warning-text)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                !
              </span>
              <p className="font-semibold">
                Critical moment: {formatCriticalLabel(selectedCriticalMoment.label)} ({selectedCriticalMoment.deltaCp}cp)
              </p>
            </div>
            {selectedCriticalMoment.aiAvailable ? (
              <div className="mt-3 rounded-[16px] border border-[color:var(--border)] bg-[color:var(--panel-strong)] p-3 text-muted-strong">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">AI learning pack</p>
                {selectedCriticalMoment.whatHappened ? (
                  <p className="mt-2 leading-6">
                    <span className="font-semibold">What happened:</span> {selectedCriticalMoment.whatHappened}
                  </p>
                ) : null}
                {selectedCriticalMoment.whyItMatters ? (
                  <p className="mt-2 leading-6">
                    <span className="font-semibold">Why it was critical:</span> {selectedCriticalMoment.whyItMatters}
                  </p>
                ) : null}
                {selectedCriticalMoment.whatToThink ? (
                  <p className="mt-2 leading-6">
                    <span className="font-semibold">What to think next time:</span> {selectedCriticalMoment.whatToThink}
                  </p>
                ) : null}
                {selectedCriticalMoment.trainingFocus ? (
                  <p className="mt-2 leading-6">
                    <span className="font-semibold">How to stop it next time:</span> {selectedCriticalMoment.trainingFocus}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      )}
    </div>
  );
}
