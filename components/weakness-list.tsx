import Link from "next/link";

import { LeakIcon, TrainingIcon } from "@/components/app-icons";
import { DashboardSnapshot } from "@/lib/types";

export function WeaknessList(props: { snapshot: DashboardSnapshot }) {
  return (
    <section className="panel">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="badge inline-flex items-center gap-2">
            <LeakIcon className="h-3.5 w-3.5" />
            <span>Leaks</span>
          </span>
          <h2 className="panel-title mt-3">Recurring weaknesses</h2>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {props.snapshot.weaknesses.length ? (
          props.snapshot.weaknesses.map((weakness) => (
            <article key={weakness.id} className="surface-soft p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-2xl">{weakness.label}</h3>
                    <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Severity {weakness.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-strong">{weakness.suggestedFocus}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      className="btn-primary px-3 py-2 text-xs uppercase tracking-[0.12em]"
                      href={`/leaks/${weakness.key}`}
                    >
                      Open guide
                    </Link>
                    <Link
                      className="btn-secondary gap-2 px-3 py-2 text-xs uppercase tracking-[0.12em]"
                      href="/training"
                    >
                      <TrainingIcon className="h-3.5 w-3.5" />
                      Coach training
                    </Link>
                  </div>
                </div>
                <div className="text-right text-sm text-muted">
                  <p>{weakness.count} examples</p>
                </div>
              </div>
            </article>
          ))
        ) : (
          <EmptyCopy text="Run analysis after importing games to surface your first weakness clusters." />
        )}
      </div>
    </section>
  );
}

function EmptyCopy(props: { text: string }) {
  return <p className="surface-soft p-5 text-sm text-muted-strong">{props.text}</p>;
}
