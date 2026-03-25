"use client";

import { useState, useTransition } from "react";

type CriticalMomentOption = {
  ply: number;
  label: string;
  deltaCp: number;
};

type Message = {
  role: "user" | "coach";
  content: string;
};

const SUGGESTIONS = [
  "Why was this move bad?",
  "What should I think about next time in this position?",
  "What pattern am I missing in this game?",
  "Give me one training task from this game."
];

export function GameCoachChat(props: {
  gameId: string;
  initialFocusPly?: number;
  criticalMoments: CriticalMomentOption[];
}) {
  const [question, setQuestion] = useState("");
  const [focusPly, setFocusPly] = useState<number | "">(
    typeof props.initialFocusPly === "number" ? props.initialFocusPly : props.criticalMoments[0]?.ply ?? ""
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(nextQuestion: string) {
    setNotice(null);
    startTransition(async () => {
      const trimmed = nextQuestion.trim();
      if (!trimmed) {
        setNotice("Type a question for the coach.");
        return;
      }

      setMessages((current) => [...current, { role: "user", content: trimmed }]);
      setQuestion("");

      const response = await fetch(`/api/games/${props.gameId}/coach-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          focusPly: typeof focusPly === "number" ? focusPly : undefined
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; answer?: string };

      if (!response.ok || payload.ok === false || !payload.answer) {
        setNotice(payload.error || "Could not reach the coach.");
        return;
      }

      setMessages((current) => [...current, { role: "coach", content: payload.answer as string }]);
    });
  }

  return (
    <section className="surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="badge">Coach Chat</span>
          <h3 className="mt-3 font-display text-2xl">Ask your trainer about this game</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Grounded only in this analyzed game, its critical moments, and your stored coach notes.
          </p>
        </div>
        <div className="min-w-[220px]">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="coach-focus-ply">
            Focus
          </label>
          <select
            id="coach-focus-ply"
            className="field-muted mt-2"
            value={focusPly}
            onChange={(event) => {
              const value = event.target.value;
              setFocusPly(value ? Number.parseInt(value, 10) : "");
            }}
          >
            <option value="">Whole game</option>
            {props.criticalMoments.map((moment) => (
              <option key={moment.ply} value={moment.ply}>
                Ply {moment.ply} • {moment.label} • {moment.deltaCp}cp
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((item) => (
          <button
            key={item}
            className="btn-secondary px-3 py-2 text-xs uppercase tracking-[0.12em]"
            disabled={isPending}
            onClick={() => submit(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {messages.length ? (
          <div className="scroll-panel max-h-[360px] space-y-3 overflow-y-auto pr-1">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-[20px] px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "border border-[color:var(--border)] bg-[color:var(--panel-soft)]"
                    : "border border-sky-500/20 bg-sky-500/10"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                  {message.role === "user" ? "You" : "Coach"}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{message.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="surface-soft rounded-[20px] p-4 text-sm text-muted-strong">
            Ask about a critical move, your thinking process, or how to train this game’s main mistake.
          </p>
        )}

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(question);
          }}
          >
            <textarea
            className="field-area min-h-28 rounded-[20px]"
            placeholder="Ask the coach about this game..."
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {notice ? <p className="text-xs text-muted">{notice}</p> : <span />}
            <button className="btn-primary text-sm" disabled={isPending} type="submit">
              {isPending ? "Thinking..." : "Ask coach"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
