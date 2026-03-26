"use client";

import Link from "next/link";

export function UnlockAICoachCard(props: {
  title?: string;
  description: string;
  bullets?: string[];
  compact?: boolean;
  ctaLabel?: string;
  className?: string;
}) {
  return (
    <div className={`tone-info rounded-[24px] p-5 ${props.className ?? ""}`.trim()}>
      <span className="badge">Unlock AI Coach</span>
      <h3 className={`mt-3 font-display ${props.compact ? "text-2xl" : "text-3xl"}`}>
        {props.title ?? "Unlock your full chess coach"}
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-strong">{props.description}</p>
      {props.bullets?.length ? (
        <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-strong">
          {props.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Link className="btn-primary w-full text-sm sm:w-auto" href="/settings#ai-coach">
          {props.ctaLabel ?? "Unlock AI coach"}
        </Link>
        <p className="text-xs text-muted">Stored only in your local app settings. Used only when you run AI coaching features.</p>
      </div>
    </div>
  );
}
