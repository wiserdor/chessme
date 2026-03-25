import { NextResponse } from "next/server";
import { z } from "zod";

import { answerGameCoachQuestion } from "@/lib/services/ai-enrichment";

export const runtime = "nodejs";

const bodySchema = z.object({
  question: z.string().trim().min(1),
  focusPly: z.number().int().positive().optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const result = await answerGameCoachQuestion(params.id, body.question, body.focusPly);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
