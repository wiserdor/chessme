"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RecentReportAction(props: { hasReport: boolean; gamesAvailable: number; hasApiKey: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        className="btn-primary text-sm"
        disabled={isPending || props.gamesAvailable === 0 || !props.hasApiKey}
        onClick={() => {
          setNotice(null);
          startTransition(async () => {
            const response = await fetch("/api/reports/recent/ai-review", {
              method: "POST"
            });
            const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };

            if (!response.ok || payload.ok === false) {
              setNotice(payload.error || "Could not generate report.");
              return;
            }

            setNotice(payload.message || "Report generated.");
            router.refresh();
          });
        }}
        type="button"
      >
        {isPending ? "Analyzing..." : !props.hasApiKey ? "Add token for ChatGPT" : props.hasReport ? "Refresh ChatGPT report" : "Analyze with ChatGPT"}
      </button>
      {notice || !props.hasApiKey ? (
        <p className="text-xs text-muted">
          {notice || "Add your OpenAI token in Settings before generating coach reports."}
        </p>
      ) : null}
    </div>
  );
}
