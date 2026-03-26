import { NextResponse } from "next/server";
import { z } from "zod";

import { importFromChessCom } from "@/lib/services/import-service";

export const runtime = "nodejs";

const bodySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

export async function POST(request: Request, context: { params: Promise<{ username: string }> }) {
  try {
    const params = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const result = await importFromChessCom(params.username.trim().toLowerCase(), body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
