import { NextResponse } from "next/server";

import { getGameDetail, setGameFavorite } from "@/lib/services/repository";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const detail = await getGameDetail(params.id);

  if (!detail) {
    return NextResponse.json({ ok: false, error: "Game not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { favorite?: boolean };
  const nextFavorite = typeof body.favorite === "boolean" ? body.favorite : !Boolean(detail.game.isFavorite);

  await setGameFavorite(params.id, nextFavorite);

  return NextResponse.json({ ok: true, favorite: nextFavorite });
}
