"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  getPrivateAIConfig,
  getPrivateGameAIReview,
  getStoredActiveProfile,
  savePrivateGameAIReview
} from "@/lib/client/private-store";

export function GameAIReviewAction(props: {
  gameId: string;
  profileUsername?: string;
  hasAIReview: boolean;
  analysisStatus: string;
  hasApiKey: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [hasCompletedReview, setHasCompletedReview] = useState(props.hasAIReview);
  const [hasLocalApiKey, setHasLocalApiKey] = useState(props.hasApiKey);
  const [settings, setSettings] = useState<{ provider: "openai" | "mock"; model: string; apiKey?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadLocalState() {
      const profileUsername = props.profileUsername ?? getStoredActiveProfile() ?? "default";
      const [config, cachedReview] = await Promise.all([
        getPrivateAIConfig(),
        getPrivateGameAIReview(profileUsername, props.gameId)
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
      if (cachedReview) {
        setHasCompletedReview(true);
      }
    }

    void loadLocalState();
    return () => {
      cancelled = true;
    };
  }, [props.gameId, props.hasApiKey, props.profileUsername]);

  const isBlocked = props.analysisStatus !== "analyzed" || !hasLocalApiKey;
  const label = hasCompletedReview
    ? "Re-analyze with ChatGPT"
    : !hasLocalApiKey
      ? "Add token for ChatGPT"
      : isBlocked
        ? props.analysisStatus === "analyzing"
          ? "Game is being analyzed"
          : "Run game analysis first"
        : props.hasAIReview
          ? "Refresh with ChatGPT"
          : "Analyze with ChatGPT";

  const helperText =
    notice ||
    (!hasLocalApiKey
      ? "Add your OpenAI token in Settings before using ChatGPT on games."
      : props.analysisStatus === "analyzing"
        ? "This game is still in the analysis queue."
        : props.analysisStatus === "pending"
          ? "Wait until the main game analysis finishes."
          : hasCompletedReview
            ? "This will replace the current private ChatGPT review and refresh the critical-moment learnings."
            : null);

  return (
    <div className="space-y-2">
      {hasCompletedReview ? (
        <p className="inline-flex items-center rounded-full bg-sky-500/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
          ChatGPT review saved on this device
        </p>
      ) : null}
      {hasLocalApiKey ? (
        <button
          className="btn-primary px-4 py-2 text-xs uppercase tracking-[0.12em]"
          disabled={isPending || isBlocked}
          onClick={() => {
            setNotice(null);
            startTransition(async () => {
              const profileUsername = props.profileUsername ?? getStoredActiveProfile() ?? "default";
              if (!settings?.apiKey) {
                setNotice("Add your OpenAI token in Settings before using ChatGPT on games.");
                return;
              }

              const response = await fetch(`/api/games/${props.gameId}/ai-review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  force: hasCompletedReview,
                  settings
                })
              });
              const payload = (await response.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                message?: string;
                review?: {
                  summary: string;
                  coachingNotes: string[];
                  actionItems: string[];
                  confidence: number;
                };
                criticalMoments?: Array<{
                  ply: number;
                  label: string;
                  whatHappened: string;
                  whyItMatters: string;
                  whatToThink: string;
                  trainingFocus: string;
                  confidence: number;
                }>;
                provider?: string;
                model?: string;
              };

              if (!response.ok || payload.ok === false || !payload.review) {
                setNotice(payload.error || "Could not generate ChatGPT review.");
                return;
              }

              await savePrivateGameAIReview(profileUsername, props.gameId, {
                review: payload.review,
                criticalMoments: payload.criticalMoments ?? [],
                provider: payload.provider || "openai",
                model: payload.model || settings.model
              });
              window.dispatchEvent(new Event("private-game-review-updated"));
              setNotice(payload.message || "ChatGPT review generated.");
              setHasCompletedReview(true);
              router.refresh();
            });
          }}
          type="button"
        >
          {isPending ? "Working..." : label}
        </button>
      ) : (
        <Link className="btn-primary px-4 py-2 text-xs uppercase tracking-[0.12em]" href="/settings#ai-coach">
          Unlock AI coach
        </Link>
      )}
      {helperText ? <p className="text-xs text-muted">{helperText}</p> : null}
    </div>
  );
}
