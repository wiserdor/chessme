import { upsertProfile } from "@/lib/services/repository";
import { validateChessComUsername } from "@/lib/services/chesscom";

export async function connectProfile(username: string) {
  const normalized = username.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Username is required");
  }

  const valid = await validateChessComUsername(normalized);
  if (!valid) {
    throw new Error("Chess.com username was not found");
  }

  await upsertProfile(normalized, "mock", "deterministic-coach");

  return {
    username: normalized,
    provider: "mock",
    model: "deterministic-coach"
  };
}
