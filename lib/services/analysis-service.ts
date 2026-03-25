import { createProvider } from "@/lib/ai";
import { MockProvider } from "@/lib/ai/mock-provider";
import { explainLeakExamples } from "@/lib/services/leak-explanations";
import { getAISettings } from "@/lib/services/repository";
import { analyzePositions } from "@/lib/services/engine";
import { extractPositions } from "@/lib/services/pgn";
import {
  getExistingGameReviews,
  getGamesToAnalyze,
  getWeaknessDetail,
  replaceCriticalMomentNotes,
  replaceGameAnalysis,
  replaceWeaknessPatterns,
  upsertTrainingCards
} from "@/lib/services/repository";
import { TrainingCardPayload, WeaknessPatternInput } from "@/lib/types";

const DASHBOARD_ANALYSIS_LIMIT = 20;
const AI_REVIEW_BATCH_SIZE = 5;

type AnalysisHooks = {
  onPlanned?: (totalGames: number) => Promise<void> | void;
  onProgress?: (processedGames: number, totalGames: number) => Promise<void> | void;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function weaknessMetadata(label: string): { key: string; label: string; focus: string } {
  switch (label) {
    case "opening-leak":
      return {
        key: "opening-leaks",
        label: "Opening leaks",
        focus: "Review the first 10 moves and build a smaller, more stable repertoire."
      };
    case "endgame-error":
      return {
        key: "endgame-conversion",
        label: "Endgame conversion",
        focus: "Practice technical endings from your own missed chances."
      };
    case "missed-tactic":
      return {
        key: "tactical-oversights",
        label: "Tactical oversights",
        focus: "Slow down in forcing positions and scan checks, captures, and threats."
      };
    case "blunder":
      return {
        key: "large-blunders",
        label: "Large blunders",
        focus: "Add a final blunder check before every move in sharp positions."
      };
    default:
      return {
        key: "decision-drift",
        label: "Decision drift",
        focus: "Use a simple candidate-move routine before committing."
      };
  }
}

export async function runAnalysis(
  options?: { gameIds?: string[]; limit?: number; reanalyze?: boolean },
  hooks?: AnalysisHooks
) {
  const fallbackProvider = new MockProvider();
  const aiSettings = await getAISettings();
  const reviewProvider = createProvider({
    provider: aiSettings.provider,
    model: aiSettings.model,
    apiKey: aiSettings.apiKey
  });
  const games = await getGamesToAnalyze(
    options?.gameIds,
    options?.limit ?? DASHBOARD_ANALYSIS_LIMIT,
    options?.reanalyze ?? false
  );
  const existingReviews = await getExistingGameReviews(games.map((game) => game.id));
  await hooks?.onPlanned?.(games.length);
  const weaknessMap = new Map<string, WeaknessPatternInput>();
  const generatedCards: TrainingCardPayload[] = [];
  const analyzedGames: Array<{
    game: (typeof games)[number];
    positions: ReturnType<typeof extractPositions>;
    reviews: Awaited<ReturnType<typeof analyzePositions>>;
    topMistakes: Awaited<ReturnType<typeof analyzePositions>>;
  }> = [];

  for (const game of games) {
    const positions = extractPositions(game.pgn);
    const reviews = await analyzePositions(positions);
    const topMistakes = reviews.slice(0, 5);
    const cardInputs: Parameters<MockProvider["generateTrainingCards"]>[0] = [];

    for (const mistake of topMistakes) {
      const metadata = weaknessMetadata(mistake.label);
      const current = weaknessMap.get(metadata.key);
      if (current) {
        current.count += 1;
        current.severity = Math.max(current.severity, Math.ceil(mistake.deltaCp / 60));
        current.examples.push(`${game.opening || "Unknown opening"} ply ${mistake.ply}`);
      } else {
        weaknessMap.set(metadata.key, {
          key: metadata.key,
          label: metadata.label,
          severity: Math.ceil(mistake.deltaCp / 60),
          examples: [`${game.opening || "Unknown opening"} ply ${mistake.ply}`],
          suggestedFocus: metadata.focus,
          count: 1
        });
      }

      cardInputs.push({
        theme: metadata.label,
        promptFen: mistake.fen,
        expectedMove: mistake.bestMove,
        explanationSeed: `${mistake.playedMove} dropped roughly ${mistake.deltaCp} centipawns. Prefer ${mistake.bestMove} and explain why before moving.`,
        sourceGameId: game.id,
        sourcePly: mistake.ply,
        tags: mistake.tags
      });
    }

    const cardsForGame = await fallbackProvider.generateTrainingCards(cardInputs);
    generatedCards.push(...cardsForGame);
    if (cardsForGame.length !== cardInputs.length) {
      throw new Error(`Expected ${cardInputs.length} training cards, got ${cardsForGame.length}.`);
    }

    analyzedGames.push({
      game,
      positions,
      reviews,
      topMistakes
    });
  }

  const reviewInputs = analyzedGames.map((item) => ({
    opening: item.game.opening || "Unknown opening",
    opponent: item.game.whitePlayer,
    mistakes: item.topMistakes.map((mistake) => ({
      ply: mistake.ply,
      label: mistake.label,
      deltaCp: mistake.deltaCp,
      playedMove: mistake.playedMove,
      bestMove: mistake.bestMove,
      tags: mistake.tags
    }))
  }));

  const narratives = new Array(reviewInputs.length);
  const criticalMomentLearnings = new Array(reviewInputs.length);
  const narrativeSources = new Array<{
    coachSource: string;
    coachProvider: string | null;
    coachModel: string | null;
  }>(reviewInputs.length);
  let skippedExistingReviewCount = 0;
  let aiBatchFallback = false;
  const batchedIndexes = chunkArray(
    reviewInputs
      .map((_, index) => index)
      .filter((index) => {
        const existingReview = existingReviews.get(analyzedGames[index]!.game.id);
        if (!existingReview) {
          return true;
        }

        narratives[index] = {
          summary: existingReview.summary,
          coachingNotes: existingReview.coachingNotes,
          actionItems: existingReview.actionItems,
          confidence: existingReview.confidence
        };
        criticalMomentLearnings[index] = [];
        narrativeSources[index] = {
          coachSource: existingReview.coachSource,
          coachProvider: existingReview.coachProvider,
          coachModel: existingReview.coachModel
        };
        skippedExistingReviewCount += 1;
        return false;
      }),
    AI_REVIEW_BATCH_SIZE
  );

  for (const indexBatch of batchedIndexes) {
    const inputBatch = indexBatch.map((index) => reviewInputs[index]);

    try {
      const batchNarratives = await reviewProvider.generateStructuredReviews(inputBatch);
      for (let offset = 0; offset < indexBatch.length; offset += 1) {
        narratives[indexBatch[offset] as number] = batchNarratives[offset]?.review;
        criticalMomentLearnings[indexBatch[offset] as number] = batchNarratives[offset]?.criticalMoments ?? [];
        narrativeSources[indexBatch[offset] as number] = {
          coachSource: reviewProvider.name,
          coachProvider: reviewProvider.name,
          coachModel: reviewProvider.model
        };
      }
    } catch {
      aiBatchFallback = true;
      const batchNarratives = await fallbackProvider.generateStructuredReviews(inputBatch);
      for (let offset = 0; offset < indexBatch.length; offset += 1) {
        narratives[indexBatch[offset] as number] = batchNarratives[offset]?.review;
        criticalMomentLearnings[indexBatch[offset] as number] = batchNarratives[offset]?.criticalMoments ?? [];
        narrativeSources[indexBatch[offset] as number] = {
          coachSource: fallbackProvider.name,
          coachProvider: fallbackProvider.name,
          coachModel: fallbackProvider.model
        };
      }
    }
  }

  for (let index = 0; index < analyzedGames.length; index += 1) {
    const item = analyzedGames[index];
    const narrative = narratives[index];
    const narrativeSource = narrativeSources[index];
    await replaceGameAnalysis(item.game.id, item.positions, item.reviews, narrative, {
      coachSource: narrativeSource?.coachSource ?? fallbackProvider.name,
      coachProvider: narrativeSource?.coachProvider ?? fallbackProvider.name,
      coachModel: narrativeSource?.coachModel ?? fallbackProvider.model,
      preserveExistingAI: false
    });
    if ((criticalMomentLearnings[index] ?? []).length) {
      await replaceCriticalMomentNotes(item.game.id, criticalMomentLearnings[index], {
        provider: narrativeSource?.coachProvider ?? narrativeSource?.coachSource ?? fallbackProvider.name,
        model: narrativeSource?.coachModel ?? fallbackProvider.model
      });
    }
    await hooks?.onProgress?.(index + 1, analyzedGames.length);
  }

  const weaknessPatterns = Array.from(weaknessMap.values());
  await replaceWeaknessPatterns(weaknessPatterns);
  await upsertTrainingCards(generatedCards);

  const topLeakKeys = weaknessPatterns
    .sort((left, right) => right.count * right.severity - left.count * left.severity)
    .slice(0, 3)
    .map((pattern) => pattern.key);

  for (const leakKey of topLeakKeys) {
    const detail = await getWeaknessDetail(leakKey);
    if (!detail) {
      continue;
    }

    await explainLeakExamples(detail.weakness.label, detail.weakness.key, detail.weakness.examples, {
      mode: "enrich"
    });
  }

  return {
    analyzed: games.length,
    cardsGenerated: generatedCards.length,
    weaknesses: weaknessMap.size,
    message:
      reviewProvider.name === "openai"
        ? aiBatchFallback
          ? `Analyzed ${games.length} games. ChatGPT batch review failed for part of the run, some summaries used fallback coaching, and ${skippedExistingReviewCount} already-reviewed games skipped ChatGPT.`
          : skippedExistingReviewCount > 0
            ? `Analyzed ${games.length} games with engine review plus batched ChatGPT coaching. Skipped ChatGPT for ${skippedExistingReviewCount} already-reviewed games.`
            : `Analyzed ${games.length} games with engine review plus batched ChatGPT coaching.`
        : `Analyzed ${games.length} games with engine review and deterministic fallback coaching. Add OpenAI in Settings to enable batched ChatGPT summaries.`
  };
}
