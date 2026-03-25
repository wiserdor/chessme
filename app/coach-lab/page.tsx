import Link from "next/link";

import { RecentReportAction } from "@/components/recent-report-action";
import { getRecentGamesPortfolioReport } from "@/lib/services/ai-enrichment";
import { loadCoachLab } from "@/lib/services/coach-lab";
import { getRecentGamesForPortfolioReview } from "@/lib/services/repository";

export const dynamic = "force-dynamic";

function blindspotTone(index: number) {
  const tones = [
    "tone-danger",
    "tone-warning",
    "tone-info",
    "tone-neutral",
    "tone-neutral"
  ];

  return tones[index] ?? tones[tones.length - 1];
}

function reportTone(key: "style" | "strength" | "leak" | "priority") {
  switch (key) {
    case "style":
      return "tone-info";
    case "strength":
      return "tone-success";
    case "leak":
      return "tone-danger";
    case "priority":
      return "tone-warning";
  }
}

function scoreFromResult(result: string) {
  const normalized = result.toLowerCase();
  if (normalized === "win") {
    return 1;
  }
  if (normalized === "draw") {
    return 0.5;
  }
  return 0;
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function buildTrendSnapshot(sample: Awaited<ReturnType<typeof getRecentGamesForPortfolioReview>>) {
  if (sample.games.length < 6) {
    return null;
  }

  const recentSliceSize = Math.max(3, Math.ceil(sample.games.length / 2));
  const recentGames = sample.games.slice(0, recentSliceSize);
  const earlierGames = sample.games.slice(recentSliceSize);
  if (!earlierGames.length) {
    return null;
  }

  const recentAvgSwing = Math.round(average(recentGames.map((game) => game.biggestSwing)));
  const earlierAvgSwing = Math.round(average(earlierGames.map((game) => game.biggestSwing)));
  const recentScore = average(recentGames.map((game) => scoreFromResult(game.result)));
  const earlierScore = average(earlierGames.map((game) => scoreFromResult(game.result)));
  const recentStableRate = Math.round((recentGames.filter((game) => game.biggestSwing <= 150).length / recentGames.length) * 100);
  const earlierStableRate = Math.round((earlierGames.filter((game) => game.biggestSwing <= 150).length / earlierGames.length) * 100);

  const swingImprovedBy = earlierAvgSwing - recentAvgSwing;
  const scoreImprovedBy = recentScore - earlierScore;
  const stableImprovedBy = recentStableRate - earlierStableRate;

  const direction =
    swingImprovedBy >= 20 || scoreImprovedBy >= 0.15 || stableImprovedBy >= 10
      ? "up"
      : swingImprovedBy <= -20 || scoreImprovedBy <= -0.15 || stableImprovedBy <= -10
        ? "down"
        : "flat";

  return {
    direction,
    summary:
      direction === "up"
        ? "Your latest games are trending better than the earlier half of this sample."
        : direction === "down"
          ? "Your latest games are slipping compared with the earlier half of this sample."
          : "Your latest games are mostly flat compared with the earlier half of this sample.",
    bullets: [
      `Average biggest swing: ${earlierAvgSwing}cp earlier -> ${recentAvgSwing}cp recent`,
      `Score per game: ${earlierScore.toFixed(2)} earlier -> ${recentScore.toFixed(2)} recent`,
      `Stable games (150cp or less biggest swing): ${earlierStableRate}% earlier -> ${recentStableRate}% recent`
    ]
  };
}

function formatUpdatedAt(value: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString();
}

function StatCard(props: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-[22px] p-4 ${props.tone}`}>
      <p className="text-xs uppercase tracking-[0.12em] text-muted">{props.label}</p>
      <p className="mt-2 font-display text-3xl">{props.value}</p>
    </div>
  );
}

function ReportSection(props: { title: string; items: string[]; tone: string }) {
  return (
    <article className={`rounded-[24px] p-5 ${props.tone}`}>
      <h2 className="font-display text-2xl">{props.title}</h2>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-strong">
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

export default async function CoachLabPage() {
  const [snapshot, reportSample, trendSample, report] = await Promise.all([
    loadCoachLab(20),
    getRecentGamesForPortfolioReview(30),
    getRecentGamesForPortfolioReview(20),
    getRecentGamesPortfolioReport()
  ]);
  const trend = buildTrendSnapshot(trendSample);

  return (
    <main className="space-y-6">
      <section className="panel space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="badge">Coach</span>
            <h1 className="mt-3 max-w-3xl font-display text-4xl leading-tight">
              One coaching room for your recent mistakes, style trends, and next practical fix.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              This page keeps the loop tight: what hurt you most, what kind of player you are becoming, and what to
              train before the next session.
            </p>
          </div>
          <div className="space-y-3 text-right">
            <p className="text-sm text-muted">Recent analyzed sample: {snapshot.sampleSize} games</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Link className="btn-secondary text-sm" href="/training">
                Open training
              </Link>
              <Link className="btn-secondary text-sm" href="/games">
                Open all games
              </Link>
            </div>
          </div>
        </div>

        {snapshot.focusOfWeek ? (
          <div className="surface-contrast p-6">
            <p className="text-xs uppercase tracking-[0.16em] opacity-70">Focus of the week</p>
            <h2 className="mt-3 font-display text-3xl">{snapshot.focusOfWeek.label}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 opacity-85">{snapshot.focusOfWeek.whyItHurts}</p>
            <p className="mt-4 rounded-[18px] bg-white/10 px-4 py-3 text-sm">{snapshot.focusOfWeek.rule}</p>
          </div>
        ) : (
          <div className="surface-soft p-5 text-sm text-muted-strong">
            Analyze a few games first, then the coach page will surface your main recurring blindspot.
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="panel">
          <span className="badge">Pre-Game</span>
          <h2 className="panel-title mt-3">Three reminders before you play</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
            {snapshot.reminders.length ? (
              snapshot.reminders.map((reminder) => <li key={reminder}>{reminder}</li>)
            ) : (
              <li>Import and analyze games to generate your first pre-game checklist.</li>
            )}
          </ul>
        </article>

        <article className="panel">
          <span className="badge">Method</span>
          <h2 className="panel-title mt-3">What this coach should train next</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
            <li>Critical moments only: improve the decisions that actually changed the game.</li>
            <li>Blindspot map: fix the thinking error behind the move, not just the move itself.</li>
            <li>Style trend: protect what already works while tightening what leaks rating.</li>
            <li>One weekly focus: reduce one repeated leak before attacking the next one.</li>
          </ul>
        </article>
      </section>

      <section className="panel">
        <span className="badge">Blindspot Map</span>
        <h2 className="panel-title mt-3">Where your thinking breaks down</h2>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {snapshot.blindspots.length ? (
            snapshot.blindspots.map((blindspot, index) => (
              <article key={blindspot.key} className={`rounded-[24px] p-5 ${blindspotTone(index)}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-2xl">{blindspot.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-strong">{blindspot.whyItHurts}</p>
                  </div>
                  <div className="text-right text-sm text-muted">
                    <p>{blindspot.count} hits</p>
                    <p>{blindspot.averageSwing} cp avg swing</p>
                  </div>
                </div>
                <p className="mt-4 rounded-[18px] bg-white/60 px-4 py-3 text-sm text-muted-strong">{blindspot.rule}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {blindspot.examples.map((example) => (
                    <span
                      key={`${blindspot.key}-${example}`}
                      className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel-strong)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em]"
                    >
                      {example}
                    </span>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <p className="surface-soft p-5 text-sm text-muted-strong">
              No blindspots yet. Analyze recent games to build your first map.
            </p>
          )}
        </div>
      </section>

      <section className="panel" id="style-report">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="badge">Style Report</span>
            <h2 className="panel-title mt-3">Last 30 games</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Use ChatGPT on up to your 30 most recent analyzed games for a broader style diagnosis and improvement
              plan.
            </p>
          </div>
          <div className="space-y-3 text-right">
            <p className="text-sm text-muted">Analyzed games available: {reportSample.sampleSize}</p>
            <RecentReportAction hasReport={Boolean(report?.payload)} gamesAvailable={reportSample.sampleSize} />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Games in sample" value={reportSample.sampleSize} tone="tone-neutral" />
          <StatCard label="Wins" value={reportSample.results.win} tone="tone-success" />
          <StatCard label="Losses" value={reportSample.results.loss} tone="tone-danger" />
          <StatCard label="Draws" value={reportSample.results.draw} tone="tone-warning" />
        </div>

        {trend ? (
          <div className="tone-neutral mt-6 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Trend</p>
                <h3 className="mt-2 font-display text-2xl">Improvement over the last 20 games</h3>
                <p className="mt-2 text-sm text-muted">{trend.summary}</p>
              </div>
              <div
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                  trend.direction === "up"
                    ? "bg-emerald-500/12 text-[color:var(--success-text)]"
                    : trend.direction === "down"
                      ? "bg-rose-500/12 text-[color:var(--error-text)]"
                      : "bg-slate-500/12 text-muted-strong"
                }`}
              >
                {trend.direction === "up" ? "Improving" : trend.direction === "down" ? "Needs correction" : "Mostly flat"}
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-strong">
              {trend.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {report?.payload ? (
          <>
            <div className="surface-card mt-6 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Latest report</p>
                  <h3 className="mt-2 font-display text-2xl">{report.title}</h3>
                  <p className="mt-2 text-sm text-muted">{report.payload.summary}</p>
                </div>
                <div className="text-right text-sm text-muted">
                  <p>{report.gamesCount} games used</p>
                  <p>{report.model}</p>
                  <p>{formatUpdatedAt(report.updatedAt)}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <ReportSection title="Style profile" items={report.payload.styleProfile} tone={reportTone("style")} />
              <ReportSection title="Strengths to keep" items={report.payload.strengths} tone={reportTone("strength")} />
              <ReportSection title="Recurring leaks" items={report.payload.recurringLeaks} tone={reportTone("leak")} />
              <ReportSection title="Improvement priorities" items={report.payload.improvementPriorities} tone={reportTone("priority")} />
            </div>

            <div className="tone-neutral mt-6 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Training plan</p>
              <h3 className="mt-2 font-display text-2xl">How to make your style better</h3>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-strong">
                {report.payload.trainingPlan.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">
                ChatGPT confidence {Math.round(report.payload.confidence * 100)}%
              </p>
            </div>
          </>
        ) : (
          <div className="mt-6 surface-soft p-5 text-sm leading-6 text-muted-strong">
            No style report yet. Generate one from your analyzed games when you want a broader identity-level coaching
            summary.
          </div>
        )}
      </section>

      <section className="panel">
        <span className="badge">Critical Moments</span>
        <h2 className="panel-title mt-3">Positions that deserved deeper thought</h2>
        <div className="mt-6 space-y-4">
          {snapshot.criticalMoments.length ? (
            snapshot.criticalMoments.map((moment) => (
              <article key={`${moment.gameId}-${moment.ply}`} className="surface-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-2xl">{moment.opening}</h3>
                    <p className="mt-2 text-sm text-muted-strong">
                      Ply {moment.ply}: {moment.playedMove} instead of {moment.bestMove}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted">
                      {moment.label} • {moment.deltaCp} cp swing
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link className="btn-primary text-sm" href={moment.href}>
                      Review position
                    </Link>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <p className="surface-soft p-5 text-sm text-muted-strong">
              No critical moments available yet. Run engine analysis on your recent games first.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
