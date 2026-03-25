import { NextResponse } from "next/server";

import { searchNotes } from "@/lib/services/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsedLimit = searchParams.get("limit") ? Number.parseInt(searchParams.get("limit") || "", 10) : undefined;
    const notes = await searchNotes({
      q: searchParams.get("q") ?? undefined,
      anchorType: searchParams.get("anchorType") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
      opening: searchParams.get("opening") ?? undefined,
      leakKey: searchParams.get("leakKey") ?? undefined,
      gameId: searchParams.get("gameId") ?? undefined,
      ply: searchParams.get("ply") ? Number.parseInt(searchParams.get("ply") || "", 10) : undefined,
      trainingCardId: searchParams.get("trainingCardId") ?? undefined,
      focusArea: searchParams.get("focusArea") ?? undefined,
      hasFen: searchParams.get("hasFen") ?? undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined
    });

    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
