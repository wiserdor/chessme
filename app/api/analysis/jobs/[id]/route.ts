import { NextResponse } from "next/server";

import { getAnalysisJobStatus } from "@/lib/services/analysis-queue";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const job = await getAnalysisJobStatus(params.id);

  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    job: {
      id: job.id,
      status: job.status,
      totalGames: job.totalGames,
      processedGames: job.processedGames,
      message: job.message,
      error: job.error
    }
  });
}
