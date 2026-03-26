"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ProfileBrowser } from "@/components/profile-browser";
import { getPrivateAIConfig, getPrivateGameAIReview, savePrivateGameAIReview } from "@/lib/client/private-store";

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

type PrivateAIEnrichmentState = {
  status: "idle" | "running" | "completed" | "failed";
  totalGames: number;
  processedGames: number;
  enrichedGames: number;
  skippedGames: number;
  failedGames: number;
  message: string | null;
};

type DateRangePreset =
  | "last-3-months"
  | "last-6-months"
  | "last-12-months"
  | "this-year"
  | "all-time"
  | "custom";

const DEFAULT_ANALYZE_LIMIT = 10;
const MAX_ANALYZE_LIMIT = 30;

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

function aiEnrichmentProgress(state: PrivateAIEnrichmentState | null) {
  if (!state) {
    return 0;
  }

  if (state.totalGames <= 0) {
    return 0;
  }

  return Math.max(8, Math.min(100, Math.round((state.processedGames / state.totalGames) * 100)));
}

export function DashboardActions(props: {
  activeUsername?: string;
  initialAnalysisJob?: AnalysisJobState | null;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [toast, setToast] = useState<Notice | null>(null);
  const [rangePreset, setRangePreset] = useState<DateRangePreset>("last-12-months");
  const [syncFrom, setSyncFrom] = useState(buildPresetRange("last-12-months").from);
  const [syncTo, setSyncTo] = useState(buildPresetRange("last-12-months").to);
  const [analyzeLimit, setAnalyzeLimit] = useState(String(DEFAULT_ANALYZE_LIMIT));
  const [pgnText, setPgnText] = useState("");
  const [analysisJob, setAnalysisJob] = useState<AnalysisJobState | null>(props.initialAnalysisJob ?? null);
  const [plannedGameIds, setPlannedGameIds] = useState<string[]>([]);
  const [privateAIEnrichment, setPrivateAIEnrichment] = useState<PrivateAIEnrichmentState | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAnalyzingInBackground = Boolean(
    analysisJob && (analysisJob.status === "pending" || analysisJob.status === "running")
  );
  const isPrivateAIEnriching = privateAIEnrichment?.status === "running";

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
        const completionMessage = payload.job.message || "Analysis complete.";
        void maybeStartPrivateAIEnrichment(plannedGameIds);
        const nextNotice = {
          type: "success",
          message: completionMessage
        } as const;
        setNotice(nextNotice);
        setToast(nextNotice);
        router.refresh();
      } else if (payload.job.status === "failed") {
        window.clearInterval(timer);
        setAnalysisJob(null);
        setPlannedGameIds([]);
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
  }, [analysisJob, plannedGameIds, router]);

  function parsedAnalyzeLimit() {
    const parsed = Number.parseInt(analyzeLimit, 10);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_ANALYZE_LIMIT;
    }

    return Math.max(1, Math.min(MAX_ANALYZE_LIMIT, parsed));
  }

  function validateSyncInputs() {
    if (!props.activeUsername?.trim()) {
      throw new Error("Choose a Chess.com profile first.");
    }

    if (syncFrom && syncTo && syncFrom > syncTo) {
      throw new Error("Invalid range: start month must be before end month.");
    }
  }

  async function fetchPendingGameIds(limit: number) {
    const activeUsername = props.activeUsername?.trim();
    if (!activeUsername) {
      throw new Error("Choose a Chess.com profile first.");
    }

    const response = await fetch(
      `/api/public/profiles/${encodeURIComponent(activeUsername)}/games?status=pending&limit=${limit}`,
      { cache: "no-store" }
    );
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      history?: {
        games?: Array<{ id: string }>;
      };
    };

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Could not load pending games.");
    }

    return (payload.history?.games ?? []).map((game) => game.id).filter(Boolean);
  }

  async function maybeStartPrivateAIEnrichment(gameIds: string[]) {
    const activeUsername = props.activeUsername?.trim();
    if (!activeUsername || !gameIds.length) {
      setPlannedGameIds([]);
      return;
    }

    const config = await getPrivateAIConfig();
    if (config.provider !== "openai" || !config.apiKey) {
      setPlannedGameIds([]);
      return;
    }

    setPrivateAIEnrichment({
      status: "running",
      totalGames: gameIds.length,
      processedGames: 0,
      enrichedGames: 0,
      skippedGames: 0,
      failedGames: 0,
      message: "ChatGPT coach is enriching the analyzed batch on this device."
    });

    let enrichedGames = 0;
    let skippedGames = 0;
    let failedGames = 0;

    for (let index = 0; index < gameIds.length; index += 1) {
      const gameId = gameIds[index] as string;

      setPrivateAIEnrichment({
        status: "running",
        totalGames: gameIds.length,
        processedGames: index,
        enrichedGames,
        skippedGames,
        failedGames,
        message: `ChatGPT coach is enriching game ${index + 1} of ${gameIds.length}.`
      });

      const existing = await getPrivateGameAIReview(activeUsername, gameId);
      if (existing) {
        skippedGames += 1;
        setPrivateAIEnrichment({
          status: "running",
          totalGames: gameIds.length,
          processedGames: index + 1,
          enrichedGames,
          skippedGames,
          failedGames,
          message: `Skipped ${skippedGames} games that already had a local ChatGPT review.`
        });
        continue;
      }

      const response = await fetch(`/api/games/${gameId}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          force: false,
          settings: {
            provider: "openai",
            model: config.model,
            apiKey: config.apiKey
          }
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        updated?: boolean;
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
        failedGames += 1;
      } else {
        await savePrivateGameAIReview(activeUsername, gameId, {
          review: payload.review,
          criticalMoments: payload.criticalMoments ?? [],
          provider: payload.provider || "openai",
          model: payload.model || config.model
        });
        enrichedGames += 1;
      }

      setPrivateAIEnrichment({
        status: "running",
        totalGames: gameIds.length,
        processedGames: index + 1,
        enrichedGames,
        skippedGames,
        failedGames,
        message:
          failedGames > 0
            ? `ChatGPT enriched ${enrichedGames} games. ${failedGames} failed and can be retried from the game page.`
            : `ChatGPT enriched ${enrichedGames} games so far.`
      });

      if (index < gameIds.length - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
      }
    }

    window.dispatchEvent(new Event("private-game-review-updated"));
    setPlannedGameIds([]);
    const finalMessage =
      failedGames > 0
        ? `ChatGPT coach finished: ${enrichedGames} enriched, ${skippedGames} skipped, ${failedGames} failed.`
        : `ChatGPT coach finished: ${enrichedGames} enriched, ${skippedGames} skipped.`;
    const finalState: PrivateAIEnrichmentState = {
      status: failedGames > 0 ? "failed" : "completed",
      totalGames: gameIds.length,
      processedGames: gameIds.length,
      enrichedGames,
      skippedGames,
      failedGames,
      message: finalMessage
    };
    setPrivateAIEnrichment(finalState);
    const nextNotice: Notice = {
      type: failedGames > 0 ? "error" : "success",
      message: finalMessage
    };
    setNotice(nextNotice);
    setToast(nextNotice);
    router.refresh();
  }

  async function startAnalysisJob(limit = DEFAULT_ANALYZE_LIMIT, gameIds?: string[]): Promise<string> {
    const payload = await parseJson(
      await fetch("/api/analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, gameIds })
      })
    );

    const jobId = typeof payload.jobId === "string" ? payload.jobId : null;
    const message =
      typeof payload.message === "string" && payload.message.trim()
        ? payload.message
        : `Analysis queued for up to ${limit} games.`;

    if (!jobId) {
      setAnalysisJob(null);
      setPlannedGameIds([]);
      return message;
    }

    setPrivateAIEnrichment(null);
    setPlannedGameIds(gameIds ?? []);
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
    const activeUsername = props.activeUsername?.trim();
    if (!activeUsername) {
      throw new Error("Choose a Chess.com profile first.");
    }

    const importPayload = await parseJson(
      await fetch("/api/import/chesscom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: activeUsername,
          from: toApiMonth(syncFrom),
          to: toApiMonth(syncTo)
        })
      })
    );

    if (!analyzeAfter) {
      const imported = typeof importPayload.imported === "number" ? importPayload.imported : null;
      return imported === null ? "Sync complete." : `Sync complete. Imported ${imported} games.`;
    }

    const gameIds = await fetchPendingGameIds(parsedAnalyzeLimit());
    const queued = await startAnalysisJob(gameIds.length || parsedAnalyzeLimit(), gameIds);
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
    <section className="panel space-y-5" id="control-room">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="badge">Control Room</span>
          <h2 className="panel-title mt-3">Start here: choose a profile, sync games, then analyze them</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            If someone opens the app for the first time, this is the full path: pick the Chess.com profile you want to
            work on, sync a date range, then analyze a first batch of games. Start with 10 analyzed games, then raise
            it to 20 or 30 when you want a bigger review pass.
          </p>
        </div>
        <div className="surface-soft px-4 py-3 text-sm text-muted-strong">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Active profile</p>
          <p className="mt-1 font-semibold text-[color:var(--text)]">{props.activeUsername || "Pick a profile below"}</p>
          <p className="mt-1 text-xs text-muted">Recommended first run: sync recent games, then analyze 10.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="tone-info p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Step 1</p>
          <p className="mt-2 text-sm font-semibold">Pick the profile you want to coach</p>
          <p className="mt-2 text-sm leading-6 text-muted-strong">
            Open a public Chess.com profile to make it the active workspace for sync, analysis, notes, and training.
          </p>
        </div>
        <div className="tone-neutral p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Step 2</p>
          <p className="mt-2 text-sm font-semibold">Sync a manageable date range first</p>
          <p className="mt-2 text-sm leading-6 text-muted-strong">
            Start with the last 3 to 12 months so the import stays fast and easier to review.
          </p>
        </div>
        <div className="tone-warning p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Step 3</p>
          <p className="mt-2 text-sm font-semibold">Analyze 10 games to get the first real leaks</p>
          <p className="mt-2 text-sm leading-6 text-muted-strong">
            Ten games is usually enough to surface meaningful patterns without creating a long first queue.
          </p>
        </div>
      </div>

      <ProfileBrowser activeUsername={props.activeUsername} embedded />

      {notice ? <p className={notice.type === "success" ? "status-success" : "status-error"}>{notice.message}</p> : null}

      {analysisJob ? (
        <div className="status-info space-y-3 rounded-[24px] px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{analysisStatusDetail(analysisJob)}</p>
              {analysisJob.totalGames > 0 && analysisJob.processedGames === 0 ? (
                <p className="mt-1 text-xs opacity-80">
                  The server is still setting up the first game. Progress starts after the first finished game.
                </p>
              ) : null}
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">{analysisStatusLabel(analysisJob)}</p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-blue-500/15">
            <div
              className="h-full rounded-full bg-[color:var(--primary)] transition-all duration-300"
              style={{ width: `${analysisProgress(analysisJob)}%` }}
            />
          </div>
        </div>
      ) : null}

      {privateAIEnrichment ? (
        <div
          className={`space-y-3 rounded-[24px] px-4 py-4 ${
            privateAIEnrichment.status === "failed" ? "status-error" : "status-info"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">
                {privateAIEnrichment.message || "ChatGPT coach is enriching your analyzed games on this device."}
              </p>
              <p className="mt-1 text-xs opacity-80">
                This second phase uses your local token and skips games that already have a saved ChatGPT review.
              </p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">
              {privateAIEnrichment.processedGames}/{privateAIEnrichment.totalGames} games
            </p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-blue-500/15">
            <div
              className="h-full rounded-full bg-[color:var(--primary)] transition-all duration-300"
              style={{ width: `${aiEnrichmentProgress(privateAIEnrichment)}%` }}
            />
          </div>
          <p className="text-xs opacity-80">
            Enriched {privateAIEnrichment.enrichedGames}, skipped {privateAIEnrichment.skippedGames}, failed{" "}
            {privateAIEnrichment.failedGames}.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <form
          className="surface-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            runAction(async () => runSync(true));
          }}
        >
          <h3 className="font-display text-xl">Step 2: Sync + Analyze</h3>
          <p className="mt-2 text-sm text-muted">
            Fetch games for the active Chess.com profile, then analyze the first batch you choose below. Public engine
            analysis stays on the server. Private AI coaching can happen later on this device.
          </p>
          <div className="mt-4 grid gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="analyze-limit">
              Analyze up to
            </label>
            <div className="flex items-center gap-3">
              <input
                id="analyze-limit"
                type="number"
                min={1}
                max={MAX_ANALYZE_LIMIT}
                className="field-muted max-w-[120px]"
                value={analyzeLimit}
                onChange={(event) => setAnalyzeLimit(event.target.value)}
              />
              <p className="text-xs text-muted">Default 10, maximum 30 games per run.</p>
            </div>

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
              <option value="last-12-months">Last 12 months</option>
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
            {!props.activeUsername ? (
              <p className="rounded-[18px] border border-dashed border-[color:var(--border)] px-4 py-3 text-sm text-muted-strong">
                Pick a profile in Step 1 first. Then sync and analyze will use that active username automatically.
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button className="btn-primary w-full sm:w-auto" disabled={isPending || isAnalyzingInBackground}>
              {isPending || isAnalyzingInBackground ? "Analysis in progress" : `Sync + Analyze (${parsedAnalyzeLimit()})`}
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

        <div className="space-y-4">
          <form
            className="surface-card p-4"
            onSubmit={(event) => {
              event.preventDefault();
              runAction(async () => {
                const gameIds = await fetchPendingGameIds(parsedAnalyzeLimit());
                return startAnalysisJob(gameIds.length || parsedAnalyzeLimit(), gameIds);
              }, { refreshOnSuccess: false });
            }}
          >
            <h3 className="font-display text-xl">Analyze existing games</h3>
            <p className="mt-2 text-sm text-muted">
              Use this when you already synced the profile and just want to analyze the next pending batch.
            </p>
            <p className="mt-2 text-xs text-muted">
              If your local OpenAI token is saved, ChatGPT coaching will start automatically after the engine pass
              finishes.
            </p>
            <button className="btn-secondary mt-4 w-full sm:w-auto" disabled={isPending || isAnalyzingInBackground}>
              {isPending || isAnalyzingInBackground ? "Analysis in progress" : `Analyze existing only (${parsedAnalyzeLimit()})`}
            </button>
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
            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setToast(null)} type="button">
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
