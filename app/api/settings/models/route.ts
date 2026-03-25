import { NextResponse } from "next/server";
import { z } from "zod";

import { PROVIDER_MODELS } from "@/lib/ai";
import { getAISettings, upsertAISettings } from "@/lib/services/repository";

export const runtime = "nodejs";

export async function GET() {
  const settings = await getAISettings();

  return NextResponse.json({
    ok: true,
    selected: {
      provider: settings.provider,
      model: settings.model,
      hasApiKey: settings.hasApiKey,
      quotaCooldownUntil: settings.quotaCooldownUntil,
      lastError: settings.lastError
    },
    providers: Object.entries(PROVIDER_MODELS).map(([name, models]) => ({
      name,
      models
    }))
  });
}

const bodySchema = z.object({
  provider: z.enum(["openai", "mock"]),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  clearApiKey: z.boolean().optional()
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const result = await upsertAISettings({
      provider: body.provider,
      model: body.model,
      apiKey: body.apiKey,
      clearApiKey: body.clearApiKey
    });

    return NextResponse.json({
      ok: true,
      selected: result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
