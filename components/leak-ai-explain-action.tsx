"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function LeakAIExplainAction(props: { leakKey: string; hasAIExamples: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        className="btn-secondary px-4 py-2 text-xs uppercase tracking-[0.12em]"
        disabled={isPending}
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
        {isPending ? "Working..." : props.hasAIExamples ? "Refresh ChatGPT examples" : "Analyze with ChatGPT"}
      </button>
      {notice ? <p className="text-xs text-muted">{notice}</p> : null}
    </div>
  );
}
