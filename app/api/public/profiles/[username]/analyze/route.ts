import { NextResponse } from "next/server";
import { z } from "zod";

import { enqueueAnalysisJob } from "@/lib/services/analysis-queue";

export const runtime = "nodejs";

const bodySchema = z.object({
  gameIds: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(50).optional(),
  reanalyze: z.boolean().optional()
});

export async function POST(request: Request, context: { params: Promise<{ username: string }> }) {
  try {
    const params = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const job = await enqueueAnalysisJob({
      profileUsername: params.username.trim().toLowerCase(),
      gameIds: body.gameIds,
      limit: body.limit,
      reanalyze: body.reanalyze
    });
    return NextResponse.json({ ok: true, ...job });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
