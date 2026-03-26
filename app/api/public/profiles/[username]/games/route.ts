import { NextResponse } from "next/server";

import { getGameHistory } from "@/lib/services/repository";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  try {
    const params = await context.params;
    const { searchParams } = new URL(request.url);
    const minSwing = searchParams.get("minSwing") ? Number.parseInt(searchParams.get("minSwing") || "", 10) : undefined;
    const limit = searchParams.get("limit") ? Number.parseInt(searchParams.get("limit") || "", 10) : undefined;
    const history = await getGameHistory({
      profileUsername: params.username.trim().toLowerCase(),
      query: searchParams.get("q") ?? undefined,
      opening: searchParams.get("opening") ?? undefined,
      leakKey: searchParams.get("leak") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      result: searchParams.get("result") ?? undefined,
      minSwing: Number.isFinite(minSwing) ? minSwing : undefined,
      limit: Number.isFinite(limit) ? limit : undefined
    });
    return NextResponse.json({ ok: true, history });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
