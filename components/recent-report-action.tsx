"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RecentReportAction(props: { hasReport: boolean; gamesAvailable: number }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <button
        className="btn-primary text-sm"
        disabled={isPending || props.gamesAvailable === 0}
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
        {isPending ? "Analyzing..." : props.hasReport ? "Refresh ChatGPT report" : "Analyze with ChatGPT"}
      </button>
      {notice ? <p className="text-xs text-muted">{notice}</p> : null}
    </div>
  );
}
