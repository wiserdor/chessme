import { NextResponse } from "next/server";
import { z } from "zod";

import { enqueueAnalysisJob } from "@/lib/services/analysis-queue";

const bodySchema = z.object({
  gameIds: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(50).optional(),
  reanalyze: z.boolean().optional()
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const job = await enqueueAnalysisJob(body);
    return NextResponse.json({
      ok: true,
      jobId: job.jobId,
      status: job.status,
      totalGames: job.totalGames,
      processedGames: job.processedGames,
      created: job.created,
      message: job.message
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
