import { NextResponse } from "next/server";
import { z } from "zod";

import { clearAppData } from "@/lib/services/repository";

export const runtime = "nodejs";

const bodySchema = z.object({
  includeSettings: z.boolean().optional()
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const result = await clearAppData({
      includeSettings: body.includeSettings
    });

    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 400 }
    );
  }
}
