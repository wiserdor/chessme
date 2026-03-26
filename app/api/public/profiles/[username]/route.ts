import { NextResponse } from "next/server";

import { fetchChessComPlayerProfile } from "@/lib/services/chesscom";
import { getDashboardSnapshot, getProfile } from "@/lib/services/repository";
import { connectProfile } from "@/lib/services/profile-service";

export const runtime = "nodejs";
const ACTIVE_PROFILE_COOKIE = "chessme-active-profile";

export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  try {
    const params = await context.params;
    const normalizedUsername = params.username.trim().toLowerCase();
    const [profile, snapshot, player] = await Promise.all([
      getProfile(normalizedUsername),
      getDashboardSnapshot(normalizedUsername),
      fetchChessComPlayerProfile(normalizedUsername)
    ]);
    return NextResponse.json({
      ok: true,
      profile: profile
        ? {
          username: profile.username,
          updatedAt: profile.updatedAt
        }
        : null,
      player,
      snapshot
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}

export async function POST(_request: Request, context: { params: Promise<{ username: string }> }) {
  try {
    const params = await context.params;
    const profile = await connectProfile(params.username);
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
