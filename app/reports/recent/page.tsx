import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RecentReportPage() {
  redirect("/coach-lab#style-report");
}
