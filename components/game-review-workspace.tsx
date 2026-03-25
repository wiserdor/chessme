"use client";

import { useMemo, useState } from "react";

import { GameCoachChat } from "@/components/game-coach-chat";
import { GameReviewBoard } from "@/components/game-review-board";

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

type ChatMessage = {
  id?: string;
  role: "user" | "coach";
  content: string;
  focusPly?: number | null;
};

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

function formatCriticalLabel(label: string) {
  return label.replace(/-/g, " ");
}

export function GameReviewWorkspace(props: {
  gameId: string;
  moves: MoveRow[];
  criticalMoments: CriticalMomentRow[];
  initialPly?: number;
  orientation?: "white" | "black";
  playerColor?: "white" | "black";
  initialMessages: ChatMessage[];
}) {
  const defaultPly = props.initialPly ?? props.moves[0]?.ply;
  const [selectedPly, setSelectedPly] = useState<number | undefined>(defaultPly);

  const focusLabel = useMemo(() => {
    const selectedMove = props.moves.find((move) => move.ply === selectedPly);
    if (!selectedMove) {
      return undefined;
    }

    const criticalMoment = props.criticalMoments.find((moment) => moment.ply === selectedMove.ply);
    return criticalMoment ? `${criticalMoment.label} • ${criticalMoment.deltaCp}cp` : `${selectedMove.san} selected`;
  }, [props.criticalMoments, props.moves, selectedPly]);
  const selectedMove = useMemo(
    () => props.moves.find((move) => move.ply === selectedPly) ?? props.moves[0] ?? null,
    [props.moves, selectedPly]
  );
  const selectedCriticalMoment = useMemo(
    () => props.criticalMoments.find((moment) => moment.ply === selectedMove?.ply) ?? null,
    [props.criticalMoments, selectedMove]
  );

  return (
    <div className="space-y-6">
      <div className="surface-soft flex flex-wrap items-center justify-between gap-3 px-4 py-3 xl:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Review flow</p>
          <p className="mt-1 text-sm text-muted-strong">Select a move, review the lesson, then ask the coach.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary px-3 py-2 text-xs uppercase tracking-[0.12em]" href="#review-moves">
            Move list
          </a>
          <a className="btn-primary px-3 py-2 text-xs uppercase tracking-[0.12em]" href="#review-coach">
            Coach
          </a>
        </div>
      </div>

      <GameReviewBoard
        moves={props.moves}
        criticalMoments={props.criticalMoments}
        initialPly={props.initialPly}
        selectedPly={selectedPly}
        onSelectPly={setSelectedPly}
        showSelectedDetails={false}
        sidePanel={
          <div className="space-y-4 xl:sticky xl:top-4">
            <section className="surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Selected move</p>
                  <h3 className="mt-2 font-display text-2xl">
                    {selectedMove ? `${selectedMove.ply}. ${selectedMove.san}` : "Select a move"}
                  </h3>
                </div>
                {selectedMove ? (
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
                      normalizeMoveBy(selectedMove.moveBy) === props.playerColor
                        ? "bg-sky-500/15 text-sky-700"
                        : "bg-stone-500/15 text-muted-strong"
                    }`}
                  >
                    {labelForMoveOwner(selectedMove.moveBy, props.playerColor)}
                  </span>
                ) : null}
              </div>

              {selectedMove?.tags.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedMove.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel-soft)] px-3 py-1 text-xs uppercase tracking-[0.14em]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              {selectedCriticalMoment ? (
                <div className="mt-4 rounded-[18px] border border-amber-500/25 bg-amber-500/10 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full bg-amber-500 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                      Critical
                    </span>
                    <p className="text-sm font-semibold text-[color:var(--warning-text)]">
                      {formatCriticalLabel(selectedCriticalMoment.label)} • {selectedCriticalMoment.deltaCp}cp swing
                    </p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-strong">
                    {selectedCriticalMoment.whyItMatters ||
                      "This move created one of the biggest swings in the game and deserves a focused review."}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-muted-strong">
                  Ask the coach what this move reveals about your thinking or what you should check next time.
                </p>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <a className="btn-primary w-full px-3 py-2 text-xs uppercase tracking-[0.12em] sm:w-auto" href="#review-coach">
                  Ask coach about this move
                </a>
                <a className="btn-secondary w-full px-3 py-2 text-xs uppercase tracking-[0.12em] sm:w-auto" href="#review-moves">
                  Browse moves
                </a>
              </div>
            </section>
          </div>
        }
        orientation={props.orientation}
        playerColor={props.playerColor}
      />

      <GameCoachChat
        gameId={props.gameId}
        sectionId="review-coach"
        currentFocusPly={selectedPly}
        onFocusPlyChange={setSelectedPly}
        focusLabel={focusLabel}
        criticalMoments={props.criticalMoments.slice(0, 8).map((moment) => ({
          ply: moment.ply,
          label: moment.label,
          deltaCp: moment.deltaCp
        }))}
        initialMessages={props.initialMessages}
      />
    </div>
  );
}
