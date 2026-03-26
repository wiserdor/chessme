import { DashboardActions } from "@/components/dashboard-actions";
import { DashboardOverview } from "@/components/dashboard-overview";
import { PrivateProfileBootstrap } from "@/components/private-profile-bootstrap";
import { FavoriteGames, RecentGames } from "@/components/recent-games";
import { WeaknessList } from "@/components/weakness-list";
import { loadDashboard } from "@/lib/services/dashboard-service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await loadDashboard();

  return (
    <main className="space-y-6">
      <PrivateProfileBootstrap username={snapshot.profile?.username} />
      <DashboardOverview snapshot={snapshot} />
      <DashboardActions activeUsername={snapshot.profile?.username} initialAnalysisJob={snapshot.activeAnalysisJob} />
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <WeaknessList snapshot={snapshot} />
        <div className="space-y-6">
          <FavoriteGames snapshot={snapshot} />
          <RecentGames snapshot={snapshot} />
        </div>
      </div>
    </main>
  );
}
