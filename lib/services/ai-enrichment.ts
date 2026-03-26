import { createProvider } from "@/lib/ai";
import { loadCoachLab } from "@/lib/services/coach-lab";
import {
  getAISettings,
  getGameDetail,
  getRecentGamesForPortfolioReview,
  getStoredAIReport,
  getWeaknessDetail,
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

function leakKeyFromLabel(label: string) {
  switch (label) {
    case "opening-leak":
      return "opening-leaks";
    case "endgame-error":
      return "endgame-conversion";
    case "missed-tactic":
      return "tactical-oversights";
    case "blunder":
      return "large-blunders";
    case "mistake":
    case "inaccuracy":
      return "decision-drift";
    default:
      return null;
  }
}

type ExplicitAISettings = {
  provider: "openai" | "mock";
  model: string;
  apiKey?: string | null;
};

async function withOpenAIProvider<T>(
  runner: (provider: ReturnType<typeof createProvider>, model: string) => Promise<T>,
  explicitSettings?: ExplicitAISettings
) {
  const settings = explicitSettings ?? (await getAISettings());

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

export async function analyzeGameWithAI(
  gameId: string,
  options?: { force?: boolean },
  explicitSettings?: ExplicitAISettings
) {
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

    return {
      updated: true,
      review: insights.review,
      criticalMoments: insights.criticalMoments,
      provider: "openai" as const,
      model,
      message: `${options?.force ? "ChatGPT review re-analyzed" : "ChatGPT review generated"} with ${model}.`
    };
  }, explicitSettings);
}

export async function analyzeLeakWithAI(leakKey: string, explicitSettings?: ExplicitAISettings) {
  const detail = await getWeaknessDetail(leakKey);
  if (!detail) {
    throw new Error("Leak not found.");
  }

  return withOpenAIProvider(async (provider, model) => {
    const aiInputs = detail.weakness.examples
      .filter(
        (example) =>
          typeof example.ply === "number" &&
          typeof example.deltaCp === "number" &&
          typeof example.playedMove === "string" &&
          typeof example.bestMove === "string" &&
          typeof example.label === "string"
      )
      .slice(0, 4)
      .map((example) => ({
        exampleId: `${example.gameId}:${example.ply}`,
        opening: example.opening,
        ply: example.ply as number,
        playedMove: example.playedMove as string,
        bestMove: example.bestMove as string,
        deltaCp: example.deltaCp as number,
        label: example.label as string
      }));

    if (!aiInputs.length) {
      return {
        updated: false,
        provider: "openai" as const,
        model,
        examples: [],
        message: "No rich leak examples were available for ChatGPT yet."
      };
    }

    const explanations = await provider.generateLeakExplanations({
      leakLabel: detail.weakness.label,
      examples: aiInputs
    });

    const examples = explanations
      .map((item) => {
        const [gameId, plyValue] = item.exampleId.split(":");
        const ply = Number.parseInt(plyValue, 10);
        if (!gameId || !Number.isFinite(ply)) {
          return null;
        }

        return {
          gameId,
          ply,
          explanation: item.explanation,
          whyLeak: item.whyLeak,
          source: "ai" as const
        };
      })
      .filter(
        (
          item
        ): item is {
          gameId: string;
          ply: number;
          explanation: string;
          whyLeak: string;
          source: "ai";
        } => Boolean(item)
      );

    return {
      updated: examples.length > 0,
      provider: "openai" as const,
      model,
      examples,
      message: `ChatGPT explanations ready for ${examples.length} examples.`
    };
  }, explicitSettings);
}

export async function analyzeRecentGamesPortfolio(limit = 30, explicitSettings?: ExplicitAISettings) {
  const dataset = await getRecentGamesForPortfolioReview(limit);
  if (!dataset.sampleSize) {
    throw new Error("Run engine analysis on at least one game before requesting a portfolio report.");
  }

  return withOpenAIProvider(async (provider, model) => {
    const report = await provider.generatePortfolioReview(dataset);

    return {
      updated: true,
      gamesCount: dataset.sampleSize,
      report,
      provider: "openai" as const,
      model,
      title: "Last 30 games coach report",
      message: `ChatGPT analyzed your last ${dataset.sampleSize} games with ${model}.`
    };
  }, explicitSettings);
}

export async function getRecentGamesPortfolioReport() {
  return getStoredAIReport("recent-30");
}

export async function answerGameCoachQuestion(
  gameId: string,
  question: string,
  focusPly?: number,
  input?: {
    history?: Array<{ role: "user" | "coach"; content: string; focusPly?: number | null }>;
    notes?: Array<{ title: string; excerpt: string; anchorLabel: string; tags: string[] }>;
    settings?: ExplicitAISettings;
  }
) {
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
      history: (input?.history ?? []).slice(-12),
      notes: input?.notes ?? [],
      criticalMoments,
      focusPly
    });

    return {
      answer,
      focusPly: focusPly ?? null
    };
  }, input?.settings);
}

function buildTrendSnapshot(sample: Awaited<ReturnType<typeof getRecentGamesForPortfolioReview>>) {
  if (sample.games.length < 6) {
    return null;
  }

  const recentSliceSize = Math.max(3, Math.ceil(sample.games.length / 2));
  const recentGames = sample.games.slice(0, recentSliceSize);
  const earlierGames = sample.games.slice(recentSliceSize);
  if (!earlierGames.length) {
    return null;
  }

  const avg = (values: number[]) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0);
  const score = (result: string) => (result.toLowerCase() === "win" ? 1 : result.toLowerCase() === "draw" ? 0.5 : 0);
  const recentAvgSwing = Math.round(avg(recentGames.map((game) => game.biggestSwing)));
  const earlierAvgSwing = Math.round(avg(earlierGames.map((game) => game.biggestSwing)));
  const recentScore = avg(recentGames.map((game) => score(game.result)));
  const earlierScore = avg(earlierGames.map((game) => score(game.result)));

  return {
    summary:
      recentAvgSwing < earlierAvgSwing || recentScore > earlierScore
        ? "Recent games look a bit better than the earlier half of the sample."
        : recentAvgSwing > earlierAvgSwing || recentScore < earlierScore
          ? "Recent games are slipping versus the earlier half of the sample."
          : "Recent games look mostly flat versus the earlier half of the sample.",
    bullets: [
      `Average biggest swing: ${earlierAvgSwing}cp earlier -> ${recentAvgSwing}cp recent`,
      `Score per game: ${earlierScore.toFixed(2)} earlier -> ${recentScore.toFixed(2)} recent`
    ]
  };
}

export async function answerCoachLabQuestion(
  question: string,
  focusArea?: string,
  history?: Array<{ role: "user" | "coach"; content: string; focusArea?: string | null }>,
  input?: {
    notes?: Array<{ title: string; excerpt: string; anchorLabel: string; tags: string[] }>;
    settings?: ExplicitAISettings;
  }
) {
  if (!question.trim()) {
    throw new Error("Question is required.");
  }

  const [snapshot, reportSample, report] = await Promise.all([
    loadCoachLab(20),
    getRecentGamesForPortfolioReview(20),
    getStoredAIReport("recent-30")
  ]);

  if (!snapshot.sampleSize) {
    throw new Error("Analyze games first before asking the coach about your flows.");
  }

  return withOpenAIProvider(async (provider) => {
    const answer = await provider.answerCoachLabQuestion({
      question: question.trim(),
      focusArea,
      sampleSize: snapshot.sampleSize,
      focusOfWeek: snapshot.focusOfWeek,
      reminders: snapshot.reminders,
      blindspots: snapshot.blindspots.map((item) => ({
        label: item.label,
        count: item.count,
        averageSwing: item.averageSwing,
        rule: item.rule,
        whyItHurts: item.whyItHurts
      })),
      criticalMoments: snapshot.criticalMoments.slice(0, 6).map((moment) => ({
        opening: moment.opening,
        ply: moment.ply,
        label: moment.label,
        deltaCp: moment.deltaCp,
        playedMove: moment.playedMove,
        bestMove: moment.bestMove
      })),
      trend: buildTrendSnapshot(reportSample),
      styleReportSummary: report?.payload?.summary ?? null,
      history: (history ?? []).slice(-12),
      notes: input?.notes ?? []
    });

    return { answer };
  }, input?.settings);
}
