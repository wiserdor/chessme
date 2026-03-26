import Link from "next/link";

import { FavoriteGameButton } from "@/components/favorite-game-button";
import { GameAIReviewAction } from "@/components/game-ai-review-action";
import { GamePrivateReviewPanels } from "@/components/game-private-review-panels";
import { GameReviewWorkspace } from "@/components/game-review-workspace";
import { NoteComposerTrigger } from "@/components/note-composer-trigger";
import { ResultPill } from "@/components/result-pill";
import { buildGameInsights } from "@/lib/services/game-insights";
import { getAISettings, getGameDetail } from "@/lib/services/repository";

export const dynamic = "force-dynamic";

function formatGameTime(value?: string | null) {
  if (!value) {
    return "Unknown time";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default async function GamePage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ply?: string }>;
}) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const [detail, aiSettings] = await Promise.all([getGameDetail(params.id), getAISettings()]);

  if (!detail) {
    return (
      <main className="space-y-6">
        <section className="panel space-y-4">
          <span className="badge">Game review</span>
          <h1 className="mt-3 font-display text-4xl">This game is not in the current profile</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted">
            You switched profiles, so this game may belong to a different Chess.com workspace. Pick another saved profile
            from the header, or open the current profile&apos;s games list.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link className="btn-primary w-full text-sm sm:w-auto" href="/games">
              Open current profile games
            </Link>
            <Link className="btn-secondary w-full text-sm sm:w-auto" href="/#control-room">
              Choose another profile
            </Link>
          </div>
        </section>
      </main>
    );
  }
  const insights = buildGameInsights(detail);
  const plyCandidate = searchParams?.ply ? Number.parseInt(searchParams.ply, 10) : NaN;
  const selectedPly = Number.isFinite(plyCandidate) ? plyCandidate : undefined;
  const criticalMomentNotesByPly = new Map(detail.criticalMomentNotes.map((note) => [note.ply, note]));
  const criticalMoments = detail.engineReviews.map((review) => ({
    ply: review.ply,
    label: review.label,
    deltaCp: review.deltaCp,
    whatHappened: criticalMomentNotesByPly.get(review.ply)?.whatHappened,
    whyItMatters: criticalMomentNotesByPly.get(review.ply)?.whyItMatters,
    whatToThink: criticalMomentNotesByPly.get(review.ply)?.whatToThink,
    trainingFocus: criticalMomentNotesByPly.get(review.ply)?.trainingFocus,
    aiAvailable: criticalMomentNotesByPly.has(review.ply)
  }));

  return (
    <main className="space-y-6">
      <section className="panel space-y-4">
        <Link className="text-sm font-semibold uppercase tracking-[0.18em]" href="/">
          Back to dashboard
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="badge">Game review</span>
            <h1 className="mt-3 font-display text-4xl">{detail.game.opening || "Imported game"}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>
                {detail.game.whitePlayer} vs {detail.game.blackPlayer}
              </span>
              <ResultPill result={detail.resultLabel} />
            </div>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted">
              Imported game time: {formatGameTime(detail.game.playedAt)}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <NoteComposerTrigger
                buttonLabel="Add game note"
                buttonClassName="btn-secondary w-full text-sm sm:w-auto"
                dialogTitle="Save note on this game"
                context={{
                  anchorType: "game",
                  anchorLabel: detail.game.opening || "Game review",
                  sourcePath: `/games/${detail.game.id}`,
                  gameId: detail.game.id,
                  opening: detail.game.opening ?? null
                }}
              />
              {detail.game.opening ? (
                <NoteComposerTrigger
                  buttonLabel="Add opening note"
                  buttonClassName="btn-secondary w-full text-sm sm:w-auto"
                  dialogTitle="Save opening note"
                  context={{
                    anchorType: "opening",
                    anchorLabel: detail.game.opening,
                    sourcePath: `/games/${detail.game.id}`,
                    gameId: detail.game.id,
                    opening: detail.game.opening
                  }}
                />
              ) : null}
            </div>
          </div>
          <div className="surface-soft px-5 py-4 text-sm text-muted-strong">
            <p>
              {detail.review ? `Latest review confidence ${Math.round(detail.review.confidence * 100)}%` : "No coach narrative yet"}
            </p>
            <p className="mt-1 text-xs text-muted">Public engine analysis lives on the server. Private AI coaching stays on this device.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <FavoriteGameButton gameId={detail.game.id} initialFavorite={Boolean(detail.game.isFavorite)} />
              <GameAIReviewAction
                gameId={detail.game.id}
                hasAIReview={detail.review?.coachSource === "openai"}
                analysisStatus={detail.game.analysisStatus}
                hasApiKey={aiSettings.hasApiKey}
              />
            </div>
          </div>
        </div>

        <GamePrivateReviewPanels
          gameId={detail.game.id}
          initialReview={
            detail.review
              ? {
                  summary: detail.review.summary,
                  coachingNotes: detail.review.coachingNotes,
                  actionItems: detail.review.actionItems,
                  confidence: detail.review.confidence,
                  coachSource: detail.review.coachSource,
                  coachProvider: detail.review.coachProvider,
                  coachModel: detail.review.coachModel
                }
              : null
          }
        />

        <article className="tone-info p-5">
          <h2 className="font-display text-2xl">Leaks analyzed in this game</h2>
          {insights.analyzedLeaks.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {insights.analyzedLeaks.map((leak) => (
                <div key={leak.key} className="surface-card rounded-[18px] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{leak.label}</p>
                    <span className="rounded-full bg-blue-500/12 px-3 py-1 text-xs font-semibold text-[color:var(--info-text)]">
                      {leak.count} hits
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-strong">{leak.focus}</p>
                  <Link
                    className="btn-primary mt-3 px-3 py-2 text-xs uppercase tracking-[0.12em]"
                    href={`/leaks/${leak.key}`}
                  >
                    Open leak guide
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-strong">No leak categories were detected for this game yet.</p>
          )}
        </article>

        <div className="grid gap-4 xl:grid-cols-2">
          <article className="tone-danger p-5">
            <h2 className="font-display text-2xl">Where it went wrong</h2>
            <div className="mt-3 space-y-3 text-sm leading-6 text-muted-strong">
              {insights.wentWrong.map((item) => (
                <div key={item.title + item.detail}>
                  <p className="font-semibold">{item.title}</p>
                  {item.ply ? (
                    <Link
                      className="inline-block underline-offset-2 hover:underline"
                      href={`/games/${params.id}?ply=${item.ply}#replay`}
                    >
                      {item.detail} (jump to move)
                    </Link>
                  ) : (
                    <p>{item.detail}</p>
                  )}
                </div>
              ))}
            </div>
          </article>

          <article className="tone-success p-5">
            <h2 className="font-display text-2xl">Where it went right</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-strong">
              {insights.wentRight.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <article className="tone-neutral p-5">
            <h2 className="font-display text-2xl">What to think next</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-strong">
              {insights.nextThink.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="tone-info p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl">Anything else</h2>
              {insights.primaryLeakKey ? (
                <Link
                  className="btn-primary px-4 py-2 text-xs uppercase tracking-[0.12em]"
                  href={`/leaks/${insights.primaryLeakKey}`}
                >
                  Focus this leak
                </Link>
              ) : null}
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-strong">
              {insights.extraIdeas.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="panel" id="replay">
        <div className="mb-6">
          <span className="badge">Replay</span>
          <h2 className="panel-title mt-3">Move-by-move board review</h2>
        </div>
        <GameReviewWorkspace
          gameId={detail.game.id}
          opening={detail.game.opening}
          moves={detail.positions}
          criticalMoments={criticalMoments}
          hasApiKey={aiSettings.hasApiKey}
          initialPly={selectedPly}
          orientation={detail.playerColor === "black" ? "black" : "white"}
          playerColor={detail.playerColor === "black" || detail.playerColor === "white" ? detail.playerColor : undefined}
          initialMessages={detail.coachChatMessages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            focusPly: message.focusPly
          }))}
        />
      </section>
    </main>
  );
}
