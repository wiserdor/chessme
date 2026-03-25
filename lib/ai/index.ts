import { MockProvider } from "@/lib/ai/mock-provider";
import { OpenAIProvider } from "@/lib/ai/openai-provider";
import { LLMProvider } from "@/lib/ai/provider";
import { ProviderName } from "@/lib/types";

export type AISettingsInput = {
  provider: ProviderName;
  model: string;
  apiKey?: string | null;
};

export const PROVIDER_MODELS = {
  openai: [
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5-chat-latest",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o4-mini"
  ],
  mock: ["deterministic-coach"]
} as const;

export function createProvider(settings: AISettingsInput): LLMProvider {
  if (settings.provider === "openai" && settings.apiKey) {
    return new OpenAIProvider(settings.model || "gpt-4.1-mini", settings.apiKey);
  }

  return new MockProvider();
}
