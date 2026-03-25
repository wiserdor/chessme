import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteNote, updateNote } from "@/lib/services/repository";

export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().trim().optional(),
  body: z.string().trim().min(1),
  manualTags: z.array(z.string()).optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const body = patchSchema.parse(await request.json().catch(() => ({})));
    const note = await updateNote(params.id, body);
    return NextResponse.json({ ok: true, note });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    await deleteNote(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
