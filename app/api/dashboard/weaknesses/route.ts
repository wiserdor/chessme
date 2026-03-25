import { NextResponse } from "next/server";

import { loadDashboard } from "@/lib/services/dashboard-service";

export const runtime = "nodejs";

export async function GET() {
  const dashboard = await loadDashboard();
  return NextResponse.json(dashboard);
}
