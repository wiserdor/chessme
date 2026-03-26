"use client";

import { useEffect, useState } from "react";

import { getPrivateGameAIReview, getStoredActiveProfile } from "@/lib/client/private-store";

type ReviewView = {
  summary: string;
  coachingNotes: string[];
  actionItems: string[];
  confidence: number;
  coachSource?: string | null;
  coachProvider?: string | null;
  coachModel?: string | null;
};

export function GamePrivateReviewPanels(props: {
  gameId: string;
  profileUsername?: string;
  initialReview: ReviewView | null;
}) {
  const [review, setReview] = useState<ReviewView | null>(props.initialReview);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalReview() {
      const profileUsername = props.profileUsername ?? getStoredActiveProfile() ?? "default";
      const localReview = await getPrivateGameAIReview(profileUsername, props.gameId);
      if (cancelled) {
        return;
      }

      if (localReview) {
        setReview({
          ...localReview.review,
          coachSource: "openai",
          coachProvider: localReview.provider,
          coachModel: localReview.model
        });
      } else {
        setReview(props.initialReview);
      }
    }

    void loadLocalReview();
    const reload = () => void loadLocalReview();
    window.addEventListener("private-game-review-updated", reload);
    return () => {
      cancelled = true;
      window.removeEventListener("private-game-review-updated", reload);
    };
  }, [props.gameId, props.initialReview, props.profileUsername]);

  if (!review) {
    return <p className="surface-soft p-5 text-sm text-muted-strong">Run analysis to generate a review.</p>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="tone-neutral p-5 xl:col-span-2">
        <h2 className="font-display text-2xl">Summary</h2>
        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-muted">
          {review.coachSource === "openai"
            ? `Generated privately by ${review.coachModel || review.coachProvider || "AI"}`
            : "Generated from engine-backed fallback coaching"}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-strong">{review.summary}</p>
      </div>
      <div className="space-y-4">
        {review.coachingNotes.length ? (
          <div className="surface-card p-5">
            <h2 className="font-display text-2xl">Key lessons</h2>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-muted-strong">
              {review.coachingNotes.slice(0, 3).map((item) => (
                <li key={item} className="rounded-[16px] bg-[color:var(--panel-soft)] px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {review.actionItems.length ? (
          <div className="tone-info p-5">
            <h2 className="font-display text-2xl">Next game checklist</h2>
            <p className="mt-2 text-sm text-muted-strong">
              Use these as practical reminders before and during your next game.
            </p>
            <ul className="mt-3 space-y-3 text-sm leading-6 text-muted-strong">
              {review.actionItems.slice(0, 4).map((item, index) => (
                <li key={item} className="flex items-start gap-3 rounded-[16px] bg-[color:var(--panel-strong)] px-4 py-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--primary)] text-xs font-bold text-[color:var(--primary-text)]">
                    {index + 1}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
