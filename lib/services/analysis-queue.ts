import { runAnalysis } from "@/lib/services/analysis-service";
import {
  AnalysisJobInput,
  createAnalysisJob,
  getActiveAnalysisJob,
  getAnalysisJob,
  getGamesToAnalyze,
  getNextPendingAnalysisJob,
  resetAnalyzingGamesToPending,
  setGamesAnalysisStatus,
  updateAnalysisJob
} from "@/lib/services/repository";

let queueActive = false;

async function ensureQueueRunning() {
  if (queueActive) {
    return;
  }

  const activeJob = await getActiveAnalysisJob();
  if (!activeJob) {
    return;
  }

  if (activeJob.status === "running") {
    await resetAnalyzingGamesToPending();
    await updateAnalysisJob(activeJob.id, {
      status: "pending",
      message: "Resuming analysis after restart",
      error: null
    });
  }

  setTimeout(() => {
    void processQueue();
  }, 0);
}

async function processQueue() {
  if (queueActive) {
    return;
  }

  queueActive = true;

  try {
    while (true) {
      const job = await getNextPendingAnalysisJob();
      if (!job) {
        return;
      }
      let plannedGameIds: string[] = [];

      await updateAnalysisJob(job.id, {
        status: "running",
        message: "Server is selecting games and preparing analysis",
        error: null
      });

      try {
        const plannedGames = await getGamesToAnalyze(job.options.gameIds, job.options.limit ?? 20, job.options.reanalyze ?? false);
        plannedGameIds = plannedGames.map((game) => game.id);
        await updateAnalysisJob(job.id, {
          totalGames: plannedGames.length,
          processedGames: 0,
          message: plannedGames.length
            ? `Server queued ${plannedGames.length} games and is starting the first engine pass`
            : "No pending games to analyze"
        });

        if (!plannedGames.length) {
          await updateAnalysisJob(job.id, {
            status: "completed",
            totalGames: 0,
            processedGames: 0,
            message: "No matching games need analysis.",
            error: null
          });
          continue;
        }

        await setGamesAnalysisStatus(plannedGameIds, "analyzing");

        const result = await runAnalysis(
          {
            ...job.options,
            gameIds: plannedGameIds,
            limit: plannedGames.length || job.options.limit,
            reanalyze: true
          },
          {
            onPlanned: async (totalGames) => {
              await updateAnalysisJob(job.id, {
                totalGames,
                processedGames: 0,
                message: totalGames
                  ? `Server is parsing positions and starting analysis for ${totalGames} games`
                  : "No pending games to analyze"
              });
            },
            onProgress: async (processedGames, totalGames) => {
              await updateAnalysisJob(job.id, {
                totalGames,
                processedGames,
                message:
                  processedGames >= totalGames
                    ? `Finished all ${totalGames} games`
                    : `Finished ${processedGames} of ${totalGames} games and continuing on the server`
              });
            }
          }
        );

        await updateAnalysisJob(job.id, {
          status: "completed",
          totalGames: result.analyzed,
          processedGames: result.analyzed,
          message: result.message ?? `Analyzed ${result.analyzed} games.`,
          error: null
        });
      } catch (error) {
        const fallbackLimit = plannedGameIds.length || job.options.limit || 20;
        const plannedGames = await getGamesToAnalyze(plannedGameIds, fallbackLimit, true);
        const analyzingIds = plannedGames.filter((game) => game.analysisStatus === "analyzing").map((game) => game.id);
        await setGamesAnalysisStatus(analyzingIds, "pending");
        await updateAnalysisJob(job.id, {
          status: "failed",
          message: null,
          error: error instanceof Error ? error.message : "Unknown analysis error"
        });
      }
    }
  } finally {
    queueActive = false;
  }
}

export async function enqueueAnalysisJob(options?: AnalysisJobInput) {
  const activeJob = await getActiveAnalysisJob();
  if (activeJob) {
    await ensureQueueRunning();
    const refreshedJob = await getActiveAnalysisJob();
    const currentJob = refreshedJob ?? activeJob;
    return {
      jobId: currentJob.id,
      status: currentJob.status,
      totalGames: currentJob.totalGames,
      processedGames: currentJob.processedGames,
      message: currentJob.message || "Analysis already in progress.",
      created: false
    };
  }

  const plannedGames = await getGamesToAnalyze(options?.gameIds, options?.limit ?? 20, options?.reanalyze ?? false);
  if (!plannedGames.length) {
    return {
      jobId: null,
      status: "completed",
      totalGames: 0,
      processedGames: 0,
      message:
        options?.gameIds?.length || options?.reanalyze
          ? "No matching games need analysis."
          : "All pending games are already analyzed.",
      created: false
    };
  }

  const jobId = await createAnalysisJob(options);
  await ensureQueueRunning();
  return {
    jobId,
    status: "pending",
    totalGames: 0,
    processedGames: 0,
    message: "Analysis queued.",
    created: true
  };
}

export async function getAnalysisJobStatus(jobId: string) {
  await ensureQueueRunning();
  return getAnalysisJob(jobId);
}
