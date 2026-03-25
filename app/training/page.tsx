import Link from "next/link";

import { TrainingDrill } from "@/components/training-drill";
import { getNextTrainingCard } from "@/lib/services/training-service";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const card = await getNextTrainingCard();

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="badge">Practice</span>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl">Daily drill queue</h1>
        </div>
        <Link className="btn-secondary w-full text-sm sm:w-auto" href="/">
          Back to dashboard
        </Link>
      </div>
      <TrainingDrill card={card} />
    </main>
  );
}
