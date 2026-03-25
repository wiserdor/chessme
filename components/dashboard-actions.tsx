"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Notice = {
  type: "success" | "error";
  message: string;
};

type AnalysisJobState = {
  id: string;
  status: string;
  totalGames: number;
  processedGames: number;
  message: string | null;
};

type DateRangePreset =
  | "last-3-months"
  | "last-6-months"
  | "last-12-months"
  | "this-year"
  | "all-time"
  | "custom";

const DASHBOARD_ANALYZE_LIMIT = 20;

async function parseJson(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || payload.ok === false) {
    throw new Error(String(payload.error ?? "Request failed"));
  }

  return payload;
}

function toMonthInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonths(base: Date, deltaMonths: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + deltaMonths, 1);
}

function toApiMonth(monthInput: string): string | undefined {
  if (!monthInput) {
    return undefined;
  }

  const [year, month] = monthInput.split("-");
  if (!year || !month) {
    return undefined;
  }

  return `${year}/${month}`;
}

function buildPresetRange(preset: DateRangePreset): { from: string; to: string } {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  switch (preset) {
    case "last-3-months":
      return {
        from: toMonthInputValue(shiftMonths(currentMonth, -2)),
        to: toMonthInputValue(currentMonth)
      };
    case "last-6-months":
      return {
        from: toMonthInputValue(shiftMonths(currentMonth, -5)),
        to: toMonthInputValue(currentMonth)
      };
    case "last-12-months":
      return {
        from: toMonthInputValue(shiftMonths(currentMonth, -11)),
        to: toMonthInputValue(currentMonth)
      };
    case "this-year":
      return {
        from: `${currentMonth.getFullYear()}-01`,
        to: toMonthInputValue(currentMonth)
      };
    case "all-time":
      return {
        from: "",
        to: ""
      };
    case "custom":
      return {
        from: "",
        to: ""
      };
  }
}

function analysisProgress(job: AnalysisJobState | null) {
  if (!job) {
    return 0;
  }

  if (job.totalGames <= 0) {
    return 12;
  }

  return Math.max(12, Math.min(100, Math.round((job.processedGames / job.totalGames) * 100)));
}

function analysisStatusLabel(job: AnalysisJobState) {
  if (job.totalGames > 0 && job.processedGames > 0) {
    return `${job.processedGames}/${job.totalGames} games done`;
  }

  if (job.totalGames > 0) {
    return `Preparing ${job.totalGames} games`;
  }

  return job.status;
}

function analysisStatusDetail(job: AnalysisJobState) {
  if (job.message?.trim()) {
    return job.message;
  }

  if (job.status === "pending") {
    return "Queued on the server and waiting for the analysis worker.";
  }

  if (job.status === "running") {
    return "The server is preparing games and starting the first engine pass.";
  }

  return "Analysis in progress.";
}

export function DashboardActions(props: {
  defaultUsername?: string;
  initialAnalysisJob?: AnalysisJobState | null;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [toast, setToast] = useState<Notice | null>(null);
  const [username, setUsername] = useState(props.defaultUsername ?? "");
  const [rangePreset, setRangePreset] = useState<DateRangePreset>("last-12-months");
  const [syncFrom, setSyncFrom] = useState(buildPresetRange("last-12-months").from);
  const [syncTo, setSyncTo] = useState(buildPresetRange("last-12-months").to);
  const [pgnText, setPgnText] = useState("");
  const [analysisJob, setAnalysisJob] = useState<AnalysisJobState | null>(props.initialAnalysisJob ?? null);
  const [isPending, startTransition] = useTransition();
  const isAnalyzingInBackground = Boolean(
    analysisJob && (analysisJob.status === "pending" || analysisJob.status === "running")
  );

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 5000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  useEffect(() => {
    if (!analysisJob || (analysisJob.status !== "pending" && analysisJob.status !== "running")) {
      return;
    }

    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/analysis/jobs/${analysisJob.id}`, {
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        job?: {
          id: string;
          status: string;
          totalGames: number;
          processedGames: number;
          message: string | null;
          error: string | null;
        };
      };

      if (!response.ok || payload.ok === false || !payload.job) {
        setAnalysisJob(null);
        const nextNotice = {
          type: "error",
          message: payload.error || "Could not refresh analysis status."
        } as const;
        setNotice(nextNotice);
        setToast(nextNotice);
        return;
      }

      setAnalysisJob(payload.job);

      if (payload.job.status === "completed") {
        window.clearInterval(timer);
        setAnalysisJob(null);
        const nextNotice = {
          type: "success",
          message: payload.job.message || "Analysis complete."
        } as const;
        setNotice(nextNotice);
        setToast(nextNotice);
        router.refresh();
      } else if (payload.job.status === "failed") {
        window.clearInterval(timer);
        setAnalysisJob(null);
        const nextNotice = {
          type: "error",
          message: payload.job.error || "Analysis failed."
        } as const;
        setNotice(nextNotice);
        setToast(nextNotice);
        router.refresh();
      }
    }, 1500);

    return () => {
      window.clearInterval(timer);
    };
  }, [analysisJob, router]);

  function validateSyncInputs() {
    if (!username.trim()) {
      throw new Error("Chess.com username is required.");
    }

    if (syncFrom && syncTo && syncFrom > syncTo) {
      throw new Error("Invalid range: start month must be before end month.");
    }
  }

  async function startAnalysisJob(limit = DASHBOARD_ANALYZE_LIMIT): Promise<string> {
    const payload = await parseJson(
      await fetch("/api/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit })
      })
    );

    const jobId = typeof payload.jobId === "string" ? payload.jobId : null;
    const message =
      typeof payload.message === "string" && payload.message.trim()
        ? payload.message
        : `Analysis queued for up to ${limit} games.`;

    if (!jobId) {
      setAnalysisJob(null);
      return message;
    }

    setAnalysisJob({
      id: jobId,
      status: typeof payload.status === "string" ? payload.status : "pending",
      totalGames: typeof payload.totalGames === "number" ? payload.totalGames : 0,
      processedGames: typeof payload.processedGames === "number" ? payload.processedGames : 0,
      message
    });

    return message;
  }

  async function runSync(analyzeAfter: boolean): Promise<string> {
    validateSyncInputs();

    const importPayload = await parseJson(
      await fetch("/api/import/chesscom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          from: toApiMonth(syncFrom),
          to: toApiMonth(syncTo)
        })
      })
    );

    if (!analyzeAfter) {
      const imported = typeof importPayload.imported === "number" ? importPayload.imported : null;
      return imported === null ? "Sync complete." : `Sync complete. Imported ${imported} games.`;
    }

    const queued = await startAnalysisJob(DASHBOARD_ANALYZE_LIMIT);
    const imported = typeof importPayload.imported === "number" ? importPayload.imported : null;
    return imported === null ? queued : `Imported ${imported} games. ${queued}`;
  }

  function runAction(action: () => Promise<string | void>, options?: { refreshOnSuccess?: boolean }) {
    setNotice(null);
    startTransition(async () => {
      try {
        const message = await action();
        const nextNotice = {
          type: "success",
          message: message || "Done."
        } as const;
        setNotice(nextNotice);
        setToast(nextNotice);
        if (options?.refreshOnSuccess !== false) {
          router.refresh();
        }
      } catch (error) {
        const nextNotice = {
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error"
        } as const;
        setNotice(nextNotice);
        setToast(nextNotice);
      }
    });
  }

  return (
    <section className="panel space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="badge">Control Room</span>
          <h2 className="panel-title mt-3">Sync and analyze</h2>
        </div>
        <button
          className="btn-secondary w-full px-5 py-3 text-sm sm:w-auto"
          disabled={isPending || isAnalyzingInBackground}
          onClick={() =>
            runAction(async () => {
              return startAnalysisJob(DASHBOARD_ANALYZE_LIMIT);
            }, { refreshOnSuccess: false })
          }
        >
          {isPending || isAnalyzingInBackground ? "Analysis in progress" : "Analyze existing only"}
        </button>
      </div>

      {notice ? (
        <p
          className={notice.type === "success" ? "status-success" : "status-error"}
        >
          {notice.message}
        </p>
      ) : null}
      {analysisJob ? (
        <div className="status-info space-y-3 rounded-[24px] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{analysisStatusDetail(analysisJob)}</p>
              {analysisJob.totalGames > 0 && analysisJob.processedGames === 0 ? (
                <p className="mt-1 text-xs opacity-80">The server is still setting up the first game. Progress starts after the first finished game.</p>
              ) : null}
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">
              {analysisStatusLabel(analysisJob)}
            </p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-blue-500/15">
            <div
              className="h-full rounded-full bg-[color:var(--primary)] transition-all duration-300"
              style={{ width: `${analysisProgress(analysisJob)}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <form
          className="surface-soft p-4"
          onSubmit={(event) => {
            event.preventDefault();
            runAction(async () => {
              await parseJson(
                await fetch("/api/profile/chesscom/connect", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ username })
                })
              );
              return "Profile saved.";
            });
          }}
        >
          <h3 className="font-display text-xl">Connect Chess.com</h3>
          <p className="mt-2 text-sm text-muted">Save your default username and AI settings profile.</p>
          <input
            className="field mt-4"
            placeholder="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <button className="btn-primary mt-4 w-full sm:w-auto" disabled={isPending}>
            Save profile
          </button>
        </form>

        <form
          className="surface-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            runAction(async () => runSync(true), { refreshOnSuccess: false });
          }}
        >
          <h3 className="font-display text-xl">Sync + Analyze (recommended)</h3>
          <p className="mt-2 text-sm text-muted">
            One click fetches games, then analyzes up to the first 20 pending games. Engine review runs per game, and
            ChatGPT coaching is grouped into batched prompts to avoid token waste.
          </p>
          <div className="mt-4 grid gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="sync-preset">
              Range preset
            </label>
            <select
              id="sync-preset"
              className="field-muted"
              value={rangePreset}
              onChange={(event) => {
                const nextPreset = event.target.value as DateRangePreset;
                setRangePreset(nextPreset);
                if (nextPreset !== "custom") {
                  const range = buildPresetRange(nextPreset);
                  setSyncFrom(range.from);
                  setSyncTo(range.to);
                }
              }}
            >
              <option value="last-3-months">Last 3 months</option>
              <option value="last-6-months">Last 6 months</option>
              <option value="last-12-months">Last 12 months (default)</option>
              <option value="this-year">This year</option>
              <option value="all-time">All available</option>
              <option value="custom">Custom</option>
            </select>

            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="sync-from">
              From month
            </label>
            <input
              id="sync-from"
              type="month"
              className="field-muted"
              value={syncFrom}
              disabled={rangePreset === "all-time"}
              onChange={(event) => {
                setRangePreset("custom");
                setSyncFrom(event.target.value);
              }}
            />
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="sync-to">
              To month
            </label>
            <input
              id="sync-to"
              type="month"
              className="field-muted"
              value={syncTo}
              disabled={rangePreset === "all-time"}
              onChange={(event) => {
                setRangePreset("custom");
                setSyncTo(event.target.value);
              }}
            />
            <p className="text-xs text-muted">
              Sent to API as `YYYY/MM`. Select "All available" to sync every published archive month.
            </p>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              className="btn-primary w-full sm:w-auto"
              disabled={isPending || isAnalyzingInBackground}
            >
              {isPending || isAnalyzingInBackground ? "Analysis in progress" : "Sync + Analyze"}
            </button>
            <button
              className="btn-secondary w-full sm:w-auto"
              disabled={isPending || isAnalyzingInBackground}
              onClick={(event) => {
                event.preventDefault();
                runAction(async () => runSync(false));
              }}
              type="button"
            >
              {isAnalyzingInBackground ? "Analysis in progress" : "Sync only"}
            </button>
          </div>
        </form>

        <form
          className="surface-contrast p-4"
          onSubmit={(event) => {
            event.preventDefault();
            runAction(async () => {
              const payload = await parseJson(
                await fetch("/api/import/pgn", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text: pgnText })
                })
              );
              setPgnText("");
              const imported = typeof payload.imported === "number" ? payload.imported : null;
              return imported === null ? "PGN import complete." : `PGN import complete. Imported ${imported} games.`;
            });
          }}
        >
          <h3 className="font-display text-xl">PGN fallback</h3>
          <p className="mt-2 text-sm opacity-75">Paste one or many games to import them without Chess.com sync.</p>
          <textarea
            className="field-area mt-4"
            placeholder='[Event "Live Chess"]'
            value={pgnText}
            onChange={(event) => setPgnText(event.target.value)}
          />
          <button className="btn-secondary mt-4 w-full sm:w-auto" disabled={isPending}>
            Import PGN
          </button>
        </form>
      </div>

      {toast ? (
        <div
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-[24px] border px-5 py-4 text-sm shadow-2xl backdrop-blur ${
            toast.type === "success" ? "status-success border-emerald-500/20" : "status-error border-red-500/20"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                {toast.type === "success" ? "Job update" : "Job error"}
              </p>
              <p className="mt-1 leading-6">{toast.message}</p>
            </div>
            <button
              className="btn-secondary px-2 py-1 text-xs"
              onClick={() => setToast(null)}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
