import { NextResponse } from "next/server";
import { z } from "zod";

import { createNote } from "@/lib/services/repository";

const bodySchema = z.object({
  title: z.string().trim().optional(),
  body: z.string().trim().min(1),
  manualTags: z.array(z.string()).optional(),
  anchorType: z.enum(["general", "game", "move", "position", "opening", "leak", "coach-flow", "training-card"]),
  anchorLabel: z.string().trim().optional(),
  sourcePath: z.string().trim().min(1),
  gameId: z.string().trim().optional(),
  ply: z.number().int().positive().optional(),
  fen: z.string().trim().optional(),
  opening: z.string().trim().optional(),
  leakKey: z.string().trim().optional(),
  trainingCardId: z.string().trim().optional(),
  focusArea: z.string().trim().optional(),
  coachMessageContext: z.string().trim().optional()
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const note = await createNote(body);
    return NextResponse.json({ ok: true, note });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
