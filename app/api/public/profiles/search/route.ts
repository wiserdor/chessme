import { NextResponse } from "next/server";

import { validateChessComUsername } from "@/lib/services/chesscom";
import { searchPublicProfiles } from "@/lib/services/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
    if (!q) {
      return NextResponse.json({ ok: true, profiles: [] });
    }

    const [knownProfiles, exactMatch] = await Promise.all([
      searchPublicProfiles(q, 8),
      validateChessComUsername(q).catch(() => false)
    ]);

    const seen = new Set<string>();
    const profiles = [];

    if (exactMatch) {
      profiles.push({
        username: q,
        updatedAt: Date.now(),
        source: "chesscom" as const
      });
      seen.add(q);
    }

    for (const profile of knownProfiles) {
      if (seen.has(profile.username)) {
        continue;
      }
      profiles.push({
        ...profile,
        source: "known" as const
      });
      seen.add(profile.username);
    }

    return NextResponse.json({ ok: true, profiles });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
