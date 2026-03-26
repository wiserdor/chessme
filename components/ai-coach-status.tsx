"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CoachIcon } from "@/components/app-icons";
import { getPrivateAIConfig } from "@/lib/client/private-store";

type LocalAIState = {
  enabled: boolean;
  model: string;
};

export function AICoachStatus(props: {
  compact?: boolean;
  className?: string;
  showSettingsLink?: boolean;
  showWhenDisabled?: boolean;
}) {
  const [state, setState] = useState<LocalAIState>({ enabled: false, model: "deterministic-coach" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const config = await getPrivateAIConfig().catch(() => ({
        provider: "mock" as const,
        model: "deterministic-coach",
        apiKey: null
      }));
      if (cancelled) {
        return;
      }
      setState({
        enabled: config.provider === "openai" && Boolean(config.apiKey),
        model: config.model
      });
    }

    void load();
    function reload() {
      void load();
    }

    window.addEventListener("private-ai-config-updated", reload);
    return () => {
      cancelled = true;
      window.removeEventListener("private-ai-config-updated", reload);
    };
  }, []);

  if (!state.enabled && !props.showWhenDisabled) {
    return null;
  }

  if (props.compact) {
    return (
      <Link
        className={`ai-status-chip ${state.enabled ? "ai-status-chip-enabled" : "ai-status-chip-disabled"} ${props.className ?? ""}`.trim()}
        href="/settings#ai-coach"
      >
        <CoachIcon className="h-4 w-4" />
        <span className="ai-status-chip-copy">
          <span className="ai-status-chip-label">{state.enabled ? "AI Coach On" : "AI Coach Off"}</span>
          <span className="ai-status-chip-model">{state.enabled ? state.model : "Add token"}</span>
        </span>
      </Link>
    );
  }

  return (
    <div className={`${state.enabled ? "tone-success" : "tone-info"} rounded-[24px] p-5 ${props.className ?? ""}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`ai-status-icon ${state.enabled ? "ai-status-icon-enabled" : "ai-status-icon-disabled"}`}>
            <CoachIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {state.enabled ? "AI coach is active" : "AI coach is inactive"}
            </p>
            <h3 className="mt-2 font-display text-2xl">
              {state.enabled ? "ChatGPT coaching is enabled on this device" : "Engine analysis is active by itself"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-strong">
              {state.enabled
                ? `Your local token is saved, so coach chat, game reviews, leak explanations, and style reports will use ${state.model}.`
                : "Add an OpenAI token to unlock coach chat, move explanations, leak guidance, and recent-games style reports."}
            </p>
          </div>
        </div>
        {props.showSettingsLink ? (
          <Link className={state.enabled ? "btn-secondary text-sm" : "btn-primary text-sm"} href="/settings#ai-coach">
            {state.enabled ? "Manage AI coach" : "Add token"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
