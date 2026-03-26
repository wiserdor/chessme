"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getPrivateLeakExplanationCache, getStoredActiveProfile } from "@/lib/client/private-store";

type LeakExampleRow = {
  text: string;
  href?: string;
  gameId: string;
  ply?: number;
  explanation: string;
  whyLeak: string;
  source: "ai" | "fallback";
};

type TacticalDecor = {
  motifTitle?: string;
  trigger?: string;
  rule?: string;
};

export function LeakExamplesPanel(props: {
  leakKey: string;
  initialExamples: LeakExampleRow[];
  tacticalDecorByExample?: Record<string, TacticalDecor>;
}) {
  const [localExamples, setLocalExamples] = useState<
    Array<{
      gameId: string;
      ply?: number | null;
      explanation: string;
      whyLeak: string;
      source: "ai" | "engine";
    }>
  >([]);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalCache() {
      const profileUsername = getStoredActiveProfile() ?? "default";
      const cache = await getPrivateLeakExplanationCache(profileUsername, props.leakKey);
      if (!cancelled) {
        setLocalExamples(cache?.examples ?? []);
      }
    }

    void loadLocalCache();
    const reload = () => void loadLocalCache();
    window.addEventListener("private-leak-ai-updated", reload);
    return () => {
      cancelled = true;
      window.removeEventListener("private-leak-ai-updated", reload);
    };
  }, [props.leakKey]);

  const examples = useMemo(() => {
    const localMap = new Map(
      localExamples.map((example) => [`${example.gameId}:${example.ply ?? "n"}`, example] as const)
    );

    return props.initialExamples.map((example) => {
      const local = localMap.get(`${example.gameId}:${example.ply ?? "n"}`);
      return local
        ? {
            ...example,
            explanation: local.explanation,
            whyLeak: local.whyLeak,
            source: "ai" as const
          }
        : example;
    });
  }, [localExamples, props.initialExamples]);

  const aiExplainedCount = examples.filter((example) => example.source === "ai").length;

  return (
    <section className="panel">
      <span className="badge">Examples</span>
      <h2 className="panel-title mt-3">Where this leak appears in your games</h2>
      <p className="mt-2 text-sm text-muted">
        {aiExplainedCount} of {examples.length} examples currently have AI explanations.
      </p>
      {examples.length ? (
        <div className="scroll-panel mt-4 max-h-[32rem] overflow-y-auto rounded-[24px] border border-[color:var(--border)] bg-[color:var(--panel-soft)] p-3 pr-2">
          <ul className="space-y-3 text-sm text-muted-strong">
            {examples.map((example) => {
              const decor = props.tacticalDecorByExample?.[`${example.gameId}:${example.ply ?? "n"}`];

              return (
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
                      {decor ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {decor.motifTitle ? (
                            <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                              {decor.motifTitle}
                            </span>
                          ) : null}
                          {decor.trigger ? (
                            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-strong">
                              {decor.trigger}
                            </span>
                          ) : null}
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
                  {decor?.rule ? (
                    <p className="mt-2 text-sm leading-6 text-muted-strong">
                      <span className="font-semibold">Rule to remember:</span> {decor.rule}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-strong">No examples stored yet for this leak.</p>
      )}
    </section>
  );
}
