"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

import { NoteComposerTrigger } from "@/components/note-composer-trigger";
import { NotesPanel } from "@/components/notes-panel";
import { getStoredActiveProfile, listTrainingProgress, saveTrainingProgress } from "@/lib/client/private-store";

type Card = {
  id: string;
  title: string;
  theme: string;
  promptFen: string;
  expectedMove: string;
  hint: string;
  explanation: string;
  tags: string[];
  difficulty: number;
  sourceGameId: string;
  sourcePly: number;
  dueAt: number;
  intervalDays: number;
};

type AnswerResult = {
  correct: boolean;
  expectedMove: string;
  explanation: string;
  hint: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function resolveMoveFromInput(fen: string, rawInput: string) {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/[\s-]/g, "");
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(compact)) {
    const chess = new Chess(fen);
    try {
      const move = chess.move({
        from: compact.slice(0, 2),
        to: compact.slice(2, 4),
        promotion: compact.slice(4) || undefined
      });
      if (move) {
        return {
          uci: `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase(),
          san: move.san
        };
      }
    } catch {
      return null;
    }
  }

  const chess = new Chess(fen);
  try {
    const move = chess.move(trimmed, { strict: false });
    if (!move) {
      return null;
    }

    return {
      uci: `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase(),
      san: move.san
    };
  } catch {
    return null;
  }
}

export function TrainingDrill(props: { cards: Card[] }) {
  const boardContainerRef = useRef<HTMLDivElement | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const [move, setMove] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [confidence, setConfidence] = useState("3");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [lockCardId, setLockCardId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, { intervalDays: number; streak: number; dueAt: number; lastAnsweredAt?: number | null }>>({});
  const [isPending, startTransition] = useTransition();

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

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      const profileUsername = getStoredActiveProfile() ?? "default";
      const rows = await listTrainingProgress(profileUsername);
      if (cancelled) {
        return;
      }

      setProgress(
        Object.fromEntries(
          rows.map((row) => [
            row.cardId,
            {
              intervalDays: row.intervalDays,
              streak: row.streak,
              dueAt: row.dueAt,
              lastAnsweredAt: row.lastAnsweredAt ?? null
            }
          ])
        )
      );
    }

    void loadProgress();
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveCards = useMemo(
    () =>
      props.cards.map((card) => {
        const local = progress[card.id];
        return {
          ...card,
          intervalDays: local?.intervalDays ?? card.intervalDays,
          streak: local?.streak ?? 0,
          dueAt: local?.dueAt ?? card.dueAt
        };
      }),
    [progress, props.cards]
  );

  const nextDueCard = useMemo(() => {
    const now = Date.now();
    return effectiveCards
      .filter((card) => card.dueAt <= now)
      .sort((left, right) => right.difficulty - left.difficulty || left.dueAt - right.dueAt)[0] ?? null;
  }, [effectiveCards]);

  const activeCard = useMemo(() => {
    if (lockCardId) {
      return effectiveCards.find((card) => card.id === lockCardId) ?? nextDueCard;
    }

    return nextDueCard;
  }, [effectiveCards, lockCardId, nextDueCard]);

  const nextCardAfterLock = useMemo(() => {
    if (!lockCardId) {
      return null;
    }

    const now = Date.now();
    return effectiveCards
      .filter((card) => card.id !== lockCardId && card.dueAt <= now)
      .sort((left, right) => right.difficulty - left.difficulty || left.dueAt - right.dueAt)[0] ?? null;
  }, [effectiveCards, lockCardId]);

  if (!activeCard) {
    return (
      <section className="panel">
        <span className="badge">Queue clear</span>
        <h1 className="mt-3 font-display text-4xl">No drill is due right now.</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted">
          Import fresh games or rerun analysis to generate new cards. Your drill progress now stays local to this
          device, so another browser will keep a separate training queue.
        </p>
      </section>
    );
  }

  function submitMove(nextMove: string) {
    setResult(null);
    startTransition(async () => {
      const submittedMove = resolveMoveFromInput(activeCard.promptFen, nextMove);
      if (!submittedMove) {
        setResult({
          correct: false,
          expectedMove: "",
          explanation: "Illegal move for this position.",
          hint: activeCard.hint
        });
        return;
      }

      const expectedMove = resolveMoveFromInput(activeCard.promptFen, activeCard.expectedMove);
      const normalizedExpected = expectedMove?.uci ?? activeCard.expectedMove.trim().toLowerCase();
      const correct = normalizedExpected === submittedMove.uci;
      const profileUsername = getStoredActiveProfile() ?? "default";
      const previous = progress[activeCard.id];
      const previousInterval = previous?.intervalDays ?? Math.max(1, activeCard.intervalDays);
      const nextInterval = correct ? Math.max(1, previousInterval * 2) : 1;
      const streak = correct ? (previous?.streak ?? 0) + 1 : 0;
      const answeredAt = Date.now();
      const dueAt = correct ? answeredAt + nextInterval * DAY_MS : answeredAt;

      await saveTrainingProgress(profileUsername, activeCard.id, {
        intervalDays: nextInterval,
        streak,
        dueAt,
        lastAnsweredAt: answeredAt
      });

      setProgress((current) => ({
        ...current,
        [activeCard.id]: {
          intervalDays: nextInterval,
          streak,
          dueAt,
          lastAnsweredAt: answeredAt
        }
      }));
      setResult({
        correct,
        expectedMove: expectedMove ? `${expectedMove.san} (${expectedMove.uci})` : activeCard.expectedMove,
        explanation: activeCard.explanation,
        hint: activeCard.hint
      });
      setMove("");
      setLockCardId(activeCard.id);
    });
  }

  function resolveDropMove(sourceSquare: string, targetSquare: string, piece: string) {
    const chess = new Chess(activeCard.promptFen);
    const isPawn = piece.toLowerCase().endsWith("p");
    const targetRank = targetSquare[1];
    const promotion = isPawn && (targetRank === "1" || targetRank === "8") ? "q" : undefined;

    try {
      const dropped = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion
      });
      if (!dropped) {
        return null;
      }

      return `${dropped.from}${dropped.to}${dropped.promotion ?? ""}`.toLowerCase();
    } catch {
      return null;
    }
  }

  return (
    <section className="panel space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="badge">Due drill</span>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl">{activeCard.title}</h1>
          <p className="mt-2 text-sm text-muted">
            Theme: {activeCard.theme} • Difficulty {activeCard.difficulty}
          </p>
        </div>
        <div className="surface-soft w-full px-4 py-3 text-sm text-muted-strong xl:w-auto xl:max-w-[320px]">
          {activeCard.hint}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <NoteComposerTrigger
          buttonLabel="Add note on this drill"
          buttonClassName="btn-secondary w-full text-sm sm:w-auto"
          dialogTitle="Save note on this training position"
          profileUsername={getStoredActiveProfile() ?? "default"}
          context={{
            anchorType: "training-card",
            anchorLabel: activeCard.title,
            sourcePath: "/training",
            trainingCardId: activeCard.id,
            gameId: activeCard.sourceGameId,
            ply: activeCard.sourcePly,
            fen: activeCard.promptFen
          }}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(560px,1.2fr)_minmax(320px,0.8fr)]">
        <div className="board-shell">
          <div ref={boardContainerRef} className="w-full">
            {boardWidth > 0 ? (
              <Chessboard
                id="training-board"
                arePiecesDraggable={!isPending}
                boardWidth={boardWidth}
                position={activeCard.promptFen}
                onPieceDrop={(sourceSquare, targetSquare, piece) => {
                  if (isPending || !piece) {
                    return false;
                  }

                  const nextMove = resolveDropMove(sourceSquare, targetSquare, piece);
                  if (!nextMove) {
                    setResult({
                      correct: false,
                      expectedMove: "",
                      explanation: "Illegal move for this position.",
                      hint: activeCard.hint
                    });
                    return false;
                  }

                  setMove(nextMove);
                  submitMove(nextMove);
                  return true;
                }}
              />
            ) : (
              <div className="aspect-square w-full rounded-[18px] bg-[color:var(--panel-soft)]" />
            )}
          </div>
        </div>

        <div className="space-y-4 xl:max-w-[420px] xl:justify-self-end">
          <div className="surface-soft p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">How to answer</p>
            <p className="mt-2 text-sm leading-6 text-muted-strong">
              Drag a piece on the board to submit instantly. Promotions from drag default to queen.
            </p>
            <button
              className="btn-secondary mt-4 w-full text-sm sm:w-auto"
              onClick={() => setShowManualInput((current) => !current)}
              type="button"
            >
              {showManualInput ? "Hide manual entry" : "Type move instead"}
            </button>
          </div>

          {showManualInput ? (
            <form
              className="surface-card p-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!move.trim()) {
                  setResult({
                    correct: false,
                    expectedMove: "",
                    explanation: "Enter a move or drag a piece.",
                    hint: activeCard.hint
                  });
                  return;
                }

                submitMove(move.trim());
              }}
            >
              <label className="block text-sm font-semibold text-muted-strong" htmlFor="move">
                Your move
              </label>
              <input
                id="move"
                className="field mt-2"
                placeholder="e4 or e2e4"
                value={move}
                onChange={(event) => setMove(event.target.value)}
              />

              <label className="mt-4 block text-sm font-semibold text-muted-strong" htmlFor="confidence">
                Confidence
              </label>
              <select
                id="confidence"
                className="field mt-2"
                value={confidence}
                onChange={(event) => setConfidence(event.target.value)}
              >
                <option value="1">1 - Guess</option>
                <option value="2">2 - Low</option>
                <option value="3">3 - Medium</option>
                <option value="4">4 - Good</option>
                <option value="5">5 - Certain</option>
              </select>

              <button className="btn-primary mt-5 w-full px-5 py-3 sm:w-auto" disabled={isPending}>
                {isPending ? "Checking..." : "Submit answer"}
              </button>
            </form>
          ) : null}

          {result ? (
            <div
              className={`rounded-[24px] p-5 ${
                result.correct
                  ? "border border-emerald-500/20 bg-emerald-500/10 text-[color:var(--success-text)]"
                  : "border border-rose-500/20 bg-rose-500/10 text-[color:var(--error-text)]"
              }`}
            >
              <p className="font-semibold">{result.correct ? "Correct." : "Not quite."}</p>
              <p className="mt-2 text-sm">Expected move: {result.expectedMove || "Unavailable"}</p>
              <p className="mt-2 text-sm leading-6">{result.explanation}</p>
              <button
                className="btn-secondary mt-4 w-full text-sm sm:w-auto"
                onClick={() => {
                  setResult(null);
                  setLockCardId(null);
                }}
                type="button"
              >
                {result.correct ? (nextCardAfterLock ? "Next drill" : "Done for now") : "Try again"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <NotesPanel
        title="Notes tied to this training position"
        description="Save a correction rule, pattern, or reminder so this drill becomes something you actually remember in your games."
        emptyMessage="No notes saved for this drill yet."
        searches={[
          { trainingCardId: activeCard.id, limit: 4 },
          { gameId: activeCard.sourceGameId, limit: 2 }
        ]}
        limit={5}
      />
    </section>
  );
}
