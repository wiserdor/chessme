"use client";

import type {
  CriticalMomentLearning,
  NoteAnchorType,
  NoteRecord,
  PortfolioReview,
  PrivateAIConfig,
  PrivateAIReportCache,
  PrivateCoachMessage,
  PrivateGameAIReview,
  PrivateLeakExplanationCache,
  PrivateTrainingProgress,
  SavedProfileShortcut
} from "@/lib/types";
import { buildDerivedTags, buildNoteExcerpt, buildNoteHref, buildNoteTitle, dedupeTags } from "@/lib/services/notes";

const DB_NAME = "chessme-private";
const DB_VERSION = 1;
const ACTIVE_PROFILE_KEY = "chessme-active-profile";

type StoredNote = Omit<NoteRecord, "href" | "excerpt"> & {
  profileKey: string;
};

type StoredFavorite = {
  id: string;
  profileKey: string;
  gameId: string;
  createdAt: number;
};

type StoredMigrationState = {
  id: string;
  completedAt: number;
};

let openPromise: Promise<IDBDatabase> | null = null;

function requireIndexedDb() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    throw new Error("IndexedDB is not available in this browser.");
  }
}

function profileKey(value?: string | null) {
  return value?.trim().toLowerCase() || "default";
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

async function openDb() {
  requireIndexedDb();
  if (!openPromise) {
    openPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains("aiConfig")) {
          db.createObjectStore("aiConfig", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("savedProfiles")) {
          db.createObjectStore("savedProfiles", { keyPath: "username" });
        }
        if (!db.objectStoreNames.contains("favorites")) {
          db.createObjectStore("favorites", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("notes")) {
          db.createObjectStore("notes", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("coachMessages")) {
          db.createObjectStore("coachMessages", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("gameAIReviews")) {
          db.createObjectStore("gameAIReviews", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("leakAI")) {
          db.createObjectStore("leakAI", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("aiReports")) {
          db.createObjectStore("aiReports", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("trainingProgress")) {
          db.createObjectStore("trainingProgress", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("migrationStates")) {
          db.createObjectStore("migrationStates", { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
    });
  }

  return openPromise;
}

function nowTs() {
  return Date.now();
}

function createId(prefix: string) {
  return `${prefix}_${window.crypto.randomUUID()}`;
}

function mapStoredNote(row: StoredNote): NoteRecord {
  return {
    ...row,
    href: buildNoteHref(row),
    excerpt: buildNoteExcerpt(row.body)
  };
}

async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const rows = await requestToPromise(store.getAll());
  await transactionDone(transaction);
  return rows as T[];
}

async function putIntoStore(storeName: string, value: unknown) {
  const db = await openDb();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
}

async function deleteFromStore(storeName: string, key: IDBValidKey) {
  const db = await openDb();
  const transaction = db.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

export function getStoredActiveProfile() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_PROFILE_KEY);
}

export function setStoredActiveProfile(username: string) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = profileKey(username);
  window.localStorage.setItem(ACTIVE_PROFILE_KEY, normalized);
  window.document.cookie = `${ACTIVE_PROFILE_KEY}=${encodeURIComponent(normalized)}; path=/; max-age=31536000; samesite=lax`;
}

export async function getPrivateAIConfig(): Promise<PrivateAIConfig> {
  const rows = await getAllFromStore<Array<PrivateAIConfig & { id: string }>>("aiConfig");
  const row = (rows as unknown as Array<PrivateAIConfig & { id: string }>)[0];
  return (
    row ?? {
      provider: "mock",
      model: "deterministic-coach",
      apiKey: null,
      updatedAt: 0
    }
  );
}

export async function savePrivateAIConfig(input: { provider: "openai" | "mock"; model: string; apiKey: string | null }) {
  await putIntoStore("aiConfig", {
    id: "singleton",
    provider: input.provider,
    model: input.model,
    apiKey: input.apiKey,
    updatedAt: nowTs()
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("private-ai-config-updated"));
  }
}

export async function clearPrivateAIConfig() {
  await deleteFromStore("aiConfig", "singleton");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("private-ai-config-updated"));
  }
}

export async function listSavedProfiles(): Promise<SavedProfileShortcut[]> {
  const rows = await getAllFromStore<SavedProfileShortcut>("savedProfiles");
  return rows.sort((left, right) => right.lastOpenedAt - left.lastOpenedAt);
}

export async function saveProfileShortcut(username: string) {
  const normalized = profileKey(username);
  const current = (await listSavedProfiles()).find((item) => item.username === normalized);
  await putIntoStore("savedProfiles", {
    username: normalized,
    savedAt: current?.savedAt ?? nowTs(),
    lastOpenedAt: nowTs()
  } satisfies SavedProfileShortcut);
}

export async function removeProfileShortcut(username: string) {
  await deleteFromStore("savedProfiles", profileKey(username));
}

export async function touchProfileShortcut(username: string) {
  const normalized = profileKey(username);
  const current = (await listSavedProfiles()).find((item) => item.username === normalized);
  if (!current) {
    return;
  }
  await putIntoStore("savedProfiles", {
    ...current,
    lastOpenedAt: nowTs()
  });
}

export async function isFavoriteGame(username: string, gameId: string) {
  const rows = await getAllFromStore<StoredFavorite>("favorites");
  return rows.some((row) => row.profileKey === profileKey(username) && row.gameId === gameId);
}

export async function listFavoriteGameIds(username: string) {
  const rows = await getAllFromStore<StoredFavorite>("favorites");
  return rows.filter((row) => row.profileKey === profileKey(username)).map((row) => row.gameId);
}

export async function setFavoriteGame(username: string, gameId: string, favorite: boolean) {
  const key = `${profileKey(username)}:${gameId}`;
  if (favorite) {
    await putIntoStore("favorites", {
      id: key,
      profileKey: profileKey(username),
      gameId,
      createdAt: nowTs()
    } satisfies StoredFavorite);
  } else {
    await deleteFromStore("favorites", key);
  }
}

export async function createPrivateNote(
  username: string,
  input: {
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
  }
) {
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

  const row: StoredNote = {
    id: createId("note"),
    profileKey: profileKey(username),
    title,
    body: input.body.trim(),
    manualTags,
    derivedTags,
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
  };

  await putIntoStore("notes", row);
  return mapStoredNote(row);
}

export async function updatePrivateNote(
  username: string,
  noteId: string,
  input: {
    title?: string | null;
    body: string;
    manualTags?: string[];
  }
) {
  const rows = await getAllFromStore<StoredNote>("notes");
  const current = rows.find((row) => row.id === noteId && row.profileKey === profileKey(username));
  if (!current) {
    throw new Error("Note not found.");
  }

  const manualTags = dedupeTags(input.manualTags ?? []);
  const title = buildNoteTitle({
    title: input.title,
    body: input.body,
    anchorType: current.anchorType,
    anchorLabel: current.anchorLabel,
    opening: current.opening,
    leakKey: current.leakKey,
    focusArea: current.focusArea
  });

  const next: StoredNote = {
    ...current,
    title,
    body: input.body.trim(),
    manualTags,
    updatedAt: nowTs()
  };

  await putIntoStore("notes", next);
  return mapStoredNote(next);
}

export async function deletePrivateNote(username: string, noteId: string) {
  const rows = await getAllFromStore<StoredNote>("notes");
  const current = rows.find((row) => row.id === noteId && row.profileKey === profileKey(username));
  if (!current) {
    return;
  }
  await deleteFromStore("notes", current.id);
}

export async function searchPrivateNotes(
  username: string,
  filters?: {
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
  }
) {
  const rows = await getAllFromStore<StoredNote>("notes");
  const normalizedQuery = filters?.q?.trim().toLowerCase() ?? "";
  const normalizedTag = filters?.tag?.trim().toLowerCase() ?? "";
  const wantsFen = filters?.hasFen === true || filters?.hasFen === "true" || filters?.hasFen === "1";

  return rows
    .filter((row) => row.profileKey === profileKey(username))
    .map(mapStoredNote)
    .filter((note) => {
      if (filters?.anchorType && note.anchorType !== filters.anchorType) {
        return false;
      }
      if (normalizedTag && ![...note.manualTags, ...note.derivedTags].includes(normalizedTag)) {
        return false;
      }
      if (filters?.opening && note.opening?.toLowerCase() !== filters.opening.toLowerCase()) {
        return false;
      }
      if (filters?.leakKey && note.leakKey !== filters.leakKey) {
        return false;
      }
      if (filters?.gameId && note.gameId !== filters.gameId) {
        return false;
      }
      if (typeof filters?.ply === "number" && note.ply !== filters.ply) {
        return false;
      }
      if (filters?.trainingCardId && note.trainingCardId !== filters.trainingCardId) {
        return false;
      }
      if (filters?.focusArea && note.focusArea?.toLowerCase() !== filters.focusArea.toLowerCase()) {
        return false;
      }
      if (wantsFen && !note.fen) {
        return false;
      }
      if (normalizedQuery) {
        const blob = `${note.title} ${note.body} ${note.anchorLabel} ${note.opening ?? ""} ${note.leakKey ?? ""} ${[
          ...note.manualTags,
          ...note.derivedTags
        ].join(" ")}`.toLowerCase();
        if (!blob.includes(normalizedQuery)) {
          return false;
        }
      }
      return true;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, filters?.limit ?? 100);
}

export async function getNotesFilterOptions(username: string) {
  const notes = await searchPrivateNotes(username);
  return {
    tags: Array.from(new Set(notes.flatMap((note) => note.manualTags))).sort(),
    openings: Array.from(new Set(notes.map((note) => note.opening).filter(Boolean) as string[])).sort(),
    focusAreas: Array.from(new Set(notes.map((note) => note.focusArea).filter(Boolean) as string[])).sort(),
    leakOptions: Array.from(
      new Map(
        notes
          .filter((note) => note.leakKey)
          .map((note) => [note.leakKey!, { key: note.leakKey!, label: note.leakKey!.replace(/-/g, " ") }])
      ).values()
    )
  };
}

export async function getCoachMessages(username: string, gameId: string): Promise<PrivateCoachMessage[]> {
  const rows = await getAllFromStore<PrivateCoachMessage>("coachMessages");
  return rows
    .filter((row) => row.profileKey === profileKey(username) && row.gameId === gameId)
    .sort((left, right) => left.createdAt - right.createdAt);
}

export async function appendCoachExchange(
  username: string,
  gameId: string,
  input: {
    question: string;
    answer: string;
    focusPly?: number | null;
    focusArea?: string | null;
  }
) {
  const timestamp = nowTs();
  const userMessage: PrivateCoachMessage = {
    id: createId("chat"),
    profileKey: profileKey(username),
    gameId,
    role: "user",
    content: input.question,
    focusPly: input.focusPly ?? null,
    focusArea: input.focusArea ?? null,
    createdAt: timestamp
  };
  const coachMessage: PrivateCoachMessage = {
    id: createId("chat"),
    profileKey: profileKey(username),
    gameId,
    role: "coach",
    content: input.answer,
    focusPly: input.focusPly ?? null,
    focusArea: input.focusArea ?? null,
    createdAt: timestamp + 1
  };
  await putIntoStore("coachMessages", userMessage);
  await putIntoStore("coachMessages", coachMessage);
}

export async function savePrivateGameAIReview(
  username: string,
  gameId: string,
  input: Omit<PrivateGameAIReview, "gameId" | "profileKey" | "updatedAt">
) {
  await putIntoStore("gameAIReviews", {
    id: `${profileKey(username)}:${gameId}`,
    profileKey: profileKey(username),
    gameId,
    ...input,
    updatedAt: nowTs()
  });
}

export async function getPrivateGameAIReview(username: string, gameId: string): Promise<PrivateGameAIReview | null> {
  const rows = await getAllFromStore<Array<PrivateGameAIReview & { id: string }>>("gameAIReviews");
  const row = (rows as unknown as Array<PrivateGameAIReview & { id: string }>).find(
    (item) => item.profileKey === profileKey(username) && item.gameId === gameId
  );
  return row ?? null;
}

export async function savePrivateLeakExplanationCache(
  username: string,
  leakKey: string,
  input: Omit<PrivateLeakExplanationCache, "leakKey" | "profileKey" | "updatedAt">
) {
  await putIntoStore("leakAI", {
    id: `${profileKey(username)}:${leakKey}`,
    profileKey: profileKey(username),
    leakKey,
    ...input,
    updatedAt: nowTs()
  });
}

export async function getPrivateLeakExplanationCache(
  username: string,
  leakKey: string
): Promise<PrivateLeakExplanationCache | null> {
  const rows = await getAllFromStore<Array<PrivateLeakExplanationCache & { id: string }>>("leakAI");
  const row = (rows as unknown as Array<PrivateLeakExplanationCache & { id: string }>).find(
    (item) => item.profileKey === profileKey(username) && item.leakKey === leakKey
  );
  return row ?? null;
}

export async function savePrivateAIReport(
  username: string,
  reportType: string,
  input: Omit<PrivateAIReportCache, "reportType" | "profileKey" | "updatedAt">
) {
  await putIntoStore("aiReports", {
    id: `${profileKey(username)}:${reportType}`,
    profileKey: profileKey(username),
    reportType,
    ...input,
    updatedAt: nowTs()
  });
}

export async function getPrivateAIReport(username: string, reportType: string): Promise<PrivateAIReportCache | null> {
  const rows = await getAllFromStore<Array<PrivateAIReportCache & { id: string }>>("aiReports");
  const row = (rows as unknown as Array<PrivateAIReportCache & { id: string }>).find(
    (item) => item.profileKey === profileKey(username) && item.reportType === reportType
  );
  return row ?? null;
}

export async function getTrainingProgress(username: string, cardId: string): Promise<PrivateTrainingProgress | null> {
  const rows = await getAllFromStore<Array<PrivateTrainingProgress & { id: string }>>("trainingProgress");
  const row = (rows as unknown as Array<PrivateTrainingProgress & { id: string }>).find(
    (item) => item.profileKey === profileKey(username) && item.cardId === cardId
  );
  return row ?? null;
}

export async function listTrainingProgress(username: string): Promise<PrivateTrainingProgress[]> {
  const rows = await getAllFromStore<Array<PrivateTrainingProgress & { id: string }>>("trainingProgress");
  return (rows as unknown as Array<PrivateTrainingProgress & { id: string }>)
    .filter((item) => item.profileKey === profileKey(username))
    .map(({ id: _id, ...item }) => item);
}

export async function saveTrainingProgress(
  username: string,
  cardId: string,
  input: Omit<PrivateTrainingProgress, "cardId" | "profileKey">
) {
  await putIntoStore("trainingProgress", {
    id: `${profileKey(username)}:${cardId}`,
    profileKey: profileKey(username),
    cardId,
    ...input
  });
}

export async function isMigrationDone(username: string) {
  const rows = await getAllFromStore<StoredMigrationState>("migrationStates");
  return rows.some((row) => row.id === profileKey(username));
}

export async function markMigrationDone(username: string) {
  await putIntoStore("migrationStates", {
    id: profileKey(username),
    completedAt: nowTs()
  } satisfies StoredMigrationState);
}

export async function importLegacyPrivateBootstrap(
  username: string,
  payload: {
    aiSettings?: PrivateAIConfig | null;
    favorites?: string[];
    notes?: NoteRecord[];
    coachMessages?: Array<{
      id: string;
      gameId: string;
      role: "user" | "coach";
      content: string;
      focusPly?: number | null;
      createdAt: number;
    }>;
    aiReports?: Array<{
      reportType: string;
      title: string;
      gamesCount: number;
      payload: PortfolioReview;
      provider: string;
      model: string;
      updatedAt: number;
    }>;
    leakExamples?: Array<{
      leakKey: string;
      gameId: string;
      ply?: number | null;
      provider: string;
      model: string;
      explanation: string;
      whyLeak: string;
      updatedAt: number;
    }>;
    criticalMoments?: Array<{
      gameId: string;
      ply: number;
      label: string;
      provider: string;
      model: string;
      whatHappened: string;
      whyItMatters: string;
      whatToThink: string;
      trainingFocus: string;
      confidence: number;
      updatedAt: number;
    }>;
  } | null
) {
  if (!payload) {
    await markMigrationDone(username);
    return;
  }

  if (payload.aiSettings) {
    await savePrivateAIConfig({
      provider: payload.aiSettings.provider,
      model: payload.aiSettings.model,
      apiKey: payload.aiSettings.apiKey
    });
  }

  for (const gameId of payload.favorites ?? []) {
    await setFavoriteGame(username, gameId, true);
  }

  for (const note of payload.notes ?? []) {
    await putIntoStore("notes", {
      ...note,
      profileKey: profileKey(username)
    } satisfies StoredNote);
  }

  for (const message of payload.coachMessages ?? []) {
    await putIntoStore("coachMessages", {
      ...message,
      profileKey: profileKey(username)
    } satisfies PrivateCoachMessage);
  }

  for (const report of payload.aiReports ?? []) {
    await savePrivateAIReport(username, report.reportType, {
      title: report.title,
      gamesCount: report.gamesCount,
      payload: report.payload,
      provider: report.provider,
      model: report.model
    });
  }

  const groupedLeakExamples = new Map<string, PrivateLeakExplanationCache>();
  for (const example of payload.leakExamples ?? []) {
    const current =
      groupedLeakExamples.get(example.leakKey) ??
      {
        leakKey: example.leakKey,
        profileKey: profileKey(username),
        examples: [],
        provider: example.provider,
        model: example.model,
        updatedAt: example.updatedAt
      };
    current.examples.push({
      gameId: example.gameId,
      ply: example.ply,
      explanation: example.explanation,
      whyLeak: example.whyLeak,
      source: "ai"
    });
    groupedLeakExamples.set(example.leakKey, current);
  }
  for (const [leakKey, cache] of groupedLeakExamples.entries()) {
    await savePrivateLeakExplanationCache(username, leakKey, {
      examples: cache.examples,
      provider: cache.provider,
      model: cache.model
    });
  }

  const groupedCriticalMoments = new Map<string, PrivateGameAIReview>();
  for (const note of payload.criticalMoments ?? []) {
    const current =
      groupedCriticalMoments.get(note.gameId) ??
      {
        gameId: note.gameId,
        profileKey: profileKey(username),
        review: {
          summary: "",
          coachingNotes: [],
          actionItems: [],
          confidence: 0.55
        },
        criticalMoments: [],
        provider: note.provider,
        model: note.model,
        updatedAt: note.updatedAt
      };
    current.criticalMoments.push({
      ply: note.ply,
      label: note.label,
      whatHappened: note.whatHappened,
      whyItMatters: note.whyItMatters,
      whatToThink: note.whatToThink,
      trainingFocus: note.trainingFocus,
      confidence: note.confidence
    });
    groupedCriticalMoments.set(note.gameId, current);
  }
  for (const [gameId, review] of groupedCriticalMoments.entries()) {
    const existing = await getPrivateGameAIReview(username, gameId);
    if (!existing) {
      await savePrivateGameAIReview(username, gameId, {
        review: review.review,
        criticalMoments: review.criticalMoments,
        provider: review.provider,
        model: review.model
      });
    }
  }

  await markMigrationDone(username);
}
