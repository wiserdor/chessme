import { getDashboardSnapshot } from "@/lib/services/repository";

export async function loadDashboard() {
  return getDashboardSnapshot();
}
