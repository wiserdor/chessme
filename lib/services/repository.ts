import { and, asc, desc, eq, inArray, lte, or } from "drizzle-orm";
import { Chess } from "chess.js";
import { cookies } from "next/headers";

import { db, sqlite } from "@/lib/db";
import {
  aiConfigs,
  analysisJobs,
  aiReports,
  coachChatMessages,
  criticalMomentNotes,
  engineReviews,
  gameImports,
  gameReviews,
  games,
  leakExampleNotes,
  notes,
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
  NoteAnchorType,
  NoteRecord,
  PortfolioReview,
  ProviderName,
  ReviewNarrative,
  TrainingCardPayload,
  WeaknessPatternInput
} from "@/lib/types";
import {
  buildDerivedTags,
  buildNoteExcerpt,
  buildNoteHref,
  buildNoteTitle,
  dedupeTags,
  scoreNoteForCoachLabContext,
  scoreNoteForGameContext
} from "@/lib/services/notes";
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

function normalizeProfileUsername(username?: string | null) {
  return username?.trim().toLowerCase() || null;
}

const ACTIVE_PROFILE_COOKIE = "chessme-active-profile";

async function getLatestPublicProfileUsername() {
  const rows = await db.select().from(profiles).orderBy(desc(profiles.updatedAt), desc(profiles.createdAt)).limit(1);
  return normalizeProfileUsername(rows[0]?.username);
}

async function getCookieActiveProfileUsername() {
  try {
    const cookieStore = await cookies();
    return normalizeProfileUsername(cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value);
  } catch {
    return null;
  }
}

export async function resolvePublicProfileUsername(username?: string | null) {
  return (
    normalizeProfileUsername(username) ??
    (await getCookieActiveProfileUsername()) ??
    (await getLatestPublicProfileUsername()) ??
    "default"
  );
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

function leakLabelFromKey(key?: string | null) {
  switch (key) {
    case "opening-leaks":
      return "Opening leaks";
    case "tactical-oversights":
      return "Tactical oversights";
    case "large-blunders":
      return "Large blunders";
    case "endgame-conversion":
      return "Endgame conversion";
    case "decision-drift":
      return "Decision drift";
    default:
      return "";
  }
}

function mapNoteRow(row: typeof notes.$inferSelect): NoteRecord {
  const manualTags = safeJsonParse<string[]>(row.manualTagsJson, []);
  const derivedTags = safeJsonParse<string[]>(row.derivedTagsJson, []);

  return {
    id: row.id,
    title: row.title,
    body: row.body,
    manualTags,
    derivedTags,
    anchorType: row.anchorType as NoteAnchorType,
    anchorLabel: row.anchorLabel,
    sourcePath: row.sourcePath,
    gameId: row.gameId,
    ply: row.ply,
    fen: row.fen,
    opening: row.opening,
    leakKey: row.leakKey,
    trainingCardId: row.trainingCardId,
    focusArea: row.focusArea,
    coachMessageContext: row.coachMessageContext,
    href: buildNoteHref({
      anchorType: row.anchorType as NoteAnchorType,
      sourcePath: row.sourcePath,
      gameId: row.gameId,
      ply: row.ply,
      leakKey: row.leakKey
    }),
    excerpt: buildNoteExcerpt(row.body),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function upsertNoteSearchRow(row: {
  id: string;
  title: string;
  body: string;
  manualTags: string[];
  derivedTags: string[];
  anchorLabel: string;
  opening?: string | null;
  leakKey?: string | null;
}) {
  sqlite.prepare("DELETE FROM notes_search WHERE note_id = ?").run(row.id);
  sqlite
    .prepare(
      "INSERT INTO notes_search (note_id, title, body, manual_tags, derived_tags, anchor_label, opening, leak_label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      row.id,
      row.title,
      row.body,
      row.manualTags.join(" "),
      row.derivedTags.join(" "),
      row.anchorLabel,
      row.opening || "",
      leakLabelFromKey(row.leakKey)
    );
}

function deleteNoteSearchRow(noteId: string) {
  sqlite.prepare("DELETE FROM notes_search WHERE note_id = ?").run(noteId);
}

function escapeFtsQuery(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/"/g, '""'))
    .filter(Boolean)
    .map((token) => `"${token}"*`)
    .join(" ");
}

export async function upsertProfile(username: string, provider: string, model: string) {
  const normalizedUsername = normalizeProfileUsername(username);
  if (!normalizedUsername) {
    throw new Error("Username is required.");
  }

  const existing = await db.select().from(profiles).where(eq(profiles.username, normalizedUsername)).limit(1);
  const timestamp = nowTs();

  if (existing[0]) {
    await db
      .update(profiles)
      .set({
        username: normalizedUsername,
        provider,
        model,
        updatedAt: timestamp
      })
      .where(eq(profiles.id, existing[0].id));

    return;
  }

  await db.insert(profiles).values({
    id: createId("profile"),
    username: normalizedUsername,
    provider,
    model,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

export async function getProfile(username?: string | null) {
  const normalizedUsername = normalizeProfileUsername(username);
  const rows = normalizedUsername
    ? await db.select().from(profiles).where(eq(profiles.username, normalizedUsername)).limit(1)
    : await db.select().from(profiles).orderBy(desc(profiles.updatedAt), desc(profiles.createdAt)).limit(1);
  return rows[0] ?? null;
}

export async function searchPublicProfiles(query?: string | null, limit = 12) {
  const normalized = query?.trim().toLowerCase() ?? "";
  const rows = await db.select().from(profiles).orderBy(desc(profiles.updatedAt), desc(profiles.createdAt));
  return rows
    .filter((row) => !normalized || row.username.toLowerCase().includes(normalized))
    .slice(0, limit)
    .map((row) => ({
      username: row.username,
      updatedAt: row.updatedAt
    }));
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
  await db.delete(coachChatMessages);
  await db.delete(notes);
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
  sqlite.prepare("DELETE FROM notes_search").run();

  if (options?.includeSettings) {
    await db.delete(profiles);
    await db.delete(aiConfigs);
  }

  return {
    cleared: true,
    includeSettings: Boolean(options?.includeSettings)
  };
}

export async function createNote(input: {
  title?: string | null;
  body: string;
  manualTags?: string[];
  anchorType: NoteAnchorType;
  anchorLabel?: string | null;
  sourcePath: string;
  gameId?: string | null;
  ply?: number | null;
  fen?: string | null;
  opening?: string | null;
  leakKey?: string | null;
  trainingCardId?: string | null;
  focusArea?: string | null;
  coachMessageContext?: string | null;
}) {
  const timestamp = nowTs();
  const manualTags = dedupeTags(input.manualTags ?? []);
  const derivedTags = buildDerivedTags(input);
  const title = buildNoteTitle({
    title: input.title,
    body: input.body,
    anchorType: input.anchorType,
    anchorLabel: input.anchorLabel,
    opening: input.opening,
    leakKey: input.leakKey,
    focusArea: input.focusArea
  });

  const row = {
    id: createId("note"),
    title,
    body: input.body.trim(),
    manualTagsJson: JSON.stringify(manualTags),
    derivedTagsJson: JSON.stringify(derivedTags),
    anchorType: input.anchorType,
    anchorLabel: input.anchorLabel?.trim() || title,
    sourcePath: input.sourcePath,
    gameId: input.gameId ?? null,
    ply: input.ply ?? null,
    fen: input.fen ?? null,
    opening: input.opening ?? null,
    leakKey: input.leakKey ?? null,
    trainingCardId: input.trainingCardId ?? null,
    focusArea: input.focusArea ?? null,
    coachMessageContext: input.coachMessageContext ?? null,
    createdAt: timestamp,
    updatedAt: timestamp
  } satisfies typeof notes.$inferInsert;

  await db.insert(notes).values(row);
  upsertNoteSearchRow({
    id: row.id,
    title: row.title,
    body: row.body,
    manualTags,
    derivedTags,
    anchorLabel: row.anchorLabel,
    opening: row.opening,
    leakKey: row.leakKey
  });

  return mapNoteRow(row);
}

export async function updateNote(noteId: string, input: { title?: string | null; body: string; manualTags?: string[] }) {
  const currentRows = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
  const current = currentRows[0];
  if (!current) {
    throw new Error("Note not found.");
  }

  const manualTags = dedupeTags(input.manualTags ?? []);
  const derivedTags = safeJsonParse<string[]>(current.derivedTagsJson, []);
  const title = buildNoteTitle({
    title: input.title,
    body: input.body,
    anchorType: current.anchorType as NoteAnchorType,
    anchorLabel: current.anchorLabel,
    opening: current.opening,
    leakKey: current.leakKey,
    focusArea: current.focusArea
  });

  await db
    .update(notes)
    .set({
      title,
      body: input.body.trim(),
      manualTagsJson: JSON.stringify(manualTags),
      updatedAt: nowTs()
    })
    .where(eq(notes.id, noteId));

  upsertNoteSearchRow({
    id: current.id,
    title,
    body: input.body.trim(),
    manualTags,
    derivedTags,
    anchorLabel: current.anchorLabel,
    opening: current.opening,
    leakKey: current.leakKey
  });

  const refreshedRows = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
  return mapNoteRow(refreshedRows[0]!);
}

export async function deleteNote(noteId: string) {
  await db.delete(notes).where(eq(notes.id, noteId));
  deleteNoteSearchRow(noteId);
}

export async function getNotesFilterOptions() {
  const rows = await db.select().from(notes).orderBy(desc(notes.updatedAt));
  const mapped = rows.map(mapNoteRow);

  return {
    tags: Array.from(new Set(mapped.flatMap((note) => note.manualTags))).sort((left, right) => left.localeCompare(right)),
    openings: Array.from(new Set(mapped.map((note) => note.opening).filter((value): value is string => Boolean(value)))).sort((left, right) =>
      left.localeCompare(right)
    ),
    focusAreas: Array.from(new Set(mapped.map((note) => note.focusArea).filter((value): value is string => Boolean(value)))).sort((left, right) =>
      left.localeCompare(right)
    ),
    leakOptions: Array.from(
      new Map(
        mapped
          .filter((note) => note.leakKey)
          .map((note) => [note.leakKey!, { key: note.leakKey!, label: leakLabelFromKey(note.leakKey) || note.leakKey! }])
      ).values()
    )
  };
}

export async function searchNotes(filters?: {
  q?: string;
  anchorType?: string;
  tag?: string;
  opening?: string;
  leakKey?: string;
  gameId?: string;
  ply?: number;
  trainingCardId?: string;
  focusArea?: string;
  hasFen?: string | boolean;
  limit?: number;
}) {
  const normalizedQuery = filters?.q?.trim() ?? "";
  const normalizedAnchorType = filters?.anchorType?.trim() ?? "";
  const normalizedTag = filters?.tag?.trim().toLowerCase() ?? "";
  const normalizedOpening = filters?.opening?.trim().toLowerCase() ?? "";
  const normalizedLeakKey = filters?.leakKey?.trim() ?? "";
  const normalizedGameId = filters?.gameId?.trim() ?? "";
  const normalizedPly = typeof filters?.ply === "number" ? filters.ply : null;
  const normalizedTrainingCardId = filters?.trainingCardId?.trim() ?? "";
  const normalizedFocusArea = filters?.focusArea?.trim().toLowerCase() ?? "";
  const wantsFen = filters?.hasFen === true || filters?.hasFen === "true" || filters?.hasFen === "1";

  let orderedIds: string[] | null = null;
  let rows: Array<typeof notes.$inferSelect> = [];

  if (normalizedQuery) {
    const match = escapeFtsQuery(normalizedQuery);
    if (!match) {
      return [];
    }

    const results = sqlite
      .prepare("SELECT note_id, bm25(notes_search) AS rank FROM notes_search WHERE notes_search MATCH ? ORDER BY rank LIMIT 500")
      .all(match) as Array<{ note_id: string; rank: number }>;

    orderedIds = results.map((row) => row.note_id);
    if (!orderedIds.length) {
      return [];
    }

    rows = await db.select().from(notes).where(inArray(notes.id, orderedIds));
  } else {
    rows = await db.select().from(notes).orderBy(desc(notes.updatedAt));
  }

  const mapped = rows
    .map(mapNoteRow)
    .filter((note) => {
      if (normalizedAnchorType && note.anchorType !== normalizedAnchorType) {
        return false;
      }
      if (normalizedTag && ![...note.manualTags, ...note.derivedTags].includes(normalizedTag)) {
        return false;
      }
      if (normalizedOpening && note.opening?.toLowerCase() !== normalizedOpening) {
        return false;
      }
      if (normalizedLeakKey && note.leakKey !== normalizedLeakKey) {
        return false;
      }
      if (normalizedGameId && note.gameId !== normalizedGameId) {
        return false;
      }
      if (normalizedPly !== null && note.ply !== normalizedPly) {
        return false;
      }
      if (normalizedTrainingCardId && note.trainingCardId !== normalizedTrainingCardId) {
        return false;
      }
      if (normalizedFocusArea && note.focusArea?.toLowerCase() !== normalizedFocusArea) {
        return false;
      }
      if (wantsFen && !note.fen) {
        return false;
      }
      return true;
    });

  const sorted = orderedIds
    ? mapped.sort((left, right) => orderedIds!.indexOf(left.id) - orderedIds!.indexOf(right.id))
    : mapped.sort((left, right) => right.updatedAt - left.updatedAt);

  return sorted.slice(0, filters?.limit ?? 100);
}

export async function getRelevantNotesForGameCoach(input: {
  gameId: string;
  focusPly?: number;
  opening?: string | null;
  leakKeys?: string[];
  limit?: number;
}) {
  const rows = await db.select().from(notes).orderBy(desc(notes.updatedAt)).limit(300);

  return rows
    .map(mapNoteRow)
    .map((note) => ({
      note,
      score: scoreNoteForGameContext(note, {
        gameId: input.gameId,
        focusPly: input.focusPly,
        opening: input.opening,
        leakKeys: input.leakKeys
      })
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.note.updatedAt - left.note.updatedAt)
    .slice(0, input.limit ?? 5)
    .map((entry) => entry.note);
}

export async function getRelevantNotesForCoachLab(input: {
  focusArea?: string | null;
  leakKeys?: string[];
  openings?: string[];
  limit?: number;
}) {
  const rows = await db.select().from(notes).orderBy(desc(notes.updatedAt)).limit(300);

  return rows
    .map(mapNoteRow)
    .map((note) => ({
      note,
      score: scoreNoteForCoachLabContext(note, {
        focusArea: input.focusArea,
        leakKeys: input.leakKeys,
        openings: input.openings
      })
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.note.updatedAt - left.note.updatedAt)
    .slice(0, input.limit ?? 5)
    .map((entry) => entry.note);
}

export type AnalysisJobInput = {
  profileUsername?: string;
  gameIds?: string[];
  limit?: number;
  reanalyze?: boolean;
};

export async function createAnalysisJob(options?: AnalysisJobInput) {
  const timestamp = nowTs();
  const id = createId("job");
  const profileUsername = await resolvePublicProfileUsername(options?.profileUsername);

  await db.insert(analysisJobs).values({
    id,
    profileUsername,
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

export async function getActiveAnalysisJob(profileUsername?: string | null) {
  const resolvedProfile = normalizeProfileUsername(profileUsername);
  const rows = resolvedProfile
    ? await db
        .select()
        .from(analysisJobs)
        .where(
          and(
            eq(analysisJobs.profileUsername, resolvedProfile),
            or(eq(analysisJobs.status, "pending"), eq(analysisJobs.status, "running"))
          )
        )
        .orderBy(desc(analysisJobs.updatedAt), desc(analysisJobs.createdAt))
        .limit(1)
    : await db
        .select()
        .from(analysisJobs)
        .where(or(eq(analysisJobs.status, "pending"), eq(analysisJobs.status, "running")))
        .orderBy(desc(analysisJobs.updatedAt), desc(analysisJobs.createdAt))
        .limit(1);

  return rows[0] ?? null;
}

export async function getNextPendingAnalysisJob(profileUsername?: string | null) {
  const resolvedProfile = normalizeProfileUsername(profileUsername);
  const rows = resolvedProfile
    ? await db
        .select()
        .from(analysisJobs)
        .where(and(eq(analysisJobs.profileUsername, resolvedProfile), eq(analysisJobs.status, "pending")))
        .orderBy(asc(analysisJobs.createdAt))
        .limit(1)
    : await db
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

export async function setGamesAnalysisStatus(gameIds: string[], status: string, profileUsername?: string | null) {
  if (!gameIds.length) {
    return;
  }

  const resolvedProfile = await resolvePublicProfileUsername(profileUsername);
  await db
    .update(games)
    .set({
      analysisStatus: status,
      updatedAt: nowTs()
    })
    .where(and(eq(games.profileUsername, resolvedProfile), inArray(games.id, gameIds)));
}

export async function resetAnalyzingGamesToPending(profileUsername?: string | null) {
  const resolvedProfile = await resolvePublicProfileUsername(profileUsername);
  await db
    .update(games)
    .set({
      analysisStatus: "pending",
      updatedAt: nowTs()
    })
    .where(and(eq(games.profileUsername, resolvedProfile), eq(games.analysisStatus, "analyzing")));
}

export async function getGameHistory(filters?: {
  profileUsername?: string;
  query?: string;
  opening?: string;
  leakKey?: string;
  status?: string;
  result?: string;
  favorite?: string;
  minSwing?: number;
  limit?: number;
}) {
  const resolvedProfile = await resolvePublicProfileUsername(filters?.profileUsername);
  const profile = await getProfile(resolvedProfile);
  const gameRows = await db
    .select()
    .from(games)
    .where(eq(games.profileUsername, resolvedProfile))
    .orderBy(desc(games.playedAt), desc(games.createdAt));
  const reviewRows = await db
    .select({
      gameId: engineReviews.gameId,
      label: engineReviews.label,
      deltaCp: engineReviews.deltaCp
    })
    .from(engineReviews)
    .where(eq(engineReviews.profileUsername, resolvedProfile));

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
  const normalizedFavorite = (filters?.favorite || "").trim().toLowerCase();
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
        isFavorite: Boolean(game.isFavorite),
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

      if (normalizedFavorite === "favorite" && !row.isFavorite) {
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

export async function upsertImportedGames(importedGames: ImportedGame[], profileUsername?: string | null) {
  const timestamp = nowTs();
  const resolvedProfile = await resolvePublicProfileUsername(profileUsername);

  for (const game of importedGames) {
    const scopedExternalId = `${resolvedProfile}:${game.externalId}`;
    const existing = await db
      .select()
      .from(games)
      .where(and(eq(games.profileUsername, resolvedProfile), eq(games.externalId, scopedExternalId)))
      .limit(1);

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
      profileUsername: resolvedProfile,
      externalId: scopedExternalId,
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
      isFavorite: 0,
      analysisStatus: "pending",
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }
}

export async function getGamesToAnalyze(
  gameIds?: string[],
  limit = 10,
  reanalyze = false,
  profileUsername?: string | null
) {
  const resolvedProfile = await resolvePublicProfileUsername(profileUsername);
  if (gameIds?.length) {
    return db
      .select()
      .from(games)
      .where(and(eq(games.profileUsername, resolvedProfile), inArray(games.id, gameIds)))
      .limit(limit);
  }

  if (reanalyze) {
    return db
      .select()
      .from(games)
      .where(eq(games.profileUsername, resolvedProfile))
      .orderBy(desc(games.playedAt))
      .limit(limit);
  }

  return db
    .select()
    .from(games)
    .where(and(eq(games.profileUsername, resolvedProfile), eq(games.analysisStatus, "pending")))
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

export async function getCoachChatMessages(gameId: string) {
  const rows = await db
    .select()
    .from(coachChatMessages)
    .where(eq(coachChatMessages.gameId, gameId))
    .orderBy(asc(coachChatMessages.createdAt), asc(coachChatMessages.id));

  return rows.map((row) => ({
    id: row.id,
    role: row.role === "coach" ? ("coach" as const) : ("user" as const),
    content: row.content,
    focusPly: row.focusPly,
    createdAt: row.createdAt
  }));
}

export async function appendCoachChatExchange(input: {
  gameId: string;
  question: string;
  answer: string;
  focusPly?: number;
}) {
  const timestamp = nowTs();

  await db.insert(coachChatMessages).values([
    {
      id: createId("chat"),
      gameId: input.gameId,
      role: "user",
      content: input.question,
      focusPly: input.focusPly ?? null,
      createdAt: timestamp
    },
    {
      id: createId("chat"),
      gameId: input.gameId,
      role: "coach",
      content: input.answer,
      focusPly: input.focusPly ?? null,
      createdAt: timestamp + 1
    }
  ]);
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
  const gameRows = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  const profileUsername = gameRows[0]?.profileUsername ?? (await resolvePublicProfileUsername());
  await db.delete(positions).where(and(eq(positions.profileUsername, profileUsername), eq(positions.gameId, gameId)));
  await db.delete(engineReviews).where(and(eq(engineReviews.profileUsername, profileUsername), eq(engineReviews.gameId, gameId)));

  for (const position of extractedPositions) {
    await db.insert(positions).values({
      id: createId("pos"),
      profileUsername,
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
      profileUsername,
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
  const gameRows = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  const profileUsername = gameRows[0]?.profileUsername ?? (await resolvePublicProfileUsername());
  const existingReview = await db
    .select()
    .from(gameReviews)
    .where(and(eq(gameReviews.profileUsername, profileUsername), eq(gameReviews.gameId, gameId)))
    .limit(1);
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
    profileUsername,
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

export async function replaceWeaknessPatterns(patterns: WeaknessPatternInput[], profileUsername?: string | null) {
  const timestamp = nowTs();
  const resolvedProfile = await resolvePublicProfileUsername(profileUsername);
  await db.delete(weaknessPatterns).where(eq(weaknessPatterns.profileUsername, resolvedProfile));

  for (const pattern of patterns) {
    await db.insert(weaknessPatterns).values({
      id: createId("weak"),
      profileUsername: resolvedProfile,
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
    const gameRows = await db.select().from(games).where(eq(games.id, card.sourceGameId)).limit(1);
    const profileUsername = gameRows[0]?.profileUsername ?? (await resolvePublicProfileUsername());
    const existing = await db
      .select()
      .from(trainingCards)
      .where(
        and(
          eq(trainingCards.profileUsername, profileUsername),
          eq(trainingCards.sourceGameId, card.sourceGameId),
          eq(trainingCards.sourcePly, card.sourcePly)
        )
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
      profileUsername,
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

export async function getDashboardSnapshot(profileUsername?: string | null): Promise<DashboardSnapshot> {
  const resolvedProfile = await resolvePublicProfileUsername(profileUsername);
  const profile = await getProfile(resolvedProfile);
  const activeJob = await getActiveAnalysisJob(resolvedProfile);
  const allGames = await db.select().from(games).where(eq(games.profileUsername, resolvedProfile));
  const gamesRows = await db
    .select()
    .from(games)
    .where(eq(games.profileUsername, resolvedProfile))
    .orderBy(desc(games.playedAt))
    .limit(8);
  const weaknessRows = await db
    .select()
    .from(weaknessPatterns)
    .where(eq(weaknessPatterns.profileUsername, resolvedProfile))
    .orderBy(desc(weaknessPatterns.severity))
    .limit(6);
  const analyzedRows = await db.select().from(gameReviews).where(eq(gameReviews.profileUsername, resolvedProfile));
  const dueCards = await db
    .select()
    .from(trainingCards)
    .where(and(eq(trainingCards.profileUsername, resolvedProfile), lte(trainingCards.dueAt, nowTs())));

  const mapDashboardGame = (row: typeof games.$inferSelect) => {
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
      status: row.analysisStatus,
      isFavorite: Boolean(row.isFavorite)
    };
  };

  return {
    profile: profile
      ? {
          username: profile.username,
          provider: "mock" as ProviderName,
          model: "deterministic-coach"
        }
      : null,
    hasApiKey: false,
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
    recentGames: gamesRows.map(mapDashboardGame),
    favoriteGames: []
  };
}

export async function getGameDetail(gameId: string, profileUsername?: string | null) {
  const resolvedProfile = await resolvePublicProfileUsername(profileUsername);
  const game = await db
    .select()
    .from(games)
    .where(and(eq(games.profileUsername, resolvedProfile), eq(games.id, gameId)))
    .limit(1);
  if (!game[0]) {
    return null;
  }

  const profile = await getProfile(resolvedProfile);
  const playerColor = profile
    ? usernamesMatch(game[0].whitePlayer, profile.username)
      ? "white"
      : usernamesMatch(game[0].blackPlayer, profile.username)
        ? "black"
        : null
    : null;
  const review = await db
    .select()
    .from(gameReviews)
    .where(and(eq(gameReviews.profileUsername, resolvedProfile), eq(gameReviews.gameId, gameId)))
    .limit(1);
  const positionRows = await db
    .select()
    .from(positions)
    .where(and(eq(positions.profileUsername, resolvedProfile), eq(positions.gameId, gameId)))
    .orderBy(asc(positions.ply));
  const evalRows = await db
    .select()
    .from(engineReviews)
    .where(and(eq(engineReviews.profileUsername, resolvedProfile), eq(engineReviews.gameId, gameId)))
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
  const chatRows = await db
    .select()
    .from(coachChatMessages)
    .where(eq(coachChatMessages.gameId, gameId))
    .orderBy(asc(coachChatMessages.createdAt), asc(coachChatMessages.id));

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
    })),
    coachChatMessages: chatRows.map((row) => ({
      id: row.id,
      role: row.role === "coach" ? ("coach" as const) : ("user" as const),
      content: row.content,
      focusPly: row.focusPly,
      createdAt: row.createdAt
    }))
  };
}

export async function setGameFavorite(gameId: string, favorite: boolean) {
  await db
    .update(games)
    .set({
      isFavorite: favorite ? 1 : 0,
      updatedAt: nowTs()
    })
    .where(eq(games.id, gameId));
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

export async function getRecentGamesForPortfolioReview(limit = 30, profileUsername?: string | null) {
  const resolvedProfile = await resolvePublicProfileUsername(profileUsername);
  const profile = await getProfile(resolvedProfile);
  const normalizedLimit = Math.max(1, Math.min(30, limit));
  const gameRows = await db
    .select()
    .from(games)
    .where(and(eq(games.profileUsername, resolvedProfile), eq(games.analysisStatus, "analyzed")))
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
    .where(and(eq(engineReviews.profileUsername, resolvedProfile), inArray(engineReviews.gameId, gameIds)))
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

export async function getDueTrainingCard(profileUsername?: string | null) {
  const resolvedProfile = await resolvePublicProfileUsername(profileUsername);
  const rows = await db
    .select()
    .from(trainingCards)
    .where(and(eq(trainingCards.profileUsername, resolvedProfile), lte(trainingCards.dueAt, nowTs())))
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

export async function getTrainingCards(profileUsername?: string | null, limit = 120) {
  const resolvedProfile = await resolvePublicProfileUsername(profileUsername);
  const rows = await db
    .select()
    .from(trainingCards)
    .where(eq(trainingCards.profileUsername, resolvedProfile))
    .orderBy(desc(trainingCards.difficulty), asc(trainingCards.dueAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    tags: safeJsonParse<string[]>(row.tagsJson, [])
  }));
}

export async function getWeaknessDetail(key: string, profileUsername?: string | null) {
  const resolvedProfile = await resolvePublicProfileUsername(profileUsername);
  const weaknessRows = await db
    .select()
    .from(weaknessPatterns)
    .where(and(eq(weaknessPatterns.profileUsername, resolvedProfile), eq(weaknessPatterns.key, key)))
    .limit(1);
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
            label: engineReviews.label,
            tagsJson: engineReviews.tagsJson
          })
          .from(engineReviews)
          .innerJoin(games, eq(engineReviews.gameId, games.id))
          .where(
            and(
              eq(engineReviews.profileUsername, resolvedProfile),
              eq(games.profileUsername, resolvedProfile),
              inArray(engineReviews.label, labels)
            )
          )
          .orderBy(desc(engineReviews.deltaCp), desc(games.playedAt))
          .limit(12)
      : [];

  const relatedCards = await db
    .select()
    .from(trainingCards)
    .where(and(eq(trainingCards.profileUsername, resolvedProfile), eq(trainingCards.theme, weakness.label)))
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
              label: row.label,
              tags: safeJsonParse<string[]>(row.tagsJson, [])
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
              label: undefined,
              tags: []
            }))
    },
    relatedCards: relatedCards.map((card) => ({
      ...card,
      tags: safeJsonParse<string[]>(card.tagsJson, [])
    }))
  };
}

export async function queueLeakCoachSession(key: string, limit = 3) {
  const resolvedProfile = await resolvePublicProfileUsername();
  const weaknessRows = await db
    .select()
    .from(weaknessPatterns)
    .where(and(eq(weaknessPatterns.profileUsername, resolvedProfile), eq(weaknessPatterns.key, key)))
    .limit(1);
  const weakness = weaknessRows[0];
  if (!weakness) {
    throw new Error("Leak not found");
  }

  const relatedCards = await db
    .select()
    .from(trainingCards)
    .where(and(eq(trainingCards.profileUsername, resolvedProfile), eq(trainingCards.theme, weakness.label)))
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
