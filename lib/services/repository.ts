import { and, asc, desc, eq, inArray, lte, or } from "drizzle-orm";
import { Chess } from "chess.js";

import { db } from "@/lib/db";
import {
  aiConfigs,
  analysisJobs,
  aiReports,
  criticalMomentNotes,
  engineReviews,
  gameImports,
  gameReviews,
  games,
  leakExampleNotes,
  positions,
  profiles,
  trainingCards,
  trainingSessions,
  weaknessPatterns
} from "@/lib/db/schema";
import {
  CriticalMomentLearning,
  DashboardSnapshot,
  EngineReview,
  ImportedGame,
  PortfolioReview,
  ProviderName,
  ReviewNarrative,
  TrainingCardPayload,
  WeaknessPatternInput
} from "@/lib/types";
import { createId } from "@/lib/utils/id";
import { safeJsonParse } from "@/lib/utils/json";
import { daysFromNow, nowTs } from "@/lib/utils/time";

const UCI_MOVE_PATTERN = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;

function toUci(move: { from: string; to: string; promotion?: string }) {
  return `${move.from}${move.to}${move.promotion ?? ""}`.toLowerCase();
}

function resolveMoveFromInput(fen: string, rawInput: string) {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/[\s-]/g, "");
  const uciMatch = compact.match(UCI_MOVE_PATTERN);
  if (uciMatch) {
    const [, from, to, promotion] = uciMatch;
    const uciChess = new Chess(fen);
    let played = null;
    try {
      played = uciChess.move({
        from: from.toLowerCase(),
        to: to.toLowerCase(),
        promotion: promotion?.toLowerCase()
      });
    } catch {
      played = null;
    }

    // Allow common omission of promotion piece by defaulting to queen.
    if (!played && !promotion) {
      try {
        played = uciChess.move({
          from: from.toLowerCase(),
          to: to.toLowerCase(),
          promotion: "q"
        });
      } catch {
        played = null;
      }
    }

    if (played) {
      return {
        uci: toUci({
          from: played.from,
          to: played.to,
          promotion: played.promotion
        }),
        san: played.san
      };
    }
  }

  const sanChess = new Chess(fen);
  let sanMove = null;
  try {
    sanMove = sanChess.move(trimmed);
  } catch {
    sanMove = null;
  }
  if (!sanMove) {
    return null;
  }

  return {
    uci: toUci({
      from: sanMove.from,
      to: sanMove.to,
      promotion: sanMove.promotion
    }),
    san: sanMove.san
  };
}

function labelsForLeakKey(key: string): string[] {
  switch (key) {
    case "opening-leaks":
      return ["opening-leak"];
    case "endgame-conversion":
      return ["endgame-error"];
    case "tactical-oversights":
      return ["missed-tactic"];
    case "large-blunders":
      return ["blunder"];
    case "decision-drift":
      return ["mistake", "inaccuracy"];
    default:
      return [];
  }
}

function leakKeyFromLabel(label: string): { key: string; label: string } | null {
  switch (label) {
    case "opening-leak":
      return { key: "opening-leaks", label: "Opening leaks" };
    case "endgame-error":
      return { key: "endgame-conversion", label: "Endgame conversion" };
    case "missed-tactic":
      return { key: "tactical-oversights", label: "Tactical oversights" };
    case "blunder":
      return { key: "large-blunders", label: "Large blunders" };
    case "mistake":
    case "inaccuracy":
      return { key: "decision-drift", label: "Decision drift" };
    default:
      return null;
  }
}

function classifyResultToken(result: string): "win" | "loss" | "draw" | "unknown" {
  const normalized = result.toLowerCase();
  if (
    normalized.includes("draw") ||
    normalized.includes("stalemate") ||
    normalized.includes("repetition") ||
    normalized.includes("insufficient") ||
    normalized.includes("agreed")
  ) {
    return "draw";
  }

  if (normalized.includes("win")) {
    return "win";
  }

  if (
    normalized.includes("checkmated") ||
    normalized.includes("timeout") ||
    normalized.includes("resigned") ||
    normalized.includes("abandoned") ||
    normalized.includes("lose") ||
    normalized.includes("loss")
  ) {
    return "loss";
  }

  return "unknown";
}

function usernamesMatch(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

function classifyResultBucketForGame(input: {
  result: string;
  whitePlayer: string;
  blackPlayer: string;
  username?: string | null;
}): "win" | "loss" | "draw" | "unknown" {
  const normalized = input.result.trim();
  const username = input.username?.trim().toLowerCase();

  if (normalized === "1-0") {
    if (username && usernamesMatch(input.whitePlayer, username)) {
      return "win";
    }
    if (username && usernamesMatch(input.blackPlayer, username)) {
      return "loss";
    }
    return "unknown";
  }

  if (normalized === "0-1") {
    if (username && usernamesMatch(input.whitePlayer, username)) {
      return "loss";
    }
    if (username && usernamesMatch(input.blackPlayer, username)) {
      return "win";
    }
    return "unknown";
  }

  if (normalized === "1/2-1/2") {
    return "draw";
  }

  if (normalized.includes(" / ")) {
    const [whiteResult, blackResult] = normalized.split(" / ").map((item) => item.trim());
    if (username && usernamesMatch(input.whitePlayer, username)) {
      return classifyResultToken(whiteResult || normalized);
    }
    if (username && usernamesMatch(input.blackPlayer, username)) {
      return classifyResultToken(blackResult || normalized);
    }
  }

  return classifyResultToken(normalized);
}

function resultLabelFromBucket(bucket: "win" | "loss" | "draw" | "unknown") {
  switch (bucket) {
    case "win":
      return "Win";
    case "loss":
      return "Loss";
    case "draw":
      return "Draw";
    default:
      return "Unknown";
  }
}

export async function upsertProfile(username: string, provider: string, model: string) {
  const existing = await db.select().from(profiles).limit(1);
  const timestamp = nowTs();

  if (existing[0]) {
    await db
      .update(profiles)
      .set({
        username,
        provider,
        model,
        updatedAt: timestamp
      })
      .where(eq(profiles.id, existing[0].id));

    return;
  }

  await db.insert(profiles).values({
    id: createId("profile"),
    username,
    provider,
    model,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export async function getProfile() {
  const row = await db.select().from(profiles).limit(1);
  return row[0] ?? null;
}

export async function getAISettings() {
  const rows = await db.select().from(aiConfigs).limit(1);
  const row = rows[0];

  if (!row) {
    return {
      provider: "mock" as ProviderName,
      model: "deterministic-coach",
      apiKey: null as string | null,
      hasApiKey: false,
      quotaCooldownUntil: null as number | null,
      lastError: null as string | null
    };
  }

  return {
    provider: row.provider as ProviderName,
    model: row.model,
    apiKey: row.apiKey,
    hasApiKey: Boolean(row.apiKey),
    quotaCooldownUntil: row.quotaCooldownUntil,
    lastError: row.lastError
  };
}

export async function upsertAISettings(input: {
  provider: ProviderName;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}) {
  const timestamp = nowTs();
  const currentRows = await db.select().from(aiConfigs).limit(1);
  const current = currentRows[0];

  const nextApiKey = input.clearApiKey
    ? null
    : typeof input.apiKey === "string" && input.apiKey.trim()
      ? input.apiKey.trim()
      : current?.apiKey ?? null;

  if (current) {
    await db
      .update(aiConfigs)
      .set({
        provider: input.provider,
        model: input.model,
        apiKey: nextApiKey,
        quotaCooldownUntil: null,
        lastError: null,
        updatedAt: timestamp
      })
      .where(eq(aiConfigs.id, current.id));
  } else {
    await db.insert(aiConfigs).values({
      id: createId("ai"),
      provider: input.provider,
      model: input.model,
      apiKey: nextApiKey,
      quotaCooldownUntil: null,
      lastError: null,
      updatedAt: timestamp
    });
  }

  const existingProfile = await db.select().from(profiles).limit(1);
  if (existingProfile[0]) {
    await db
      .update(profiles)
      .set({
        provider: input.provider,
        model: input.model,
        updatedAt: timestamp
      })
      .where(eq(profiles.id, existingProfile[0].id));
  }

  return {
    provider: input.provider,
    model: input.model,
    hasApiKey: Boolean(nextApiKey)
  };
}

export async function setAIQuotaCooldown(untilTs: number, lastError: string) {
  const currentRows = await db.select().from(aiConfigs).limit(1);
  const current = currentRows[0];
  const timestamp = nowTs();

  if (current) {
    await db
      .update(aiConfigs)
      .set({
        quotaCooldownUntil: untilTs,
        lastError,
        updatedAt: timestamp
      })
      .where(eq(aiConfigs.id, current.id));
    return;
  }

  await db.insert(aiConfigs).values({
    id: createId("ai"),
    provider: "openai",
    model: "gpt-5-mini",
    apiKey: null,
    quotaCooldownUntil: untilTs,
    lastError,
    updatedAt: timestamp
  });
}

export async function clearAICooldown() {
  const currentRows = await db.select().from(aiConfigs).limit(1);
  const current = currentRows[0];
  if (!current) {
    return;
  }

  await db
    .update(aiConfigs)
    .set({
      quotaCooldownUntil: null,
      lastError: null,
      updatedAt: nowTs()
    })
    .where(eq(aiConfigs.id, current.id));
}

export async function clearAppData(options?: { includeSettings?: boolean }) {
  await db.delete(analysisJobs);
  await db.delete(trainingSessions);
  await db.delete(trainingCards);
  await db.delete(engineReviews);
  await db.delete(gameReviews);
  await db.delete(aiReports);
  await db.delete(positions);
  await db.delete(weaknessPatterns);
  await db.delete(gameImports);
  await db.delete(leakExampleNotes);
  await db.delete(games);

  if (options?.includeSettings) {
    await db.delete(profiles);
    await db.delete(aiConfigs);
  }

  return {
    cleared: true,
    includeSettings: Boolean(options?.includeSettings)
  };
}

export type AnalysisJobInput = {
  gameIds?: string[];
  limit?: number;
  reanalyze?: boolean;
};

export async function createAnalysisJob(options?: AnalysisJobInput) {
  const timestamp = nowTs();
  const id = createId("job");

  await db.insert(analysisJobs).values({
    id,
    status: "pending",
    optionsJson: JSON.stringify(options ?? {}),
    totalGames: 0,
    processedGames: 0,
    message: "Queued",
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp
  });

  return id;
}

export async function getAnalysisJob(jobId: string) {
  const rows = await db.select().from(analysisJobs).where(eq(analysisJobs.id, jobId)).limit(1);
  return rows[0] ?? null;
}

export async function getActiveAnalysisJob() {
  const rows = await db
    .select()
    .from(analysisJobs)
    .where(or(eq(analysisJobs.status, "pending"), eq(analysisJobs.status, "running")))
    .orderBy(desc(analysisJobs.updatedAt), desc(analysisJobs.createdAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function getNextPendingAnalysisJob() {
  const rows = await db
    .select()
    .from(analysisJobs)
    .where(eq(analysisJobs.status, "pending"))
    .orderBy(asc(analysisJobs.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    options: safeJsonParse<AnalysisJobInput>(row.optionsJson, {})
  };
}

export async function updateAnalysisJob(
  jobId: string,
  input: {
    status?: string;
    totalGames?: number;
    processedGames?: number;
    message?: string | null;
    error?: string | null;
  }
) {
  await db
    .update(analysisJobs)
    .set({
      status: input.status,
      totalGames: input.totalGames,
      processedGames: input.processedGames,
      message: input.message,
      error: input.error,
      updatedAt: nowTs()
    })
    .where(eq(analysisJobs.id, jobId));
}

export async function setGamesAnalysisStatus(gameIds: string[], status: string) {
  if (!gameIds.length) {
    return;
  }

  await db
    .update(games)
    .set({
      analysisStatus: status,
      updatedAt: nowTs()
    })
    .where(inArray(games.id, gameIds));
}

export async function resetAnalyzingGamesToPending() {
  await db
    .update(games)
    .set({
      analysisStatus: "pending",
      updatedAt: nowTs()
    })
    .where(eq(games.analysisStatus, "analyzing"));
}

export async function getGameHistory(filters?: {
  query?: string;
  opening?: string;
  leakKey?: string;
  status?: string;
  result?: string;
  minSwing?: number;
  limit?: number;
}) {
  const profile = await getProfile();
  const gameRows = await db.select().from(games).orderBy(desc(games.playedAt), desc(games.createdAt));
  const reviewRows = await db
    .select({
      gameId: engineReviews.gameId,
      label: engineReviews.label,
      deltaCp: engineReviews.deltaCp
    })
    .from(engineReviews);

  const byGame = new Map<
    string,
    {
      biggestSwing: number;
      mistakeCount: number;
      leakCounts: Map<string, { key: string; label: string; count: number }>;
    }
  >();

  for (const review of reviewRows) {
    const current =
      byGame.get(review.gameId) ??
      {
        biggestSwing: 0,
        mistakeCount: 0,
        leakCounts: new Map<string, { key: string; label: string; count: number }>()
      };

    current.biggestSwing = Math.max(current.biggestSwing, review.deltaCp);
    if (review.deltaCp >= 100) {
      current.mistakeCount += 1;
    }

    const mapped = leakKeyFromLabel(review.label);
    if (mapped) {
      const existing = current.leakCounts.get(mapped.key);
      if (existing) {
        existing.count += 1;
      } else {
        current.leakCounts.set(mapped.key, {
          key: mapped.key,
          label: mapped.label,
          count: 1
        });
      }
    }

    byGame.set(review.gameId, current);
  }

  const openingSet = new Set<string>();
  const normalizedQuery = (filters?.query || "").trim().toLowerCase();
  const normalizedOpening = (filters?.opening || "").trim().toLowerCase();
  const normalizedLeak = (filters?.leakKey || "").trim();
  const normalizedStatus = (filters?.status || "").trim().toLowerCase();
  const normalizedResult = (filters?.result || "").trim().toLowerCase();
  const minSwing = Number.isFinite(filters?.minSwing) ? Number(filters?.minSwing) : 0;

  const historyRows = gameRows
    .map((game) => {
      const stats =
        byGame.get(game.id) ??
        {
          biggestSwing: 0,
          mistakeCount: 0,
          leakCounts: new Map<string, { key: string; label: string; count: number }>()
        };

      if (game.opening) {
        openingSet.add(game.opening);
      }

      const leaks = Array.from(stats.leakCounts.values()).sort((left, right) => right.count - left.count);
      const resultBucket = classifyResultBucketForGame({
        result: game.result,
        whitePlayer: game.whitePlayer,
        blackPlayer: game.blackPlayer,
        username: profile?.username
      });
      const resultLabel = resultLabelFromBucket(resultBucket);

      return {
        id: game.id,
        opening: game.opening || "Unknown opening",
        whitePlayer: game.whitePlayer,
        blackPlayer: game.blackPlayer,
        result: game.result,
        resultLabel,
        resultBucket,
        status: game.analysisStatus,
        playedAt: game.playedAt,
        timeControl: game.timeControl,
        eco: game.eco,
        biggestSwing: stats.biggestSwing,
        mistakeCount: stats.mistakeCount,
        leaks
      };
    })
    .filter((row) => {
      if (normalizedStatus && normalizedStatus !== "all" && row.status.toLowerCase() !== normalizedStatus) {
        return false;
      }

      if (normalizedResult && normalizedResult !== "all" && row.resultBucket !== normalizedResult) {
        return false;
      }

      if (normalizedOpening && !row.opening.toLowerCase().includes(normalizedOpening)) {
        return false;
      }

      if (normalizedLeak && !row.leaks.some((leak) => leak.key === normalizedLeak)) {
        return false;
      }

      if (minSwing > 0 && row.biggestSwing < minSwing) {
        return false;
      }

      if (normalizedQuery) {
        const blob = `${row.opening} ${row.whitePlayer} ${row.blackPlayer} ${row.result} ${row.timeControl || ""} ${
          row.eco || ""
        }`.toLowerCase();
        if (!blob.includes(normalizedQuery)) {
          return false;
        }
      }

      return true;
    });

  const leakOptions = [
    { key: "opening-leaks", label: "Opening leaks" },
    { key: "tactical-oversights", label: "Tactical oversights" },
    { key: "large-blunders", label: "Large blunders" },
    { key: "endgame-conversion", label: "Endgame conversion" },
    { key: "decision-drift", label: "Decision drift" }
  ];

  return {
    games: historyRows.slice(0, filters?.limit ?? 300),
    openings: Array.from(openingSet.values()).sort((left, right) => left.localeCompare(right)),
    leakOptions,
    totals: {
      all: gameRows.length,
      filtered: historyRows.length
    }
  };
}

export async function upsertImportedGames(importedGames: ImportedGame[]) {
  const timestamp = nowTs();

  for (const game of importedGames) {
    const existing = await db.select().from(games).where(eq(games.externalId, game.externalId)).limit(1);

    if (existing[0]) {
      await db
        .update(games)
        .set({
          pgn: game.pgn,
          sourceUrl: game.sourceUrl ?? existing[0].sourceUrl,
          result: game.result,
          playedAt: game.playedAt ?? existing[0].playedAt,
          timeControl: game.timeControl ?? existing[0].timeControl,
          opening: game.opening ?? existing[0].opening,
          eco: game.eco ?? existing[0].eco,
          updatedAt: timestamp
        })
        .where(eq(games.id, existing[0].id));
      continue;
    }

    await db.insert(games).values({
      id: createId("game"),
      externalId: game.externalId,
      source: game.source,
      sourceUrl: game.sourceUrl,
      pgn: game.pgn,
      whitePlayer: game.whitePlayer,
      blackPlayer: game.blackPlayer,
      result: game.result,
      playedAt: game.playedAt,
      timeControl: game.timeControl,
      opening: game.opening,
      eco: game.eco,
      analysisStatus: "pending",
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }
}

export async function getGamesToAnalyze(gameIds?: string[], limit = 10, reanalyze = false) {
  if (gameIds?.length) {
    return db.select().from(games).where(inArray(games.id, gameIds)).limit(limit);
  }

  if (reanalyze) {
    return db.select().from(games).orderBy(desc(games.playedAt)).limit(limit);
  }

  return db
    .select()
    .from(games)
    .where(eq(games.analysisStatus, "pending"))
    .orderBy(desc(games.playedAt))
    .limit(limit);
}

export async function getExistingGameReviews(gameIds: string[]) {
  if (!gameIds.length) {
    return new Map<
      string,
      {
        summary: string;
        coachingNotes: string[];
        actionItems: string[];
        confidence: number;
        coachSource: string;
        coachProvider: string | null;
        coachModel: string | null;
      }
    >();
  }

  const rows = await db.select().from(gameReviews).where(inArray(gameReviews.gameId, gameIds));
  return new Map(
    rows.map((row) => [
      row.gameId,
      {
        summary: row.summary,
        coachingNotes: safeJsonParse<string[]>(row.coachingNotesJson, []),
        actionItems: safeJsonParse<string[]>(row.actionItemsJson, []),
        confidence: row.confidence / 100,
        coachSource: row.coachSource,
        coachProvider: row.coachProvider,
        coachModel: row.coachModel
      }
    ])
  );
}

export async function replaceGameAnalysis(
  gameId: string,
  extractedPositions: Array<{
    ply: number;
    san: string;
    fenBefore: string;
    fenAfter: string;
    moveBy: string;
    tags: string[];
  }>,
  reviews: EngineReview[],
  narrative: ReviewNarrative,
  options?: {
    coachSource?: string;
    coachProvider?: string | null;
    coachModel?: string | null;
    preserveExistingAI?: boolean;
  }
) {
  const timestamp = nowTs();
  await db.delete(positions).where(eq(positions.gameId, gameId));
  await db.delete(engineReviews).where(eq(engineReviews.gameId, gameId));

  for (const position of extractedPositions) {
    await db.insert(positions).values({
      id: createId("pos"),
      gameId,
      ply: position.ply,
      san: position.san,
      fenBefore: position.fenBefore,
      fenAfter: position.fenAfter,
      moveBy: position.moveBy,
      tagsJson: JSON.stringify(position.tags)
    });
  }

  for (const review of reviews) {
    await db.insert(engineReviews).values({
      id: createId("eval"),
      gameId,
      ply: review.ply,
      fen: review.fen,
      playedMove: review.playedMove,
      bestMove: review.bestMove,
      evaluationCp: review.evaluationCp,
      bestLineCp: review.bestLineCp,
      deltaCp: review.deltaCp,
      label: review.label,
      tagsJson: JSON.stringify(review.tags),
      createdAt: timestamp
    });
  }

  await upsertGameReviewNarrative(gameId, narrative, options);

  await db.update(games).set({ analysisStatus: "analyzed", updatedAt: timestamp }).where(eq(games.id, gameId));
}

export async function replaceCriticalMomentNotes(
  gameId: string,
  notes: CriticalMomentLearning[],
  options: {
    provider: string;
    model: string;
  }
) {
  const timestamp = nowTs();
  await db.delete(criticalMomentNotes).where(eq(criticalMomentNotes.gameId, gameId));

  for (const note of notes) {
    await db.insert(criticalMomentNotes).values({
      id: `${gameId}:${note.ply}`,
      gameId,
      ply: note.ply,
      label: note.label,
      provider: options.provider,
      model: options.model,
      whatHappened: note.whatHappened,
      whyItMatters: note.whyItMatters,
      whatToThink: note.whatToThink,
      trainingFocus: note.trainingFocus,
      confidence: Math.round(note.confidence * 100),
      updatedAt: timestamp
    });
  }
}

export async function upsertGameReviewNarrative(
  gameId: string,
  narrative: ReviewNarrative,
  options?: {
    coachSource?: string;
    coachProvider?: string | null;
    coachModel?: string | null;
    preserveExistingAI?: boolean;
  }
) {
  const timestamp = nowTs();
  const existingReview = await db.select().from(gameReviews).where(eq(gameReviews.gameId, gameId)).limit(1);
  const shouldPreserveExistingAI =
    Boolean(options?.preserveExistingAI) &&
    existingReview[0]?.coachSource === "openai" &&
    options?.coachSource !== "openai";

  if (existingReview[0]) {
    if (shouldPreserveExistingAI) {
      return;
    }

    await db
      .update(gameReviews)
      .set({
        summary: narrative.summary,
        coachingNotesJson: JSON.stringify(narrative.coachingNotes),
        actionItemsJson: JSON.stringify(narrative.actionItems),
        confidence: Math.round(narrative.confidence * 100),
        coachSource: options?.coachSource ?? "mock",
        coachProvider: options?.coachProvider ?? null,
        coachModel: options?.coachModel ?? null,
        updatedAt: timestamp
      })
      .where(eq(gameReviews.gameId, gameId));
    return;
  }

  await db.insert(gameReviews).values({
    id: createId("review"),
    gameId,
    summary: narrative.summary,
    coachingNotesJson: JSON.stringify(narrative.coachingNotes),
    actionItemsJson: JSON.stringify(narrative.actionItems),
    confidence: Math.round(narrative.confidence * 100),
    coachSource: options?.coachSource ?? "mock",
    coachProvider: options?.coachProvider ?? null,
    coachModel: options?.coachModel ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export async function replaceWeaknessPatterns(patterns: WeaknessPatternInput[]) {
  const timestamp = nowTs();
  await db.delete(weaknessPatterns);

  for (const pattern of patterns) {
    await db.insert(weaknessPatterns).values({
      id: createId("weak"),
      key: pattern.key,
      label: pattern.label,
      severity: pattern.severity,
      count: pattern.count,
      examplesJson: JSON.stringify(pattern.examples),
      suggestedFocus: pattern.suggestedFocus,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }
}

export async function upsertTrainingCards(cards: TrainingCardPayload[]) {
  const now = nowTs();
  for (const card of cards) {
    const existing = await db
      .select()
      .from(trainingCards)
      .where(
        and(eq(trainingCards.sourceGameId, card.sourceGameId), eq(trainingCards.sourcePly, card.sourcePly))
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(trainingCards)
        .set({
          title: card.title,
          theme: card.theme,
          promptFen: card.promptFen,
          expectedMove: card.expectedMove,
          hint: card.hint,
          explanation: card.explanation,
          tagsJson: JSON.stringify(card.tags),
          difficulty: card.difficulty
        })
        .where(eq(trainingCards.id, existing[0].id));
      continue;
    }

    await db.insert(trainingCards).values({
      id: createId("card"),
      title: card.title,
      theme: card.theme,
      promptFen: card.promptFen,
      expectedMove: card.expectedMove,
      hint: card.hint,
      explanation: card.explanation,
      tagsJson: JSON.stringify(card.tags),
      sourceGameId: card.sourceGameId,
      sourcePly: card.sourcePly,
      difficulty: card.difficulty,
      dueAt: now
    });
  }
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const profile = await getProfile();
  const activeJob = await getActiveAnalysisJob();
  const allGames = await db.select().from(games);
  const gamesRows = await db.select().from(games).orderBy(desc(games.playedAt)).limit(8);
  const weaknessRows = await db.select().from(weaknessPatterns).orderBy(desc(weaknessPatterns.severity)).limit(6);
  const analyzedRows = await db.select().from(gameReviews);
  const dueCards = await db.select().from(trainingCards).where(lte(trainingCards.dueAt, nowTs()));

  return {
    profile: profile
      ? {
          username: profile.username,
          provider: profile.provider as ProviderName,
          model: profile.model
        }
      : null,
    activeAnalysisJob: activeJob
      ? {
          id: activeJob.id,
          status: activeJob.status,
          totalGames: activeJob.totalGames,
          processedGames: activeJob.processedGames,
          message: activeJob.message
        }
      : null,
    totals: {
      games: allGames.length,
      analyzedGames: analyzedRows.length,
      dueCards: dueCards.length,
      weaknessCount: weaknessRows.length
    },
    weaknesses: weaknessRows.map((row) => ({
      id: row.id,
      key: row.key,
      label: row.label,
      severity: row.severity,
      count: row.count,
      suggestedFocus: row.suggestedFocus
    })),
    recentGames: gamesRows.map((row) => {
      const resultBucket = classifyResultBucketForGame({
        result: row.result,
        whitePlayer: row.whitePlayer,
        blackPlayer: row.blackPlayer,
        username: profile?.username
      });

      return {
        id: row.id,
        opponent: usernamesMatch(row.whitePlayer, profile?.username) ? row.blackPlayer : row.whitePlayer,
        result: resultLabelFromBucket(resultBucket),
        opening: row.opening || "Unknown opening",
        playedAt: row.playedAt || "Unknown date",
        status: row.analysisStatus
      };
    })
  };
}

export async function getGameDetail(gameId: string) {
  const game = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!game[0]) {
    return null;
  }

  const profile = await getProfile();
  const playerColor = profile
    ? usernamesMatch(game[0].whitePlayer, profile.username)
      ? "white"
      : usernamesMatch(game[0].blackPlayer, profile.username)
        ? "black"
        : null
    : null;
  const review = await db.select().from(gameReviews).where(eq(gameReviews.gameId, gameId)).limit(1);
  const positionRows = await db.select().from(positions).where(eq(positions.gameId, gameId)).orderBy(asc(positions.ply));
  const evalRows = await db
    .select()
    .from(engineReviews)
    .where(eq(engineReviews.gameId, gameId))
    .orderBy(desc(engineReviews.deltaCp), asc(engineReviews.ply));
  const leakNotesRows = await db
    .select()
    .from(leakExampleNotes)
    .where(eq(leakExampleNotes.gameId, gameId))
    .orderBy(asc(leakExampleNotes.ply));
  const criticalMomentNoteRows = await db
    .select()
    .from(criticalMomentNotes)
    .where(eq(criticalMomentNotes.gameId, gameId))
    .orderBy(asc(criticalMomentNotes.ply));

  return {
    game: game[0],
    resultLabel: resultLabelFromBucket(
      classifyResultBucketForGame({
        result: game[0].result,
        whitePlayer: game[0].whitePlayer,
        blackPlayer: game[0].blackPlayer,
        username: profile?.username
      })
    ),
    playerColor,
    review: review[0]
      ? {
          summary: review[0].summary,
          coachingNotes: safeJsonParse<string[]>(review[0].coachingNotesJson, []),
          actionItems: safeJsonParse<string[]>(review[0].actionItemsJson, []),
          confidence: review[0].confidence / 100,
          coachSource: review[0].coachSource,
          coachProvider: review[0].coachProvider,
          coachModel: review[0].coachModel
        }
      : null,
    positions: positionRows.map((row) => ({
      ...row,
      tags: safeJsonParse<string[]>(row.tagsJson, [])
    })),
    engineReviews: evalRows.map((row) => ({
      ...row,
      tags: safeJsonParse<string[]>(row.tagsJson, [])
    })),
    leakNotes: leakNotesRows.map((row) => ({
      ply: row.ply,
      explanation: row.explanation,
      whyLeak: row.whyLeak,
      provider: row.provider,
      model: row.model
    })),
    criticalMomentNotes: criticalMomentNoteRows.map((row) => ({
      ply: row.ply,
      label: row.label,
      provider: row.provider,
      model: row.model,
      whatHappened: row.whatHappened,
      whyItMatters: row.whyItMatters,
      whatToThink: row.whatToThink,
      trainingFocus: row.trainingFocus,
      confidence: row.confidence / 100
    }))
  };
}

export async function getStoredAIReport(reportType: string) {
  const rows = await db.select().from(aiReports).where(eq(aiReports.reportType, reportType)).limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    title: row.title,
    gamesCount: row.gamesCount,
    provider: row.provider,
    model: row.model,
    updatedAt: row.updatedAt,
    payload: safeJsonParse<PortfolioReview | null>(row.payloadJson, null)
  };
}

export async function upsertAIReport(input: {
  reportType: string;
  title: string;
  gamesCount: number;
  provider: string;
  model: string;
  payload: PortfolioReview;
}) {
  const existing = await db.select().from(aiReports).where(eq(aiReports.reportType, input.reportType)).limit(1);
  const timestamp = nowTs();

  if (existing[0]) {
    await db
      .update(aiReports)
      .set({
        title: input.title,
        gamesCount: input.gamesCount,
        payloadJson: JSON.stringify(input.payload),
        provider: input.provider,
        model: input.model,
        updatedAt: timestamp
      })
      .where(eq(aiReports.id, existing[0].id));
    return;
  }

  await db.insert(aiReports).values({
    id: createId("report"),
    reportType: input.reportType,
    title: input.title,
    gamesCount: input.gamesCount,
    payloadJson: JSON.stringify(input.payload),
    provider: input.provider,
    model: input.model,
    updatedAt: timestamp
  });
}

export async function getRecentGamesForPortfolioReview(limit = 30) {
  const profile = await getProfile();
  const normalizedLimit = Math.max(1, Math.min(30, limit));
  const gameRows = await db
    .select()
    .from(games)
    .where(eq(games.analysisStatus, "analyzed"))
    .orderBy(desc(games.playedAt), desc(games.updatedAt))
    .limit(normalizedLimit);

  if (!gameRows.length) {
    return {
      sampleSize: 0,
      results: { win: 0, loss: 0, draw: 0, unknown: 0 },
      openings: [] as Array<{ name: string; count: number }>,
      leakLabels: [] as Array<{ label: string; count: number }>,
      games: [] as Array<{
        id: string;
        playedAt: string | null;
        opening: string;
        result: string;
        timeControl: string | null;
        biggestSwing: number;
        topMistakes: Array<{
          ply: number;
          label: string;
          deltaCp: number;
          playedMove: string;
          bestMove: string;
          tags: string[];
        }>;
      }>
    };
  }

  const gameIds = gameRows.map((row) => row.id);
  const reviewRows = await db
    .select()
    .from(engineReviews)
    .where(inArray(engineReviews.gameId, gameIds))
    .orderBy(desc(engineReviews.deltaCp), asc(engineReviews.ply));

  const byGame = new Map<
    string,
    Array<{
      ply: number;
      label: string;
      deltaCp: number;
      playedMove: string;
      bestMove: string;
      tags: string[];
    }>
  >();

  const openingCounts = new Map<string, number>();
  const leakCounts = new Map<string, number>();
  const results = { win: 0, loss: 0, draw: 0, unknown: 0 };

  for (const game of gameRows) {
    results[
      classifyResultBucketForGame({
        result: game.result,
        whitePlayer: game.whitePlayer,
        blackPlayer: game.blackPlayer,
        username: profile?.username
      })
    ] += 1;
    openingCounts.set(game.opening || "Unknown opening", (openingCounts.get(game.opening || "Unknown opening") ?? 0) + 1);
  }

  for (const row of reviewRows) {
    const list = byGame.get(row.gameId) ?? [];
    list.push({
      ply: row.ply,
      label: row.label,
      deltaCp: row.deltaCp,
      playedMove: row.playedMove,
      bestMove: row.bestMove,
      tags: safeJsonParse<string[]>(row.tagsJson, [])
    });
    byGame.set(row.gameId, list);
    leakCounts.set(row.label, (leakCounts.get(row.label) ?? 0) + 1);
  }

  return {
    sampleSize: gameRows.length,
    results,
    openings: Array.from(openingCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8),
    leakLabels: Array.from(leakCounts.entries())
      .map(([label, count]) => ({
        label: leakKeyFromLabel(label)?.label ?? label,
        count
      }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 8),
    games: gameRows.map((game) => {
      const mistakes = (byGame.get(game.id) ?? []).slice(0, 3);
      const resultBucket = classifyResultBucketForGame({
        result: game.result,
        whitePlayer: game.whitePlayer,
        blackPlayer: game.blackPlayer,
        username: profile?.username
      });

      return {
        id: game.id,
        playedAt: game.playedAt,
        opening: game.opening || "Unknown opening",
        result: resultLabelFromBucket(resultBucket),
        timeControl: game.timeControl,
        biggestSwing: mistakes[0]?.deltaCp ?? 0,
        topMistakes: mistakes
      };
    })
  };
}

export async function getDueTrainingCard() {
  const rows = await db
    .select()
    .from(trainingCards)
    .where(lte(trainingCards.dueAt, nowTs()))
    .orderBy(desc(trainingCards.difficulty))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    tags: safeJsonParse<string[]>(row.tagsJson, [])
  };
}

export async function getWeaknessDetail(key: string) {
  const weaknessRows = await db.select().from(weaknessPatterns).where(eq(weaknessPatterns.key, key)).limit(1);
  const weakness = weaknessRows[0];
  if (!weakness) {
    return null;
  }
  const labels = labelsForLeakKey(weakness.key);

  const linkedExamplesRows =
    labels.length > 0
      ? await db
          .select({
            gameId: games.id,
            opening: games.opening,
            ply: engineReviews.ply,
            deltaCp: engineReviews.deltaCp,
            playedMove: engineReviews.playedMove,
            bestMove: engineReviews.bestMove,
            label: engineReviews.label
          })
          .from(engineReviews)
          .innerJoin(games, eq(engineReviews.gameId, games.id))
          .where(inArray(engineReviews.label, labels))
          .orderBy(desc(engineReviews.deltaCp), desc(games.playedAt))
          .limit(12)
      : [];

  const relatedCards = await db
    .select()
    .from(trainingCards)
    .where(eq(trainingCards.theme, weakness.label))
    .orderBy(asc(trainingCards.dueAt))
    .limit(12);

  return {
    weakness: {
      ...weakness,
      examples:
        linkedExamplesRows.length > 0
          ? linkedExamplesRows.map((row) => ({
              text: `${row.opening || "Unknown opening"} • ply ${row.ply} • ${row.deltaCp}cp swing`,
              href: `/games/${row.gameId}?ply=${row.ply}`,
              gameId: row.gameId,
              ply: row.ply,
              opening: row.opening || "Unknown opening",
              deltaCp: row.deltaCp,
              playedMove: row.playedMove,
              bestMove: row.bestMove,
              label: row.label
            }))
          : safeJsonParse<string[]>(weakness.examplesJson, []).map((example, index) => ({
              text: example,
              href: undefined,
              gameId: `stored-${index}`,
              ply: undefined,
              opening: "Unknown opening",
              deltaCp: undefined,
              playedMove: undefined,
              bestMove: undefined,
              label: undefined
            }))
    },
    relatedCards: relatedCards.map((card) => ({
      ...card,
      tags: safeJsonParse<string[]>(card.tagsJson, [])
    }))
  };
}

export async function queueLeakCoachSession(key: string, limit = 3) {
  const weaknessRows = await db.select().from(weaknessPatterns).where(eq(weaknessPatterns.key, key)).limit(1);
  const weakness = weaknessRows[0];
  if (!weakness) {
    throw new Error("Leak not found");
  }

  const relatedCards = await db
    .select()
    .from(trainingCards)
    .where(eq(trainingCards.theme, weakness.label))
    .orderBy(desc(trainingCards.difficulty), asc(trainingCards.dueAt))
    .limit(limit);

  if (!relatedCards.length) {
    return {
      queued: 0,
      leakKey: weakness.key,
      leakLabel: weakness.label
    };
  }

  const dueAtBase = nowTs();
  for (let index = 0; index < relatedCards.length; index += 1) {
    const card = relatedCards[index];
    await db
      .update(trainingCards)
      .set({
        dueAt: dueAtBase + index,
        intervalDays: 1
      })
      .where(eq(trainingCards.id, card.id));
  }

  return {
    queued: relatedCards.length,
    leakKey: weakness.key,
    leakLabel: weakness.label
  };
}

export async function recordTrainingAnswer(cardId: string, move: string, confidence?: number) {
  const rows = await db.select().from(trainingCards).where(eq(trainingCards.id, cardId)).limit(1);
  const card = rows[0];
  if (!card) {
    throw new Error("Training card not found");
  }

  const expectedMove = resolveMoveFromInput(card.promptFen, card.expectedMove);
  const submittedMove = resolveMoveFromInput(card.promptFen, move);
  if (!submittedMove) {
    throw new Error("Illegal move for this position");
  }

  const normalizedExpected = expectedMove?.uci ?? card.expectedMove.trim().toLowerCase();
  const normalizedMove = submittedMove.uci;
  const correct = normalizedExpected === normalizedMove;
  const nextInterval = correct ? Math.max(1, card.intervalDays * 2) : 1;
  const streak = correct ? card.streak + 1 : 0;
  const answeredAt = nowTs();

  await db.insert(trainingSessions).values({
    id: createId("session"),
    cardId,
    move: submittedMove.uci,
    correct: correct ? 1 : 0,
    confidence,
    answeredAt
  });

  await db
    .update(trainingCards)
    .set({
      intervalDays: nextInterval,
      streak,
      dueAt: correct ? daysFromNow(nextInterval) : nowTs(),
      lastAnsweredAt: answeredAt
    })
    .where(eq(trainingCards.id, cardId));

  return {
    correct,
    expectedMove: expectedMove ? `${expectedMove.san} (${expectedMove.uci})` : card.expectedMove,
    explanation: card.explanation,
    hint: card.hint
  };
}
