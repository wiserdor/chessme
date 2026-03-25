import { getAISettings, upsertProfile } from "@/lib/services/repository";
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

  const aiSettings = await getAISettings();
  await upsertProfile(normalized, aiSettings.provider, aiSettings.model);

  return {
    username: normalized,
    provider: aiSettings.provider,
    model: aiSettings.model
  };
}
