import { ImportedGame } from "@/lib/types";
import { extractPgnHeaders } from "@/lib/services/pgn";

const API_BASE = "https://api.chess.com/pub";

function normalizeValue(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "?" || trimmed === "*") {
    return undefined;
  }

  return trimmed;
}

function openingFromEcoUrl(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const pathname = new URL(value).pathname;
    const slug = pathname.split("/").filter(Boolean).pop();
    if (!slug) {
      return undefined;
    }

    return decodeURIComponent(slug).replace(/-/g, " ");
  } catch {
    return undefined;
  }
}

export async function validateChessComUsername(username: string): Promise<boolean> {
  const response = await fetch(`${API_BASE}/player/${encodeURIComponent(username)}`, {
    headers: {
      "User-Agent": "ChessMe/0.1"
    },
    cache: "no-store"
  });

  return response.ok;
}

export async function fetchChessComArchives(username: string): Promise<string[]> {
  const response = await fetch(`${API_BASE}/player/${encodeURIComponent(username)}/games/archives`, {
    headers: {
      "User-Agent": "ChessMe/0.1"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Chess.com archives fetch failed with ${response.status}`);
  }

  const payload = (await response.json()) as { archives?: string[] };
  return payload.archives ?? [];
}

export async function fetchChessComGames(
  username: string,
  options?: { from?: string; to?: string }
): Promise<ImportedGame[]> {
  const archives = await fetchChessComArchives(username);
  const filteredArchives = archives.filter((archive) => {
    const archiveKey = archive.split("/").slice(-2).join("/");
    if (options?.from && archiveKey < options.from) {
      return false;
    }

    if (options?.to && archiveKey > options.to) {
      return false;
    }

    return true;
  });

  const games: ImportedGame[] = [];

  for (const archive of filteredArchives) {
    const response = await fetch(archive, {
      headers: {
        "User-Agent": "ChessMe/0.1"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      if (response.status === 404) {
        continue;
      }

      throw new Error(`Chess.com monthly archive fetch failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      games?: Array<Record<string, unknown>>;
    };

    for (const game of payload.games ?? []) {
      const white = (game.white as { username?: string; result?: string }) ?? {};
      const black = (game.black as { username?: string; result?: string }) ?? {};
      const pgn = typeof game.pgn === "string" ? game.pgn : "";
      if (!pgn) {
        continue;
      }
      const headers = extractPgnHeaders(pgn);
      const apiOpening = normalizeValue(typeof game.opening === "string" ? game.opening : undefined);
      const apiEco = normalizeValue(typeof game.eco === "string" ? game.eco : undefined);
      const headerOpening = normalizeValue(headers.Opening);
      const ecoUrl = normalizeValue(headers.ECOUrl) || apiEco;
      const fallbackOpening = openingFromEcoUrl(ecoUrl);
      const opening = apiOpening || headerOpening || fallbackOpening;

      games.push({
        externalId: String(game.url ?? game.uuid ?? `${archive}:${games.length}`),
        source: "chesscom",
        sourceUrl: typeof game.url === "string" ? game.url : undefined,
        pgn,
        whitePlayer: white.username ?? "White",
        blackPlayer: black.username ?? "Black",
        result: [white.result, black.result].filter(Boolean).join(" / ") || "unknown",
        playedAt: typeof game.end_time === "number" ? new Date(game.end_time * 1000).toISOString() : undefined,
        timeControl: typeof game.time_control === "string" ? game.time_control : undefined,
        opening,
        eco: normalizeValue(headers.ECO) || apiEco
      });
    }
  }

  return games;
}
