import { NextResponse } from "next/server";

import { importPgnBundle } from "@/lib/services/import-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let pgnText = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const text = formData.get("text");

      if (typeof text === "string" && text.trim()) {
        pgnText = text;
      } else if (file instanceof File) {
        pgnText = await file.text();
      }
    } else {
      const body = (await request.json()) as { text?: string };
      pgnText = body.text ?? "";
    }

    if (!pgnText.trim()) {
      throw new Error("PGN text is required");
    }

    const result = await importPgnBundle(pgnText);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
