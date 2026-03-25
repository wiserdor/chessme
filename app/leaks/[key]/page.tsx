import Link from "next/link";
import { notFound } from "next/navigation";

import { LeakAIExplainAction } from "@/components/leak-ai-explain-action";
import { LeakSessionAction } from "@/components/leak-session-action";
import { explainLeakExamples } from "@/lib/services/leak-explanations";
import { getLeakPlaybook } from "@/lib/services/leak-playbook";
import { getWeaknessDetail } from "@/lib/services/repository";
import { buildTacticalOversightsModel } from "@/lib/services/tactical-oversights";

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
  const tacticalModel =
    detail.weakness.key === "tactical-oversights"
      ? await buildTacticalOversightsModel(explainedExamples)
      : null;

  return (
    <main className="space-y-6">
      <section className="panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="badge">Leak Guide</span>
            <h1 className="mt-3 font-display text-4xl">{playbook.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{detail.weakness.suggestedFocus}</p>
          </div>
          <div className="w-full space-y-2 text-left text-sm text-muted sm:w-auto sm:text-right">
            <p>Severity {detail.weakness.severity}</p>
            <p>{detail.weakness.count} recurring examples</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <LeakSessionAction leakKey={detail.weakness.key} />
          <LeakAIExplainAction leakKey={detail.weakness.key} hasAIExamples={aiExplainedCount > 0} />
          <Link className="btn-secondary w-full text-sm sm:w-auto" href="/training">
            Open training queue
          </Link>
          <Link className="btn-secondary w-full text-sm sm:w-auto" href="/">
            Back to dashboard
          </Link>
        </div>
      </section>

      {tacticalModel ? (
        <>
          <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <article className="surface-contrast p-6">
              <p className="text-xs uppercase tracking-[0.16em] opacity-70">AI coach read</p>
              <h2 className="mt-3 font-display text-3xl">What tactical mistakes define you</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 opacity-90">{tacticalModel.diagnosis}</p>
              <ul className="mt-5 space-y-2 text-sm leading-6 opacity-90">
                {tacticalModel.coachRead.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] opacity-70">Average swing</p>
                  <p className="mt-2 font-display text-3xl">{tacticalModel.summaryStats.averageSwing}cp</p>
                </div>
                <div className="rounded-[18px] bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] opacity-70">AI-backed examples</p>
                  <p className="mt-2 font-display text-3xl">{tacticalModel.summaryStats.aiBackedCount}</p>
                </div>
                <div className="rounded-[18px] bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] opacity-70">Biggest phase</p>
                  <p className="mt-2 text-lg font-semibold">
                    {tacticalModel.summaryStats.middlegameShare >= tacticalModel.summaryStats.openingShare &&
                    tacticalModel.summaryStats.middlegameShare >= tacticalModel.summaryStats.endgameShare
                      ? "Middlegame"
                      : tacticalModel.summaryStats.openingShare >= tacticalModel.summaryStats.endgameShare
                        ? "Opening"
                        : "Endgame"}
                  </p>
                </div>
              </div>
            </article>

            <article className="panel">
              <span className="badge">Improvement</span>
              <h2 className="panel-title mt-3">Are you improving?</h2>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                    tacticalModel.trend.direction === "up"
                      ? "bg-emerald-500/12 text-[color:var(--success-text)]"
                      : tacticalModel.trend.direction === "down"
                        ? "bg-rose-500/12 text-[color:var(--error-text)]"
                        : "bg-slate-500/12 text-muted-strong"
                  }`}
                >
                  {tacticalModel.trend.direction === "up"
                    ? "Improving"
                    : tacticalModel.trend.direction === "down"
                      ? "Needs correction"
                      : "Mostly flat"}
                </span>
                <p className="text-sm text-muted">{tacticalModel.trend.summary}</p>
              </div>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-strong">
                {tacticalModel.trend.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </section>

          <section className="panel">
            <span className="badge">Pattern Map</span>
            <h2 className="panel-title mt-3">What kind of tactics you keep missing</h2>
            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {tacticalModel.motifs.map((motif) => (
                <article key={motif.key} className="tone-neutral p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-2xl">{motif.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-strong">{motif.blindspot}</p>
                    </div>
                    <div className="text-sm text-muted sm:text-right">
                      <p>{motif.count} examples</p>
                      <p>{motif.averageSwing}cp avg swing</p>
                    </div>
                  </div>
                  <p className="mt-4 rounded-[18px] bg-white/60 px-4 py-3 text-sm text-muted-strong">
                    Trigger: {motif.trigger}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-muted-strong">
                    <span className="font-semibold">Correction rule:</span> {motif.rule}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <span className="badge">Spot It Now</span>
            <h2 className="panel-title mt-3">Mini tactical prompts from your own mistakes</h2>
            <div className="mt-6 grid gap-4 xl:grid-cols-3">
              {tacticalModel.quickDrills.map((drill) => (
                <article key={drill.title} className="surface-card p-5">
                  <h3 className="font-display text-2xl">{drill.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-strong">{drill.prompt}</p>
                  <p className="mt-3 rounded-[18px] bg-[color:var(--panel-soft)] px-4 py-3 text-sm text-muted-strong">
                    {drill.rule}
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {drill.reviewHref ? (
                      <Link className="btn-secondary w-full text-sm sm:w-auto" href={drill.reviewHref}>
                        Review position
                      </Link>
                    ) : null}
                    {drill.coachHref ? (
                      <Link className="btn-primary w-full text-sm sm:w-auto" href={drill.coachHref}>
                        Ask coach
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

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
          <Link className="btn-accent mt-5 w-full text-sm sm:w-auto" href="/training">
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
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      {example.href ? (
                        <Link className="font-semibold underline-offset-2 hover:underline" href={example.href}>
                          {example.text}
                        </Link>
                      ) : (
                        <p className="font-semibold">{example.text}</p>
                      )}
                      {tacticalModel ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                            {tacticalModel.examples.find((item) => item.gameId === example.gameId && item.ply === example.ply)?.motifTitle}
                          </span>
                          <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-strong">
                            {tacticalModel.examples.find((item) => item.gameId === example.gameId && item.ply === example.ply)?.trigger}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      {example.href ? (
                        <Link className="btn-secondary w-full text-xs sm:w-auto" href={example.href}>
                          Open in game
                        </Link>
                      ) : null}
                      {example.href ? (
                        <Link className="btn-primary w-full text-xs sm:w-auto" href={`${example.href}#review-coach`}>
                          Ask coach
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-6">
                    <span className="font-semibold">
                      {example.source === "ai" ? "AI explanation:" : "Engine fallback:"}
                    </span>{" "}
                    {example.explanation}
                  </p>
                  <p className="mt-1 text-sm leading-6">
                    <span className="font-semibold">Why this is a leak:</span> {example.whyLeak}
                  </p>
                  {tacticalModel ? (
                    <p className="mt-2 text-sm leading-6 text-muted-strong">
                      <span className="font-semibold">Rule to remember:</span>{" "}
                      {
                        tacticalModel.examples.find((item) => item.gameId === example.gameId && item.ply === example.ply)
                          ?.rule
                      }
                    </p>
                  ) : null}
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
