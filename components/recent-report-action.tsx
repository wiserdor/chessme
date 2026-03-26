"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { getPrivateAIConfig, getPrivateAIReport, getStoredActiveProfile, savePrivateAIReport } from "@/lib/client/private-store";

export function RecentReportAction(props: { hasReport: boolean; gamesAvailable: number; hasApiKey: boolean }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [hasReport, setHasReport] = useState(props.hasReport);
  const [hasLocalApiKey, setHasLocalApiKey] = useState(props.hasApiKey);
  const [settings, setSettings] = useState<{ provider: "openai" | "mock"; model: string; apiKey?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadLocalState() {
      const profileUsername = getStoredActiveProfile() ?? "default";
      const [config, report] = await Promise.all([
        getPrivateAIConfig(),
        getPrivateAIReport(profileUsername, "recent-30")
      ]);
      if (cancelled) {
        return;
      }
      const localHasApiKey = config.provider === "openai" && Boolean(config.apiKey);
      setHasLocalApiKey(localHasApiKey);
      setSettings(
        localHasApiKey
          ? {
              provider: "openai",
              model: config.model,
              apiKey: config.apiKey ?? undefined
            }
          : null
      );
      if (report?.payload) {
        setHasReport(true);
      }
    }

    void loadLocalState();
    return () => {
      cancelled = true;
    };
  }, [props.hasApiKey, props.hasReport]);

  return (
    <div className="space-y-2">
      {hasLocalApiKey ? (
        <button
          className="btn-primary text-sm"
          disabled={isPending || props.gamesAvailable === 0}
          onClick={() => {
            setNotice(null);
            startTransition(async () => {
              const profileUsername = getStoredActiveProfile() ?? "default";
              if (!settings?.apiKey) {
                setNotice("Add your OpenAI token in Settings before generating a style report.");
                return;
              }

              const response = await fetch("/api/reports/recent/ai-review", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ settings })
              });
              const payload = (await response.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                message?: string;
                title?: string;
                gamesCount?: number;
                report?: {
                  summary: string;
                  styleProfile: string[];
                  strengths: string[];
                  recurringLeaks: string[];
                  improvementPriorities: string[];
                  trainingPlan: string[];
                  confidence: number;
                };
                provider?: string;
                model?: string;
              };

              if (!response.ok || payload.ok === false || !payload.report) {
                setNotice(payload.error || "Could not generate report.");
                return;
              }

              await savePrivateAIReport(profileUsername, "recent-30", {
                title: payload.title || "Last 30 games coach report",
                gamesCount: payload.gamesCount ?? props.gamesAvailable,
                payload: payload.report,
                provider: payload.provider || "openai",
                model: payload.model || settings.model
              });
              window.dispatchEvent(new Event("private-ai-report-updated"));
              setNotice(payload.message || "Report generated.");
              setHasReport(true);
              router.refresh();
            });
          }}
          type="button"
        >
          {isPending ? "Analyzing..." : hasReport ? "Refresh ChatGPT report" : "Analyze with ChatGPT"}
        </button>
      ) : (
        <Link className="btn-primary text-sm" href="/settings#ai-coach">
          Unlock AI coach
        </Link>
      )}
      {notice || !hasLocalApiKey ? (
        <p className="text-xs text-muted">
          {notice || "Add your token to unlock a grounded style report across your recent games."}
        </p>
      ) : null}
    </div>
  );
}
