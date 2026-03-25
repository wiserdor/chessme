import type { NoteAnchorType, NoteRecord } from "@/lib/types";

type NoteContextLike = {
  anchorType: NoteAnchorType;
  anchorLabel?: string | null;
  sourcePath?: string | null;
  gameId?: string | null;
  ply?: number | null;
  fen?: string | null;
  opening?: string | null;
  leakKey?: string | null;
  trainingCardId?: string | null;
  focusArea?: string | null;
  coachMessageContext?: string | null;
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeManualTag(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function dedupeTags(values: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const value of values) {
    const normalized = normalizeManualTag(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
  }

  return next;
}

export function buildDerivedTags(context: NoteContextLike) {
  const tags = new Set<string>();

  tags.add(context.anchorType);

  if (context.gameId) {
    tags.add("game-linked");
  }

  if (typeof context.ply === "number") {
    tags.add("move-linked");
    tags.add(`ply:${context.ply}`);
  }

  if (context.fen) {
    tags.add("has-position");
  }

  if (context.opening) {
    tags.add("opening-note");
    tags.add(`opening:${slugify(context.opening)}`);
  }

  if (context.leakKey) {
    tags.add("leak-note");
    tags.add(`leak:${context.leakKey}`);
  }

  if (context.trainingCardId) {
    tags.add("training-note");
  }

  if (context.focusArea) {
    tags.add("coach-focus");
    tags.add(`focus:${slugify(context.focusArea)}`);
  }

  if (context.coachMessageContext) {
    tags.add("from-coach");
    tags.add(`coach:${slugify(context.coachMessageContext)}`);
  }

  return Array.from(tags.values());
}

export function buildNoteTitle(input: {
  title?: string | null;
  body: string;
  anchorType: NoteAnchorType;
  anchorLabel?: string | null;
  opening?: string | null;
  leakKey?: string | null;
  focusArea?: string | null;
}) {
  const explicit = input.title?.trim();
  if (explicit) {
    return explicit;
  }

  const firstLine = input.body
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (firstLine) {
    return firstLine.length > 70 ? `${firstLine.slice(0, 67)}...` : firstLine;
  }

  if (input.anchorLabel?.trim()) {
    return input.anchorLabel.trim();
  }

  switch (input.anchorType) {
    case "opening":
      return input.opening ? `Opening note: ${input.opening}` : "Opening note";
    case "leak":
      return input.leakKey ? `Leak note: ${input.leakKey}` : "Leak note";
    case "coach-flow":
      return input.focusArea ? `Coach note: ${input.focusArea}` : "Coach note";
    case "move":
      return "Move note";
    case "position":
      return "Position note";
    case "training-card":
      return "Training note";
    case "game":
      return "Game note";
    default:
      return "Note";
  }
}

export function buildNoteHref(note: Pick<NoteRecord, "anchorType" | "sourcePath" | "gameId" | "ply" | "leakKey">) {
  switch (note.anchorType) {
    case "game":
      return note.gameId ? `/games/${note.gameId}` : note.sourcePath || "/notes";
    case "move":
    case "position":
      return note.gameId && typeof note.ply === "number"
        ? `/games/${note.gameId}?ply=${note.ply}#replay`
        : note.gameId
          ? `/games/${note.gameId}`
          : note.sourcePath || "/notes";
    case "leak":
      return note.leakKey ? `/leaks/${note.leakKey}` : note.sourcePath || "/notes";
    case "coach-flow":
      return "/coach-lab";
    case "training-card":
      return "/training";
    default:
      return note.sourcePath || "/notes";
  }
}

export function buildNoteExcerpt(body: string, maxLength = 180) {
  const compact = body.trim().replace(/\s+/g, " ");
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function scoreNoteForGameContext(
  note: Pick<NoteRecord, "gameId" | "ply" | "opening" | "leakKey" | "focusArea">,
  input: {
    gameId: string;
    focusPly?: number;
    opening?: string | null;
    leakKeys?: string[];
  }
) {
  let score = 0;

  if (note.gameId === input.gameId) {
    score += 8;
  }

  if (typeof input.focusPly === "number" && note.gameId === input.gameId && note.ply === input.focusPly) {
    score += 10;
  }

  if (input.opening && note.opening && note.opening.toLowerCase() === input.opening.toLowerCase()) {
    score += 4;
  }

  if (note.leakKey && input.leakKeys?.includes(note.leakKey)) {
    score += 3;
  }

  return score;
}

export function scoreNoteForCoachLabContext(
  note: Pick<NoteRecord, "focusArea" | "leakKey" | "opening">,
  input: {
    focusArea?: string | null;
    leakKeys?: string[];
    openings?: string[];
  }
) {
  let score = 0;

  if (input.focusArea && note.focusArea && note.focusArea.toLowerCase() === input.focusArea.toLowerCase()) {
    score += 8;
  }

  if (note.leakKey && input.leakKeys?.includes(note.leakKey)) {
    score += 4;
  }

  if (note.opening && input.openings?.some((opening) => opening.toLowerCase() === note.opening?.toLowerCase())) {
    score += 2;
  }

  return score;
}
