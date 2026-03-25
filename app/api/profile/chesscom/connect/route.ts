import { NextResponse } from "next/server";
import { z } from "zod";

import { connectProfile } from "@/lib/services/profile-service";

const bodySchema = z.object({
  username: z.string().min(1)
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const profile = await connectProfile(body.username);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
