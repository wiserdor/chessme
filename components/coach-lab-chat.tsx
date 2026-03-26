"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { NoteComposerTrigger } from "@/components/note-composer-trigger";
import { UnlockAICoachCard } from "@/components/unlock-ai-coach-card";
import {
  appendCoachExchange,
  getCoachMessages,
  getPrivateAIConfig,
  getStoredActiveProfile,
  searchPrivateNotes
} from "@/lib/client/private-store";

type Message = {
  role: "user" | "coach";
  content: string;
  focusArea?: string | null;
};

const SUGGESTIONS = [
  "What should I focus on next week?",
  "Which blindspot is hurting me most right now?",
  "How do I turn this coach page into a training plan?",
  "What should I stop doing in my games?"
];

export function CoachLabChat(props: {
  focusOptions: Array<{ value: string; label: string }>;
  hasApiKey: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [focusArea, setFocusArea] = useState(props.focusOptions[0]?.value ?? "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasLocalApiKey, setHasLocalApiKey] = useState(props.hasApiKey);
  const [settings, setSettings] = useState<{ provider: "openai" | "mock"; model: string; apiKey?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadLocalState() {
      const profileUsername = getStoredActiveProfile() ?? "default";
      const [config, storedMessages] = await Promise.all([
        getPrivateAIConfig(),
        getCoachMessages(profileUsername, "coach-lab")
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
            role: message.role,
            content: message.content,
            focusArea: message.focusArea ?? null
          }))
        );
      }
    }

    void loadLocalState();
    return () => {
      cancelled = true;
    };
  }, [props.hasApiKey]);

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

      const optimistic: Message = {
        role: "user",
        content: trimmed,
        focusArea: focusArea || null
      };
      setMessages((current) => [...current, optimistic]);
      setQuestion("");

      try {
        const profileUsername = getStoredActiveProfile() ?? "default";
        const relevantNotes = await searchPrivateNotes(profileUsername, {
          anchorType: "coach-flow",
          ...(focusArea ? { focusArea } : {}),
          limit: 5
        });

        const response = await fetch("/api/coach-lab/coach-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmed,
            focusArea: focusArea || undefined,
            history: messages.slice(-10).map((message) => ({
              role: message.role,
              content: message.content,
              focusArea: message.focusArea ?? null
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
          setMessages((current) => current.slice(0, -1));
          setNotice(payload.error || "Could not reach the coach.");
          return;
        }

        await appendCoachExchange(profileUsername, "coach-lab", {
          question: trimmed,
          answer: payload.answer,
          focusArea: focusArea || null
        });
        const nextMessages = await getCoachMessages(profileUsername, "coach-lab");
        setMessages(
          nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
            focusArea: message.focusArea ?? null
          }))
        );
      } catch {
        setMessages((current) => current.slice(0, -1));
        setNotice("Could not reach the coach. Please try again.");
      }
    });
  }

  return (
    <section className="panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="badge">Coach Chat</span>
          <h2 className="panel-title mt-3">Ask the coach about your recent games</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Ask about your biggest blindspots, what to train next, or which recent example you should review first.
          </p>
        </div>
        <div className="w-full min-w-0 sm:w-auto sm:min-w-[240px]">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="coach-lab-focus">
            Focus area
          </label>
          <select
            id="coach-lab-focus"
            className="field-muted mt-2"
            value={focusArea}
            onChange={(event) => setFocusArea(event.target.value)}
          >
            {props.focusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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

      {!hasLocalApiKey ? (
        <div className="mt-4">
          <UnlockAICoachCard
            compact
            title="Unlock your recent-games coach"
            description="This page gets much stronger with ChatGPT: style diagnosis, training priorities, and practical follow-up questions grounded in your own games."
            bullets={[
              "Ask which blindspot is costing you the most",
              "Turn this page into a weekly training plan",
              "Save coach answers as notes for future sessions"
            ]}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="surface-soft rounded-[24px] p-4">
          {messages.length ? (
            <div className="scroll-panel max-h-[340px] space-y-3 overflow-y-auto pr-1">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[92%] rounded-[20px] px-4 py-3 text-sm leading-6 sm:max-w-[85%] ${
                      message.role === "user"
                        ? "border border-[color:var(--border)] bg-[color:var(--panel-strong)]"
                        : "border border-sky-500/20 bg-sky-500/10"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                        {message.role === "user" ? "You" : "Coach"}
                      </p>
                      {message.focusArea ? (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                          {message.focusArea}
                        </p>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
                    {message.role === "coach" ? (
                      <div className="mt-3 flex justify-end">
                        <NoteComposerTrigger
                          buttonLabel="Save as note"
                          buttonClassName="btn-ghost px-3 py-2 text-[11px] uppercase tracking-[0.12em]"
                          dialogTitle="Save coach note"
                          initialBody={message.content}
                          profileUsername={getStoredActiveProfile() ?? "default"}
                          context={{
                            anchorType: "coach-flow",
                            anchorLabel: message.focusArea || "Coach lab",
                            sourcePath: "/coach-lab",
                            focusArea: message.focusArea || undefined,
                            coachMessageContext: "coach-lab"
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[20px] border border-[color:var(--border)] bg-[color:var(--panel-strong)] p-4 text-sm text-muted-strong">
              Ask for:
              <ul className="mt-2 space-y-1 leading-6">
                <li>what to focus on next</li>
                <li>which leak matters most</li>
                <li>how to turn the page into a weekly plan</li>
                <li>which linked example you should review first</li>
              </ul>
            </div>
          )}
        </div>

        <form
          className="surface-card space-y-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(question);
          }}
        >
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="coach-lab-question">
            Your question
          </label>
          <textarea
            id="coach-lab-question"
            className="field-area min-h-28 rounded-[20px]"
            placeholder={
              hasLocalApiKey
                ? "Ask the coach about this page..."
                : "Unlock AI coach in Settings to ask about blindspots, trends, and what to train next..."
            }
            disabled={!hasLocalApiKey}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          {notice ? <p className="text-xs text-[color:var(--error-text)]">{notice}</p> : null}
          {hasLocalApiKey ? (
            <button className="btn-primary w-full text-sm" disabled={isPending} type="submit">
              {isPending ? "Thinking..." : "Ask coach"}
            </button>
          ) : (
            <Link className="btn-primary w-full text-center text-sm" href="/settings#ai-coach">
              Unlock AI coach
            </Link>
          )}
        </form>
      </div>
    </section>
  );
}
