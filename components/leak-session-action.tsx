"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  leakKey: string;
};

export function LeakSessionAction(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="btn-primary text-sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const response = await fetch(`/api/leaks/${props.leakKey}/coach-session`, {
              method: "POST"
            });

            const payload = (await response.json()) as { ok: boolean; error?: string; queued?: number };
            if (!response.ok || payload.ok === false) {
              setError(payload.error ?? "Could not start coach session.");
              return;
            }

            if (!payload.queued) {
              setError("No related drills yet. Run analysis first.");
              return;
            }

            router.push("/training");
            router.refresh();
          });
        }}
        type="button"
      >
        {isPending ? "Starting..." : "Start 15-min coach session"}
      </button>
      {error ? <p className="text-sm text-[color:var(--error-text)]">{error}</p> : null}
    </div>
  );
}
