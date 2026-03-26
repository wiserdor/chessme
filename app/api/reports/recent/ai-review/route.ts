import { NextResponse } from "next/server";
import { z } from "zod";

import { analyzeRecentGamesPortfolio } from "@/lib/services/ai-enrichment";

export const runtime = "nodejs";

const bodySchema = z.object({
  settings: z
    .object({
      provider: z.enum(["openai", "mock"]),
      model: z.string().min(1),
      apiKey: z.string().optional()
    })
    .optional()
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const result = await analyzeRecentGamesPortfolio(30, body.settings);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
