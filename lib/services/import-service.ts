import { db } from "@/lib/db";
import { gameImports } from "@/lib/db/schema";
import { fetchChessComGames } from "@/lib/services/chesscom";
import { parseImportedGames } from "@/lib/services/pgn";
import { upsertImportedGames } from "@/lib/services/repository";
import { createId } from "@/lib/utils/id";
import { nowTs } from "@/lib/utils/time";

export async function importFromChessCom(username: string, options?: { from?: string; to?: string }) {
  const games = await fetchChessComGames(username, options);
  await upsertImportedGames(games);

  await db.insert(gameImports).values({
    id: createId("import"),
    source: "chesscom",
    sourceId: username,
    status: "success",
    metadataJson: JSON.stringify({
      importedGames: games.length,
      from: options?.from,
      to: options?.to
    }),
    createdAt: nowTs()
  });

  return {
    imported: games.length
  };
}

export async function importPgnBundle(input: string) {
  const games = parseImportedGames(input, "pgn");
  await upsertImportedGames(games);

  await db.insert(gameImports).values({
    id: createId("import"),
    source: "pgn",
    sourceId: "manual-upload",
    status: "success",
    metadataJson: JSON.stringify({
      importedGames: games.length
    }),
    createdAt: nowTs()
  });

  return {
    imported: games.length
  };
}
