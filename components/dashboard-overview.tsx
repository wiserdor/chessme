import Link from "next/link";
import type { SVGProps } from "react";

import { CoachIcon, DashboardIcon, LeakIcon, TrainingIcon } from "@/components/app-icons";
import { DashboardSnapshot } from "@/lib/types";

export function DashboardOverview(props: { snapshot: DashboardSnapshot }) {
  const { snapshot } = props;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
      <section className="panel space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="badge">Personal Coach</span>
            <h1 className="mt-3 max-w-2xl font-display text-4xl leading-tight sm:text-5xl">
              Build a training loop from your own mistakes, not generic puzzles.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
              Every sync should feel like a training session: find the swing, understand the blindspot, and get one
              practical correction you can carry into the next game.
            </p>
          </div>
          {snapshot.profile ? (
            <div className="surface-card px-5 py-4">
              <p className="text-xs uppercase tracking-[0.18em] opacity-70">Active profile</p>
              <p className="mt-2 text-xl font-semibold">{snapshot.profile.username}</p>
              <p className="text-sm opacity-75">
                {snapshot.profile.provider} / {snapshot.profile.model}
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard accent="tone-neutral" icon={DashboardIcon} label="Imported games" value={snapshot.totals.games} />
          <StatCard accent="tone-info" icon={CoachIcon} label="Analyzed games" value={snapshot.totals.analyzedGames} />
          <StatCard accent="tone-warning" icon={TrainingIcon} label="Due drills" value={snapshot.totals.dueCards} />
          <StatCard accent="tone-neutral" icon={LeakIcon} label="Weakness clusters" value={snapshot.totals.weaknessCount} />
        </div>
      </section>

      <section className="panel space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="badge">Training</span>
            <h2 className="panel-title mt-3">Next move</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary text-sm" href="/coach-lab">
              Coach
            </Link>
            <Link className="btn-primary text-sm" href="/training">
              Open drills
            </Link>
          </div>
        </div>
        <p className="text-sm leading-6 text-muted">
          This app keeps the loop tight: import games, score mistakes, cluster recurring flaws, then schedule drills
          from the exact positions that hurt your rating.
        </p>
        <div className="surface-soft p-5 text-sm leading-6 text-muted-strong">
          Suggested habit: sync after every playing session, analyze the fresh batch, then clear at least three due
          drills before your next rated game.
        </div>
      </section>
    </div>
  );
}

function StatCard(props: {
  label: string;
  value: number;
  accent: string;
  icon: (props: SVGProps<SVGSVGElement>) => React.JSX.Element;
}) {
  const Icon = props.icon;
  return (
    <div className={`rounded-[24px] p-5 ${props.accent}`}>
      <div className="flex items-center gap-2 text-muted">
        <Icon className="h-4 w-4" />
        <p className="text-xs uppercase tracking-[0.18em]">{props.label}</p>
      </div>
      <p className="mt-3 font-display text-4xl">{props.value}</p>
    </div>
  );
}
