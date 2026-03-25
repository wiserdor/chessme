import Link from "next/link";
import { notFound } from "next/navigation";

import { LeakAIExplainAction } from "@/components/leak-ai-explain-action";
import { LeakSessionAction } from "@/components/leak-session-action";
import { explainLeakExamples } from "@/lib/services/leak-explanations";
import { getLeakPlaybook } from "@/lib/services/leak-playbook";
import { getWeaknessDetail } from "@/lib/services/repository";

export const dynamic = "force-dynamic";

function formatDueAt(value: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No due date";
  }

  return date.toLocaleDateString();
}

export default async function LeakDetailPage(props: { params: Promise<{ key: string }> }) {
  const params = await props.params;
  const detail = await getWeaknessDetail(params.key);
  if (!detail) {
    notFound();
  }

  const playbook = getLeakPlaybook(detail.weakness.key, detail.weakness.label);
  const explainedExamples = await explainLeakExamples(detail.weakness.label, detail.weakness.key, detail.weakness.examples);
  const aiExplainedCount = explainedExamples.filter((example) => example.source === "ai").length;
  const practicalChecklist = [...playbook.bestPractices, ...playbook.trainingFocus].slice(0, 6);

  return (
    <main className="space-y-6">
      <section className="panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="badge">Leak Guide</span>
            <h1 className="mt-3 font-display text-4xl">{playbook.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{detail.weakness.suggestedFocus}</p>
          </div>
          <div className="space-y-2 text-sm text-muted">
            <p>Severity {detail.weakness.severity}</p>
            <p>{detail.weakness.count} recurring examples</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <LeakSessionAction leakKey={detail.weakness.key} />
          <LeakAIExplainAction leakKey={detail.weakness.key} hasAIExamples={aiExplainedCount > 0} />
          <Link className="btn-secondary text-sm" href="/training">
            Open training queue
          </Link>
          <Link className="btn-secondary text-sm" href="/">
            Back to dashboard
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="panel">
          <span className="badge">Fix This Leak</span>
          <h2 className="panel-title mt-3">What to do differently next time</h2>
          <div className="mt-4 space-y-4">
            <div className="tone-info p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Do more of this</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-strong">
                {playbook.dos.slice(0, 4).map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
            <div className="tone-danger p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Stop doing this</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-strong">
                {playbook.donts.slice(0, 4).map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
            <div className="tone-neutral p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Coach checklist</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-strong">
                {practicalChecklist.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>

        <article className="panel">
          <span className="badge">Train Now</span>
          <h2 className="panel-title mt-3">Related drills</h2>
          {detail.relatedCards.length ? (
            <div className="mt-4 space-y-3">
              {detail.relatedCards.map((card) => (
                <div key={card.id} className="surface-soft rounded-[20px] p-4">
                  <p className="font-semibold">{card.title}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted">
                    Difficulty {card.difficulty} • Due {formatDueAt(card.dueAt)}
                  </p>
                  <p className="mt-2 text-sm text-muted-strong">{card.hint}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 surface-soft rounded-[20px] p-4 text-sm text-muted-strong">
              No related cards yet. Run analysis to generate drills for this leak.
            </p>
          )}
          <p className="mt-5 text-sm leading-6 text-muted">
            Best immediate use: start a short coach session, solve a few related positions, then return to one of the
            examples below and ask what thought process would have prevented it.
          </p>
          <Link className="btn-accent mt-5 text-sm" href="/training">
            Start training now
          </Link>
        </article>
      </section>

      <section className="panel">
        <span className="badge">Examples</span>
        <h2 className="panel-title mt-3">Where this leak appears in your games</h2>
        <p className="mt-2 text-sm text-muted">
          {aiExplainedCount} of {explainedExamples.length} examples currently have AI explanations.
        </p>
        {explainedExamples.length ? (
          <div className="scroll-panel mt-4 max-h-[32rem] overflow-y-auto rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel-soft)] p-3 pr-2">
            <ul className="space-y-3 text-sm text-muted-strong">
              {explainedExamples.map((example) => (
                <li key={`${example.gameId}-${example.ply ?? "n"}`} className="surface-card rounded-[18px] p-4">
                  {example.href ? (
                    <Link className="font-semibold underline-offset-2 hover:underline" href={example.href}>
                      {example.text}
                    </Link>
                  ) : (
                    <p className="font-semibold">{example.text}</p>
                  )}
                  <p className="mt-2 text-sm leading-6">
                    <span className="font-semibold">
                      {example.source === "ai" ? "AI explanation:" : "Engine fallback:"}
                    </span>{" "}
                    {example.explanation}
                  </p>
                  <p className="mt-1 text-sm leading-6">
                    <span className="font-semibold">Why this is a leak:</span> {example.whyLeak}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-strong">No examples stored yet for this leak.</p>
        )}
      </section>
    </main>
  );
}
