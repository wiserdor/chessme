import { NextResponse } from "next/server";

import { analyzeLeakWithAI } from "@/lib/services/ai-enrichment";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const params = await context.params;
    const result = await analyzeLeakWithAI(params.key);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
