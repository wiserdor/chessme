import { NextResponse } from "next/server";
import { z } from "zod";

import { submitTrainingAnswer } from "@/lib/services/training-service";

const bodySchema = z.object({
  cardId: z.string().min(1),
  move: z.string().min(1),
  confidence: z.number().int().min(1).max(5).optional()
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const result = await submitTrainingAnswer(body.cardId, body.move, body.confidence);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
