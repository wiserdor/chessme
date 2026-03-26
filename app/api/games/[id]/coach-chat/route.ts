import { NextResponse } from "next/server";
import { z } from "zod";

import { answerGameCoachQuestion } from "@/lib/services/ai-enrichment";

export const runtime = "nodejs";

const bodySchema = z.object({
  question: z.string().trim().min(1),
  focusPly: z.number().int().positive().optional(),
  history: z
    .array(
      z.object({
        role: z.union([z.literal("user"), z.literal("coach")]),
        content: z.string(),
        focusPly: z.number().int().positive().nullable().optional()
      })
    )
    .optional(),
  notes: z
    .array(
      z.object({
        title: z.string(),
        excerpt: z.string(),
        anchorLabel: z.string(),
        tags: z.array(z.string())
      })
    )
    .optional(),
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
    const result = await answerGameCoachQuestion(params.id, body.question, body.focusPly, {
      history: body.history,
      notes: body.notes,
      settings: body.settings
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
