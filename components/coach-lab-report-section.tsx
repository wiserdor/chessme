"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { RecentReportAction } from "@/components/recent-report-action";
import { getPrivateAIReport, getStoredActiveProfile } from "@/lib/client/private-store";
import type { PortfolioReview, PrivateAIReportCache } from "@/lib/types";

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

type InitialReport =
  | PrivateAIReportCache
  | {
      title: string;
      gamesCount: number;
      payload: PortfolioReview | null;
      provider: string;
      model: string;
      updatedAt: number;
    }
  | null;

export function CoachLabReportSection(props: {
  initialReport: InitialReport;
  reportSample: {
    sampleSize: number;
    results: { win: number; loss: number; draw: number };
    leakLabels: Array<{ label: string; count: number }>;
  };
  trend: {
    direction: string;
    summary: string;
    bullets: string[];
  } | null;
  hasApiKey: boolean;
}) {
  const [report, setReport] = useState<InitialReport>(props.initialReport);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalReport() {
      const profileUsername = getStoredActiveProfile() ?? "default";
      const localReport = await getPrivateAIReport(profileUsername, "recent-30");
      if (!cancelled) {
        setReport(localReport ?? props.initialReport);
      }
    }

    void loadLocalReport();
    const reload = () => void loadLocalReport();
    window.addEventListener("private-ai-report-updated", reload);
    return () => {
      cancelled = true;
      window.removeEventListener("private-ai-report-updated", reload);
    };
  }, [props.initialReport]);

  return (
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
        <div className="w-full space-y-3 text-left sm:w-auto sm:text-right">
          <p className="text-sm text-muted">Analyzed games available: {props.reportSample.sampleSize}</p>
          <RecentReportAction
            hasReport={Boolean(report?.payload)}
            gamesAvailable={props.reportSample.sampleSize}
            hasApiKey={props.hasApiKey}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Games in sample" value={props.reportSample.sampleSize} tone="tone-neutral" />
        <StatCard label="Wins" value={props.reportSample.results.win} tone="tone-success" />
        <StatCard label="Losses" value={props.reportSample.results.loss} tone="tone-danger" />
        <StatCard label="Draws" value={props.reportSample.results.draw} tone="tone-warning" />
      </div>

      {props.reportSample.leakLabels.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {props.reportSample.leakLabels.map((leak) => (
            <Link
              key={leak.label}
              className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700"
              href={
                leak.label === "Opening leaks"
                  ? "/leaks/opening-leaks"
                  : leak.label === "Tactical oversights"
                    ? "/leaks/tactical-oversights"
                    : leak.label === "Large blunders"
                      ? "/leaks/large-blunders"
                      : leak.label === "Endgame conversion"
                        ? "/leaks/endgame-conversion"
                        : "/leaks/decision-drift"
              }
            >
              {leak.label} ({leak.count})
            </Link>
          ))}
        </div>
      ) : null}

      {props.trend ? (
        <div className="tone-neutral mt-6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Trend</p>
              <h3 className="mt-2 font-display text-2xl">Improvement over the last 20 games</h3>
              <p className="mt-2 text-sm text-muted">{props.trend.summary}</p>
            </div>
            <div
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                props.trend.direction === "up"
                  ? "bg-emerald-500/12 text-[color:var(--success-text)]"
                  : props.trend.direction === "down"
                    ? "bg-rose-500/12 text-[color:var(--error-text)]"
                    : "bg-slate-500/12 text-muted-strong"
              }`}
            >
              {props.trend.direction === "up" ? "Improving" : props.trend.direction === "down" ? "Needs correction" : "Mostly flat"}
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-strong">
            {props.trend.bullets.map((item) => (
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
            <ReportSection
              title="Improvement priorities"
              items={report.payload.improvementPriorities}
              tone={reportTone("priority")}
            />
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
  );
}
