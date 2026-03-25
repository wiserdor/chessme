import Link from "next/link";

import { TrainingDrill } from "@/components/training-drill";
import { getNextTrainingCard } from "@/lib/services/training-service";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const card = await getNextTrainingCard();

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="badge">Practice</span>
          <h1 className="mt-3 font-display text-4xl">Daily drill queue</h1>
        </div>
        <Link className="btn-secondary text-sm" href="/">
          Back to dashboard
        </Link>
      </div>
      <TrainingDrill card={card} />
    </main>
  );
}
