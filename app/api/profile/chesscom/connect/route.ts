import { NextResponse } from "next/server";
import { z } from "zod";

import { connectProfile } from "@/lib/services/profile-service";

const bodySchema = z.object({
  username: z.string().min(1)
});

export const runtime = "nodejs";
const ACTIVE_PROFILE_COOKIE = "chessme-active-profile";

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const profile = await connectProfile(body.username);
    const response = NextResponse.json({ ok: true, profile });
    response.cookies.set(ACTIVE_PROFILE_COOKIE, profile.username, {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/"
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
