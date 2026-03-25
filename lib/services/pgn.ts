import { Chess } from "chess.js";

import { ImportedGame, PositionSnapshot } from "@/lib/types";
import { fingerprint } from "@/lib/utils/id";

export function extractPgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const matches = pgn.matchAll(/\[(\w+)\s+"([^"]*)"\]/g);
  for (const match of matches) {
    headers[match[1]] = match[2];
  }

  return headers;
}

function normalizeHeaderValue(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "?" || trimmed === "*") {
    return undefined;
  }

  return trimmed;
}

export function splitPgnBundle(input: string): string[] {
  return input
    .split(/(?=\[Event\s+")/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

export function parseImportedGames(input: string, source: "pgn" | "chesscom"): ImportedGame[] {
  const parsedGames: ImportedGame[] = [];

  for (const pgn of splitPgnBundle(input)) {
    const headers = extractPgnHeaders(pgn);
    const chess = new Chess();
    try {
      chess.loadPgn(pgn);
    } catch {
      continue;
    }

    parsedGames.push({
      externalId: headers.Site || fingerprint(pgn),
      source,
      sourceUrl: headers.Site,
      pgn,
      whitePlayer: headers.White || "White",
      blackPlayer: headers.Black || "Black",
      result: headers.Result || "*",
      playedAt: headers.UTCDate ? `${headers.UTCDate}T00:00:00.000Z` : undefined,
      timeControl: normalizeHeaderValue(headers.TimeControl),
      opening: normalizeHeaderValue(headers.Opening),
      eco: normalizeHeaderValue(headers.ECO)
    });
  }

  return parsedGames;
}

export function extractPositions(pgn: string): PositionSnapshot[] {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  const playback = new Chess();

  return history.map((move, index) => {
    const fenBefore = playback.fen();
    playback.move(move);
    const fenAfter = playback.fen();
    const tags: string[] = [];

    if (move.flags.includes("c")) {
      tags.push("capture");
    }

    if (move.san.includes("+")) {
      tags.push("check");
    }

    if (index < 14) {
      tags.push("opening");
    } else if (index >= history.length - 12) {
      tags.push("endgame");
    } else {
      tags.push("middlegame");
    }

    return {
      ply: index + 1,
      san: move.san,
      fenBefore,
      fenAfter,
      moveBy: move.color === "w" ? "white" : "black",
      tags
    };
  });
}
