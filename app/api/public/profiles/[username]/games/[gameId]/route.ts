import { NextResponse } from "next/server";

import { getGameDetail } from "@/lib/services/repository";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ username: string; gameId: string }> }) {
  try {
    const params = await context.params;
    const detail = await getGameDetail(params.gameId, params.username.trim().toLowerCase());
    if (!detail) {
      return NextResponse.json({ ok: false, error: "Game not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, detail });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
