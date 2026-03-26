import { NextResponse } from "next/server";
import { z } from "zod";

import { analyzeGameWithAI } from "@/lib/services/ai-enrichment";

export const runtime = "nodejs";

const bodySchema = z.object({
  force: z.boolean().optional(),
  settings: z
    .object({
      provider: z.enum(["openai", "mock"]),
      model: z.string().min(1),
      apiKey: z.string().optional()
    })
    .optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const result = await analyzeGameWithAI(params.id, { force: body.force }, body.settings);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
