"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function LeakAIExplainAction(props: { leakKey: string; hasAIExamples: boolean; hasApiKey: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        className="btn-secondary px-4 py-2 text-xs uppercase tracking-[0.12em]"
        disabled={isPending || !props.hasApiKey}
        onClick={() => {
          setNotice(null);
          startTransition(async () => {
            const response = await fetch(`/api/leaks/${props.leakKey}/ai-explain`, {
              method: "POST"
            });
            const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };

            if (!response.ok || payload.ok === false) {
              setNotice(payload.error || "Could not generate ChatGPT explanations.");
              return;
            }

            setNotice(payload.message || "ChatGPT explanations generated.");
            router.refresh();
          });
        }}
        type="button"
      >
        {isPending ? "Working..." : !props.hasApiKey ? "Add token for ChatGPT" : props.hasAIExamples ? "Refresh ChatGPT examples" : "Analyze with ChatGPT"}
      </button>
      {notice || !props.hasApiKey ? (
        <p className="text-xs text-muted">{notice || "Add your OpenAI token in Settings before using ChatGPT on leak pages."}</p>
      ) : null}
    </div>
  );
}
