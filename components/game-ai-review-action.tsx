"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function GameAIReviewAction(props: { gameId: string; hasAIReview: boolean; analysisStatus: string; hasApiKey: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [hasCompletedReview, setHasCompletedReview] = useState(props.hasAIReview);
  const [isPending, startTransition] = useTransition();
  const isBlocked = props.analysisStatus !== "analyzed" || !props.hasApiKey;
  const label = hasCompletedReview
    ? "Re-analyze with ChatGPT"
    : !props.hasApiKey
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
    (!props.hasApiKey
      ? "Add your OpenAI token in Settings before using ChatGPT on games."
      :
    (props.analysisStatus === "analyzing"
      ? "This game is still in the analysis queue."
      : props.analysisStatus === "pending"
        ? "Wait until the main game analysis finishes."
        : hasCompletedReview
          ? "This will replace the current ChatGPT review and refresh the critical-moment learnings."
          : null));

  return (
    <div className="space-y-2">
      <button
        className="btn-primary px-4 py-2 text-xs uppercase tracking-[0.12em]"
        disabled={isPending || isBlocked}
        onClick={() => {
          setNotice(null);
          startTransition(async () => {
            const response = await fetch(`/api/games/${props.gameId}/ai-review`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ force: hasCompletedReview })
            });
            const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };

            if (!response.ok || payload.ok === false) {
              setNotice(payload.error || "Could not generate ChatGPT review.");
              return;
            }

            setNotice(payload.message || "ChatGPT review generated.");
            setHasCompletedReview(true);
            router.refresh();
            window.location.reload();
          });
        }}
        type="button"
      >
        {isPending ? "Working..." : label}
      </button>
      {helperText ? <p className="text-xs text-muted">{helperText}</p> : null}
    </div>
  );
}
