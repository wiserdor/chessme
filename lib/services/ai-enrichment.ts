import { createProvider } from "@/lib/ai";
import { explainLeakExamples } from "@/lib/services/leak-explanations";
import {
  getAISettings,
  getGameDetail,
  getRecentGamesForPortfolioReview,
  getStoredAIReport,
  getWeaknessDetail,
  upsertAIReport,
  replaceCriticalMomentNotes,
  upsertGameReviewNarrative
} from "@/lib/services/repository";

const OPENAI_RETRY_DELAYS_MS = [1200, 2600];

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybeStatus = Reflect.get(error, "status");
  return typeof maybeStatus === "number" ? maybeStatus : null;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (!error || typeof error !== "object") {
    return "";
  }

  const direct = Reflect.get(error, "message");
  if (typeof direct === "string") {
    return direct;
  }

  const nested = Reflect.get(error, "error");
  if (nested && typeof nested === "object") {
    const nestedMessage = Reflect.get(nested, "message");
    if (typeof nestedMessage === "string") {
      return nestedMessage;
    }
  }

  return "";
}

function isHardQuotaError(error: unknown): boolean {
  const status = readErrorStatus(error);
  const message = readErrorMessage(error).toLowerCase();
  return status === 429 && /insufficient_quota|exceeded your current quota/.test(message);
}

async function withOpenAIProvider<T>(runner: (provider: ReturnType<typeof createProvider>, model: string) => Promise<T>) {
  const settings = await getAISettings();

  if (settings.provider !== "openai") {
    throw new Error("OpenAI is not selected in Settings.");
  }

  if (!settings.apiKey) {
    throw new Error("OpenAI API key is missing in Settings.");
  }

  const provider = createProvider({
    provider: "openai",
    model: settings.model,
    apiKey: settings.apiKey
  });

  for (let attempt = 0; attempt <= OPENAI_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await runner(provider, settings.model);
    } catch (error) {
      if (isHardQuotaError(error)) {
        throw new Error(readErrorMessage(error) || "OpenAI quota exhausted.");
      }

      const status = readErrorStatus(error);
      const retryable = status === 429 && attempt < OPENAI_RETRY_DELAYS_MS.length;
      if (retryable) {
        await sleep(OPENAI_RETRY_DELAYS_MS[attempt] as number);
        continue;
      }

      throw error;
    }
  }

  throw new Error("OpenAI request failed.");
}

export async function analyzeGameWithAI(gameId: string, options?: { force?: boolean }) {
  const detail = await getGameDetail(gameId);
  if (!detail) {
    throw new Error("Game not found.");
  }

  if (detail.review?.coachSource === "openai" && !options?.force) {
    return {
      updated: false,
      message: "ChatGPT review already exists for this game. Open the game to study it."
    };
  }

  if (!detail.engineReviews.length) {
    throw new Error("Run engine analysis first before requesting ChatGPT for this game.");
  }

  const topMistakes = detail.engineReviews.slice(0, 5);
  return withOpenAIProvider(async (provider, model) => {
    const insights = await provider.generateStructuredReview({
      opening: detail.game.opening || "Unknown opening",
      opponent: `${detail.game.whitePlayer} vs ${detail.game.blackPlayer}`,
      mistakes: topMistakes.map((mistake) => ({
        ply: mistake.ply,
        label: mistake.label,
        deltaCp: mistake.deltaCp,
        playedMove: mistake.playedMove,
        bestMove: mistake.bestMove,
        tags: mistake.tags
      }))
    });

    await upsertGameReviewNarrative(gameId, insights.review, {
      coachSource: "openai",
      coachProvider: "openai",
      coachModel: model
    });
    await replaceCriticalMomentNotes(gameId, insights.criticalMoments, {
      provider: "openai",
      model
    });

    return {
      updated: true,
      message: `${options?.force ? "ChatGPT review re-analyzed" : "ChatGPT review generated"} with ${model}.`
    };
  });
}

export async function analyzeLeakWithAI(leakKey: string) {
  const detail = await getWeaknessDetail(leakKey);
  if (!detail) {
    throw new Error("Leak not found.");
  }

  return withOpenAIProvider(async () => {
    const explained = await explainLeakExamples(detail.weakness.label, detail.weakness.key, detail.weakness.examples, {
      mode: "enrich"
    });

    const aiCount = explained.filter((example) => example.source === "ai").length;
    return {
      updated: true,
      message: `ChatGPT explanations ready for ${aiCount} examples.`
    };
  });
}

export async function analyzeRecentGamesPortfolio(limit = 30) {
  const dataset = await getRecentGamesForPortfolioReview(limit);
  if (!dataset.sampleSize) {
    throw new Error("Run engine analysis on at least one game before requesting a portfolio report.");
  }

  return withOpenAIProvider(async (provider, model) => {
    const report = await provider.generatePortfolioReview(dataset);

    await upsertAIReport({
      reportType: "recent-30",
      title: "Last 30 games coach report",
      gamesCount: dataset.sampleSize,
      provider: "openai",
      model,
      payload: report
    });

    return {
      updated: true,
      gamesCount: dataset.sampleSize,
      message: `ChatGPT analyzed your last ${dataset.sampleSize} games with ${model}.`
    };
  });
}

export async function getRecentGamesPortfolioReport() {
  return getStoredAIReport("recent-30");
}

export async function answerGameCoachQuestion(gameId: string, question: string, focusPly?: number) {
  const detail = await getGameDetail(gameId);
  if (!detail) {
    throw new Error("Game not found.");
  }

  if (!question.trim()) {
    throw new Error("Question is required.");
  }

  if (!detail.engineReviews.length) {
    throw new Error("Run engine analysis first before asking the coach about this game.");
  }

  const criticalNotesByPly = new Map(detail.criticalMomentNotes.map((note) => [note.ply, note]));
  const playerColor =
    detail.playerColor === "white" || detail.playerColor === "black" ? detail.playerColor : null;
  const criticalMoments = detail.engineReviews.slice(0, 6).map((review) => ({
    ply: review.ply,
    label: review.label,
    deltaCp: review.deltaCp,
    playedMove: review.playedMove,
    bestMove: review.bestMove,
    tags: review.tags,
    whatHappened: criticalNotesByPly.get(review.ply)?.whatHappened,
    whyItMatters: criticalNotesByPly.get(review.ply)?.whyItMatters,
    whatToThink: criticalNotesByPly.get(review.ply)?.whatToThink,
    trainingFocus: criticalNotesByPly.get(review.ply)?.trainingFocus
  }));

  return withOpenAIProvider(async (provider) => {
    const answer = await provider.answerGameCoachQuestion({
      question: question.trim(),
      opening: detail.game.opening || "Unknown opening",
      opponent: `${detail.game.whitePlayer} vs ${detail.game.blackPlayer}`,
      resultLabel: detail.resultLabel,
      playerColor,
      gameSummary: detail.review?.summary ?? null,
      actionItems: detail.review?.actionItems ?? [],
      criticalMoments,
      focusPly
    });

    return {
      answer,
      focusPly: focusPly ?? null
    };
  });
}
