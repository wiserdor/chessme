"use client";

import { useEffect, useMemo, useState } from "react";

import { GameCoachChat } from "@/components/game-coach-chat";
import { NoteComposerTrigger } from "@/components/note-composer-trigger";
import { GameReviewBoard } from "@/components/game-review-board";
import { NotesPanel } from "@/components/notes-panel";
import { getPrivateGameAIReview, getStoredActiveProfile } from "@/lib/client/private-store";

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
  bestMove?: string;
  playedMove?: string;
  tags?: string[];
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

function buildDeterministicLesson(input: {
  move?: MoveRow | null;
  criticalMoment?: CriticalMomentRow | null;
  playerColor?: "white" | "black";
}) {
  const { move, criticalMoment } = input;
  if (!move) {
    return null;
  }

  const moveOwner = normalizeMoveBy(move.moveBy);
  const isPlayerMove = input.playerColor ? moveOwner === input.playerColor : true;
  const ownerLabel = isPlayerMove ? "you" : "your opponent";
  const tags = criticalMoment?.tags?.length ? criticalMoment.tags : move.tags;
  const bestMove = criticalMoment?.bestMove;
  const summaryByLabel: Record<string, string> = {
    "opening-leak": `This move was flagged as an opening leak, which usually means ${ownerLabel} drifted from development, king safety, or central control too early.`,
    "endgame-error": `This move was flagged as an endgame error, so technique in a simpler position likely mattered more than immediate activity.`,
    "missed-tactic": `This move missed a tactical resource. The main lesson is to scan forcing moves before trusting the natural continuation.`,
    blunder: `This move created a large swing immediately. It usually means something concrete became loose, hanging, or tactically vulnerable.`,
    mistake: `This move gave up a meaningful amount of evaluation. There was likely a stronger continuation or a cleaner way to keep control.`,
    inaccuracy: `This move was not losing on the spot, but it still drifted from the strongest continuation in the position.`
  };

  const checklist = [
    tags.includes("opening")
      ? "Before committing in the opening, check development, king safety, and who controls the center."
      : tags.includes("endgame")
        ? "In simpler positions, improve king and piece activity before rushing pawn moves."
        : "Pause before the move and compare at least two candidate moves.",
    tags.includes("capture") || tags.includes("check")
      ? "Always scan checks, captures, and threats for both sides before locking in the move."
      : "Ask what your opponent wants after this move, not just what you want.",
    bestMove ? `Compare your move with the engine move ${bestMove} and ask what idea that move keeps alive.` : "After the move, ask what changed in piece safety, king safety, and coordination."
  ];

  return {
    title: criticalMoment ? `Engine lesson: ${formatCriticalLabel(criticalMoment.label)}` : "Engine lesson",
    summary:
      summaryByLabel[criticalMoment?.label || ""] ||
      `This move did not carry saved AI notes, but the replay still gives you a useful checkpoint: compare what ${ownerLabel} played with the position’s safer or more active alternatives.`,
    bestMove,
    checklist
  };
}

export function GameReviewWorkspace(props: {
  gameId: string;
  profileUsername?: string;
  opening?: string | null;
  hasApiKey: boolean;
  moves: MoveRow[];
  criticalMoments: CriticalMomentRow[];
  initialPly?: number;
  orientation?: "white" | "black";
  playerColor?: "white" | "black";
  initialMessages: ChatMessage[];
}) {
  const defaultPly = props.initialPly ?? props.moves[0]?.ply;
  const [selectedPly, setSelectedPly] = useState<number | undefined>(defaultPly);
  const [displayCriticalMoments, setDisplayCriticalMoments] = useState(props.criticalMoments);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalReview() {
      const profileUsername = props.profileUsername ?? getStoredActiveProfile() ?? "default";
      const review = await getPrivateGameAIReview(profileUsername, props.gameId);
      if (cancelled) {
        return;
      }

      if (!review?.criticalMoments.length) {
        setDisplayCriticalMoments(props.criticalMoments);
        return;
      }

      const byPly = new Map(review.criticalMoments.map((moment) => [moment.ply, moment]));
      setDisplayCriticalMoments(
        props.criticalMoments.map((moment) => {
          const localMoment = byPly.get(moment.ply);
          return localMoment
            ? {
                ...moment,
                whatHappened: localMoment.whatHappened,
                whyItMatters: localMoment.whyItMatters,
                whatToThink: localMoment.whatToThink,
                trainingFocus: localMoment.trainingFocus,
                aiAvailable: true
              }
            : moment;
        })
      );
    }

    void loadLocalReview();
    const reload = () => void loadLocalReview();
    window.addEventListener("private-game-review-updated", reload);
    return () => {
      cancelled = true;
      window.removeEventListener("private-game-review-updated", reload);
    };
  }, [props.criticalMoments, props.gameId, props.profileUsername]);

  const focusLabel = useMemo(() => {
    const selectedMove = props.moves.find((move) => move.ply === selectedPly);
    if (!selectedMove) {
      return undefined;
    }

    const criticalMoment = displayCriticalMoments.find((moment) => moment.ply === selectedMove.ply);
    return criticalMoment ? `${criticalMoment.label} • ${criticalMoment.deltaCp}cp` : `${selectedMove.san} selected`;
  }, [displayCriticalMoments, props.moves, selectedPly]);

  const selectedMove = useMemo(
    () => props.moves.find((move) => move.ply === selectedPly) ?? props.moves[0] ?? null,
    [props.moves, selectedPly]
  );

  const selectedCriticalMoment = useMemo(
    () => displayCriticalMoments.find((moment) => moment.ply === selectedMove?.ply) ?? null,
    [displayCriticalMoments, selectedMove]
  );
  const deterministicLesson = useMemo(
    () =>
      buildDeterministicLesson({
        move: selectedMove,
        criticalMoment: selectedCriticalMoment,
        playerColor: props.playerColor
      }),
    [props.playerColor, selectedCriticalMoment, selectedMove]
  );

  return (
    <div className="space-y-6">
      <div className="surface-soft flex flex-wrap items-center justify-between gap-3 px-4 py-3 xl:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Review flow</p>
          <p className="mt-1 text-sm text-muted-strong">
            {props.hasApiKey
              ? "Select a move, review the lesson, then ask the coach."
              : "Select a move and review the board, move list, and engine lesson."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary px-3 py-2 text-xs uppercase tracking-[0.12em]" href="#review-moves">
            Move list
          </a>
          {props.hasApiKey ? (
            <a className="btn-primary px-3 py-2 text-xs uppercase tracking-[0.12em]" href="#review-coach">
              Coach
            </a>
          ) : null}
        </div>
      </div>

      <GameReviewBoard
        moves={props.moves}
        criticalMoments={displayCriticalMoments}
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

              {deterministicLesson && !selectedCriticalMoment?.aiAvailable ? (
                <div className="mt-4 rounded-[18px] border border-[color:var(--border)] bg-[color:var(--panel-soft)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{deterministicLesson.title}</p>
                  <p className="mt-3 text-sm leading-6 text-muted-strong">{deterministicLesson.summary}</p>
                  {deterministicLesson.bestMove ? (
                    <p className="mt-3 text-sm text-muted-strong">
                      <span className="font-semibold text-[color:var(--text)]">Best move:</span> {deterministicLesson.bestMove}
                    </p>
                  ) : null}
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-strong">
                    {deterministicLesson.checklist.map((item) => (
                      <li key={item} className="rounded-[14px] bg-[color:var(--panel-strong)] px-3 py-2">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {selectedMove ? (
                  <NoteComposerTrigger
                    buttonLabel="Add note on this move"
                    buttonClassName="btn-secondary w-full px-3 py-2 text-xs uppercase tracking-[0.12em] sm:w-auto"
                    dialogTitle="Save note on this move"
                    context={{
                      anchorType: "move",
                      anchorLabel: `Ply ${selectedMove.ply} • ${selectedMove.san}`,
                      sourcePath: `/games/${props.gameId}?ply=${selectedMove.ply}#replay`,
                      gameId: props.gameId,
                      ply: selectedMove.ply,
                      fen: selectedMove.fenAfter,
                      opening: props.opening ?? null
                    }}
                  />
                ) : null}
                <a
                  className="btn-primary w-full px-3 py-2 text-xs uppercase tracking-[0.12em] sm:w-auto"
                  href={props.hasApiKey ? "#review-coach" : "/settings#ai-coach"}
                >
                  {props.hasApiKey ? "Ask coach about this move" : "Add AI coach"}
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

      {props.hasApiKey ? (
        <GameCoachChat
          gameId={props.gameId}
          profileUsername={props.profileUsername}
          sectionId="review-coach"
          hasApiKey={props.hasApiKey}
          currentFocusPly={selectedPly}
          onFocusPlyChange={setSelectedPly}
          opening={props.opening ?? undefined}
          focusLabel={focusLabel}
          criticalMoments={displayCriticalMoments.slice(0, 8).map((moment) => ({
            ply: moment.ply,
            label: moment.label,
            deltaCp: moment.deltaCp
          }))}
          initialMessages={props.initialMessages}
          moveContexts={props.moves.map((move) => ({
            ply: move.ply,
            san: move.san,
            fenAfter: move.fenAfter
          }))}
        />
      ) : (
        <section className="surface-card p-5">
          <span className="badge">Replay only</span>
          <h3 className="mt-3 font-display text-xl sm:text-2xl">Board and move review stay available without AI</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            You can still navigate the full game, inspect critical moments, and review engine-backed lessons move by
            move. Add a token in Settings only if you want coach chat and deeper explanations.
          </p>
        </section>
      )}

      <NotesPanel
        title="Notes tied to this review"
        description="Your saved notes follow the current game context, including the selected move and matching opening notes."
        emptyMessage="No notes saved for this game or opening yet."
        profileUsername={props.profileUsername}
        searches={[
          ...(selectedMove
            ? [
                {
                  gameId: props.gameId,
                  anchorType: "move",
                  ply: selectedMove.ply,
                  limit: 3
                },
                {
                  gameId: props.gameId,
                  anchorType: "position",
                  ply: selectedMove.ply,
                  limit: 4
                },
                {
                  gameId: props.gameId,
                  limit: 4
                }
              ]
            : [{ gameId: props.gameId, limit: 4 }]),
          ...(props.opening ? [{ anchorType: "opening", opening: props.opening, limit: 3 }] : [])
        ]}
        limit={6}
      />
    </div>
  );
}
