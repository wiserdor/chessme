import { NextResponse } from "next/server";

import { queueLeakCoachSession } from "@/lib/services/repository";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: {
    params: Promise<{
      key: string;
    }>;
  }
) {
  try {
    const { key } = await context.params;
    const result = await queueLeakCoachSession(key, 3);

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
      {
        status: 400
      }
    );
  }
}
