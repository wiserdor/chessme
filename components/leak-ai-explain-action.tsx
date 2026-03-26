"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  getPrivateAIConfig,
  getPrivateLeakExplanationCache,
  getStoredActiveProfile,
  savePrivateLeakExplanationCache
} from "@/lib/client/private-store";

export function LeakAIExplainAction(props: { leakKey: string; hasAIExamples: boolean; hasApiKey: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [hasAIExamples, setHasAIExamples] = useState(props.hasAIExamples);
  const [hasLocalApiKey, setHasLocalApiKey] = useState(props.hasApiKey);
  const [settings, setSettings] = useState<{ provider: "openai" | "mock"; model: string; apiKey?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadLocalState() {
      const profileUsername = getStoredActiveProfile() ?? "default";
      const [config, cache] = await Promise.all([
        getPrivateAIConfig(),
        getPrivateLeakExplanationCache(profileUsername, props.leakKey)
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
      if (cache?.examples.some((example) => example.source === "ai")) {
        setHasAIExamples(true);
      }
    }

    void loadLocalState();
    return () => {
      cancelled = true;
    };
  }, [props.hasAIExamples, props.hasApiKey, props.leakKey]);

  return (
    <div className="space-y-2">
      {hasLocalApiKey ? (
        <button
          className="btn-secondary px-4 py-2 text-xs uppercase tracking-[0.12em]"
          disabled={isPending}
          onClick={() => {
            setNotice(null);
            startTransition(async () => {
              const profileUsername = getStoredActiveProfile() ?? "default";
              if (!settings?.apiKey) {
                setNotice("Add your OpenAI token in Settings before using ChatGPT leak explanations.");
                return;
              }

              const response = await fetch(`/api/leaks/${props.leakKey}/ai-explain`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings })
              });
              const payload = (await response.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                message?: string;
                examples?: Array<{
                  gameId: string;
                  ply: number;
                  explanation: string;
                  whyLeak: string;
                  source: "ai";
                }>;
                provider?: string;
                model?: string;
              };

              if (!response.ok || payload.ok === false) {
                setNotice(payload.error || "Could not generate ChatGPT explanations.");
                return;
              }

              await savePrivateLeakExplanationCache(profileUsername, props.leakKey, {
                examples: payload.examples ?? [],
                provider: payload.provider || "openai",
                model: payload.model || settings.model
              });
              window.dispatchEvent(new Event("private-leak-ai-updated"));
              setNotice(payload.message || "ChatGPT explanations generated.");
              setHasAIExamples(Boolean(payload.examples?.length));
              router.refresh();
            });
          }}
          type="button"
        >
          {isPending ? "Working..." : hasAIExamples ? "Refresh ChatGPT examples" : "Analyze with ChatGPT"}
        </button>
      ) : (
        <Link className="btn-secondary px-4 py-2 text-xs uppercase tracking-[0.12em]" href="/settings#ai-coach">
          Unlock AI coach
        </Link>
      )}
      {notice || !hasLocalApiKey ? (
        <p className="text-xs text-muted">{notice || "Add your token to unlock coach-backed explanations for this leak."}</p>
      ) : null}
    </div>
  );
}
