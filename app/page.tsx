import { DashboardActions } from "@/components/dashboard-actions";
import { DashboardOverview } from "@/components/dashboard-overview";
import { RecentGames } from "@/components/recent-games";
import { WeaknessList } from "@/components/weakness-list";
import { loadDashboard } from "@/lib/services/dashboard-service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await loadDashboard();

  return (
    <main className="space-y-6">
      <DashboardOverview snapshot={snapshot} />
      <DashboardActions defaultUsername={snapshot.profile?.username} initialAnalysisJob={snapshot.activeAnalysisJob} />
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <WeaknessList snapshot={snapshot} />
        <RecentGames snapshot={snapshot} />
      </div>
    </main>
  );
}
