"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { NoteComposerTrigger } from "@/components/note-composer-trigger";
import { UnlockAICoachCard } from "@/components/unlock-ai-coach-card";
import {
  appendCoachExchange,
  getCoachMessages,
  getPrivateAIConfig,
  getStoredActiveProfile,
  searchPrivateNotes
} from "@/lib/client/private-store";

type CriticalMomentOption = {
  ply: number;
  label: string;
  deltaCp: number;
};

type Message = {
  id?: string;
  role: "user" | "coach";
  content: string;
  focusPly?: number | null;
};

const SUGGESTIONS = [
  "Why was this move bad?",
  "What should I think about next time in this position?",
  "What pattern am I missing in this game?",
  "Give me one training task from this game."
];

export function GameCoachChat(props: {
  gameId: string;
  opening?: string;
  hasApiKey: boolean;
  currentFocusPly?: number;
  onFocusPlyChange?: (ply: number | undefined) => void;
  focusLabel?: string;
  criticalMoments: CriticalMomentOption[];
  moveContexts: Array<{
    ply: number;
    san: string;
    fenAfter: string;
  }>;
  initialMessages: Message[];
  sectionId?: string;
}) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>(props.initialMessages);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasLocalApiKey, setHasLocalApiKey] = useState(props.hasApiKey);
  const [settings, setSettings] = useState<{ provider: "openai" | "mock"; model: string; apiKey?: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [internalFocusPly, setInternalFocusPly] = useState<number | "">(props.criticalMoments[0]?.ply ?? "");
  const focusPly = typeof props.currentFocusPly === "number" ? props.currentFocusPly : internalFocusPly;

  const focusOptions = useMemo(() => {
    const options = props.criticalMoments.map((moment) => ({
      ply: moment.ply,
      label: `Ply ${moment.ply} • ${moment.label} • ${moment.deltaCp}cp`
    }));

    if (
      typeof props.currentFocusPly === "number" &&
      !options.some((option) => option.ply === props.currentFocusPly)
    ) {
      options.unshift({
        ply: props.currentFocusPly,
        label: `Ply ${props.currentFocusPly} • ${props.focusLabel || "Selected move"}`
      });
    }

    return options;
  }, [props.criticalMoments, props.currentFocusPly, props.focusLabel]);

  const moveContextByPly = useMemo(
    () => new Map(props.moveContexts.map((move) => [move.ply, move])),
    [props.moveContexts]
  );

  useEffect(() => {
    if (typeof props.currentFocusPly === "number") {
      setInternalFocusPly(props.currentFocusPly);
    }
  }, [props.currentFocusPly]);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalState() {
      const profileUsername = getStoredActiveProfile() ?? "default";
      const [config, storedMessages] = await Promise.all([
        getPrivateAIConfig(),
        getCoachMessages(profileUsername, props.gameId)
      ]);

      if (cancelled) {
        return;
      }

      const localHasApiKey = config.provider === "openai" && Boolean(config.apiKey);
      setHasLocalApiKey(localHasApiKey);
      setSettings(
        localHasApiKey
          ? {
              provider: "openai",
              model: config.model,
              apiKey: config.apiKey ?? undefined
            }
          : null
      );

      if (storedMessages.length) {
        setMessages(
          storedMessages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            focusPly: message.focusPly ?? null
          }))
        );
      }
    }

    void loadLocalState();
    const reloadMessages = () => void loadLocalState();
    window.addEventListener("private-game-review-updated", reloadMessages);
    return () => {
      cancelled = true;
      window.removeEventListener("private-game-review-updated", reloadMessages);
    };
  }, [props.gameId, props.hasApiKey]);

  function updateFocusPly(next: number | undefined) {
    const value = typeof next === "number" ? next : "";
    setInternalFocusPly(value);
    props.onFocusPlyChange?.(next);
  }

  function submit(nextQuestion: string) {
    setNotice(null);
    startTransition(async () => {
      const trimmed = nextQuestion.trim();
      if (!trimmed) {
        setNotice("Type a question for the coach.");
        return;
      }

      if (!settings?.apiKey) {
        setNotice("Add your OpenAI token in Settings before using coach chat.");
        return;
      }

      const optimisticKey = `pending-${Date.now()}`;
      setMessages((current) => [
        ...current,
        {
          id: optimisticKey,
          role: "user",
          content: trimmed,
          focusPly: typeof focusPly === "number" ? focusPly : null
        }
      ]);
      setQuestion("");

      try {
        const profileUsername = getStoredActiveProfile() ?? "default";
        const relevantNotes = await searchPrivateNotes(profileUsername, {
          gameId: props.gameId,
          ...(typeof focusPly === "number" ? { ply: focusPly } : {}),
          limit: 5
        });

        const response = await fetch(`/api/games/${props.gameId}/coach-chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmed,
            focusPly: typeof focusPly === "number" ? focusPly : undefined,
            history: messages.slice(-10).map((message) => ({
              role: message.role,
              content: message.content,
              focusPly: message.focusPly ?? null
            })),
            notes: relevantNotes.slice(0, 5).map((note) => ({
              title: note.title,
              excerpt: note.excerpt,
              anchorLabel: note.anchorLabel,
              tags: [...note.manualTags, ...note.derivedTags].slice(0, 6)
            })),
            settings
          })
        });
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          answer?: string;
        };

        if (!response.ok || payload.ok === false || !payload.answer) {
          setMessages((current) => current.filter((message) => message.id !== optimisticKey));
          setNotice(payload.error || "Could not reach the coach.");
          return;
        }

        await appendCoachExchange(profileUsername, props.gameId, {
          question: trimmed,
          answer: payload.answer,
          focusPly: typeof focusPly === "number" ? focusPly : null
        });

        const nextMessages = await getCoachMessages(profileUsername, props.gameId);
        setMessages(
          nextMessages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            focusPly: message.focusPly ?? null
          }))
        );
      } catch {
        setMessages((current) => current.filter((message) => message.id !== optimisticKey));
        setNotice("Could not reach the coach. Please try again.");
      }
    });
  }

  return (
    <section className="surface-card p-5" id={props.sectionId}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="badge">Coach Chat</span>
          <h3 className="mt-3 font-display text-xl sm:text-2xl">Ask your trainer about this move</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Grounded only in this analyzed game, your saved notes, and the selected position.
          </p>
        </div>
        <div className="w-full min-w-0 sm:w-auto sm:min-w-[220px]">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="coach-focus-ply">
            Focus
          </label>
          <select
            id="coach-focus-ply"
            className="field-muted mt-2"
            value={focusPly}
            onChange={(event) => {
              const value = event.target.value;
              updateFocusPly(value ? Number.parseInt(value, 10) : undefined);
            }}
          >
            <option value="">Whole game</option>
            {focusOptions.map((option) => (
              <option key={option.ply} value={option.ply}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {typeof focusPly === "number" ? (
        <div className="mt-3 rounded-[16px] border border-sky-500/20 bg-sky-500/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
            Coach focus follows the selected move
          </p>
          <p className="mt-1 text-sm text-muted-strong">Questions now apply to ply {focusPly}.</p>
        </div>
      ) : null}

      {!hasLocalApiKey ? (
        <div className="mt-4">
          <UnlockAICoachCard
            compact
            title="Unlock move-by-move coaching"
            description="You already have the board and engine review here. Add your token to ask why this move failed, what you missed, and what to think about next time."
            bullets={[
              "Ask about the selected move or the whole game",
              "Save coach answers as notes tied to the exact position",
              "Keep every answer grounded in this analyzed game"
            ]}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((item) => (
          <button
            key={item}
            className="btn-secondary justify-start px-3 py-2 text-left text-xs uppercase tracking-[0.12em]"
            disabled={isPending || !hasLocalApiKey}
            onClick={() => submit(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {messages.length ? (
          <div className="scroll-panel max-h-[280px] space-y-3 overflow-y-auto pr-1">
            {messages.map((message, index) => (
              <div
                key={message.id ?? `${message.role}-${index}`}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[92%] rounded-[20px] px-4 py-3 text-sm leading-6 sm:max-w-[85%] ${
                    message.role === "user"
                      ? "border border-[color:var(--border)] bg-[color:var(--panel-soft)]"
                      : "border border-sky-500/20 bg-sky-500/10"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                      {message.role === "user" ? "You" : "Coach"}
                    </p>
                    {typeof message.focusPly === "number" ? (
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Ply {message.focusPly}
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
                  {message.role === "coach" ? (
                    <div className="mt-3 flex justify-end">
                      <NoteComposerTrigger
                        buttonLabel="Save as note"
                        buttonClassName="btn-ghost px-3 py-2 text-[11px] uppercase tracking-[0.12em]"
                        dialogTitle="Save coach answer as note"
                        initialBody={message.content}
                        profileUsername={getStoredActiveProfile() ?? "default"}
                        context={{
                          anchorType: typeof message.focusPly === "number" ? "move" : "game",
                          anchorLabel:
                            typeof message.focusPly === "number"
                              ? `Ply ${message.focusPly} • ${moveContextByPly.get(message.focusPly)?.san || "Coach lesson"}`
                              : props.opening || "Game coach note",
                          sourcePath:
                            typeof message.focusPly === "number"
                              ? `/games/${props.gameId}?ply=${message.focusPly}#review-coach`
                              : `/games/${props.gameId}#review-coach`,
                          gameId: props.gameId,
                          ply: typeof message.focusPly === "number" ? message.focusPly : undefined,
                          fen:
                            typeof message.focusPly === "number"
                              ? moveContextByPly.get(message.focusPly)?.fenAfter
                              : undefined,
                          opening: props.opening,
                          coachMessageContext: "game-coach"
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="surface-soft rounded-[20px] p-4 text-sm text-muted-strong">
            <p className="font-semibold">Ask about the selected move.</p>
            <p className="mt-2">
              Good prompts: why it was bad, what you missed, what to think next time, or what training task comes out
              of this position.
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-muted">
              Your coach thread is saved locally for this game.
            </p>
          </div>
        )}

        <form
          className="space-y-3 rounded-[20px] border border-[color:var(--border)] bg-[color:var(--panel-soft)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(question);
          }}
        >
          <textarea
            className="field-area min-h-24 rounded-[20px]"
            placeholder={
              hasLocalApiKey
                ? "Ask the coach about this game..."
                : "Unlock AI coach in Settings to ask about this move, this position, or the whole game..."
            }
            disabled={!hasLocalApiKey}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {notice ? <p className="text-xs text-[color:var(--error-text)]">{notice}</p> : <span />}
            {hasLocalApiKey ? (
              <button className="btn-primary text-sm" disabled={isPending} type="submit">
                {isPending ? "Thinking..." : "Ask coach"}
              </button>
            ) : (
              <Link className="btn-primary text-sm" href="/settings#ai-coach">
                Unlock AI coach
              </Link>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
