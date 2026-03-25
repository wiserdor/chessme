import { NextResponse } from "next/server";

import { getNextTrainingCard } from "@/lib/services/training-service";

export const runtime = "nodejs";

export async function GET() {
  const card = await getNextTrainingCard();
  return NextResponse.json({ ok: true, card });
}
