import { NextResponse } from "next/server";

import { analyzeRecentGamesPortfolio } from "@/lib/services/ai-enrichment";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await analyzeRecentGamesPortfolio(30);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
