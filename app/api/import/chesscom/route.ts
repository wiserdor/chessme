import { NextResponse } from "next/server";
import { z } from "zod";

import { importFromChessCom } from "@/lib/services/import-service";

const bodySchema = z.object({
  username: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional()
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const result = await importFromChessCom(body.username, {
      from: body.from,
      to: body.to
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
