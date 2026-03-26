import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Server data reset is disabled. Only local device data can be cleared from Settings."
    },
    { status: 403 }
  );
}
