"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

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
};

type AnswerResult = {
  correct: boolean;
  expectedMove: string;
  explanation: string;
  hint: string;
};

export function TrainingDrill(props: { card: Card | null }) {
  const router = useRouter();
  const [move, setMove] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [confidence, setConfidence] = useState("3");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const card = props.card;

  if (!card) {
      return (
        <section className="panel">
          <span className="badge">Queue clear</span>
          <h1 className="mt-3 font-display text-4xl">No drill is due right now.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted">
            Import fresh games or rerun analysis to generate new cards. When you answer a card correctly, it gets
            scheduled into the future automatically.
          </p>
      </section>
    );
  }
  const activeCard: Card = card;

  function submitMove(nextMove: string) {
    setResult(null);
    startTransition(async () => {
      const response = await fetch("/api/training/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: activeCard.id,
          move: nextMove,
          confidence: Number(confidence)
        })
      });

      const payload = (await response.json()) as { ok: boolean; error?: string } & AnswerResult;
      if (!response.ok || payload.ok === false) {
        setResult({
          correct: false,
          expectedMove: "",
          explanation: payload.error || "Could not grade answer.",
          hint: activeCard.hint
        });
        return;
      }

      setResult(payload);
      setMove("");
      router.refresh();
    });
  }

  function resolveDropMove(sourceSquare: string, targetSquare: string, piece: string) {
    const chess = new Chess(activeCard.promptFen);
    const isPawn = piece.toLowerCase().endsWith("p");
    const targetRank = targetSquare[1];
    const promotion = isPawn && (targetRank === "1" || targetRank === "8") ? "q" : undefined;

    let dropped = null;
    try {
      dropped = chess.move({
        from: sourceSquare,
        to: targetSquare,
        promotion
      });
    } catch {
      dropped = null;
    }

    if (!dropped) {
      return null;
    }

    return `${dropped.from}${dropped.to}${dropped.promotion ?? ""}`.toLowerCase();
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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(560px,1.2fr)_minmax(320px,0.8fr)]">
        <div className="board-shell">
          <Chessboard
            id="training-board"
            arePiecesDraggable={!isPending}
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
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
