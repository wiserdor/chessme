"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { FavoriteIcon, GameFeedIcon, GamesIcon } from "@/components/app-icons";
import { ResultPill } from "@/components/result-pill";
import { getStoredActiveProfile, listFavoriteGameIds } from "@/lib/client/private-store";
import { DashboardSnapshot } from "@/lib/types";

export function FavoriteGames(props: { snapshot: DashboardSnapshot }) {
  const activeProfile = getStoredActiveProfile() ?? props.snapshot.profile?.username ?? "default";
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const ids = await listFavoriteGameIds(activeProfile);
      if (!cancelled) {
        setFavoriteIds(ids);
      }
    }
    void load();
    const onUpdate = () => void load();
    window.addEventListener("favorites-updated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("favorites-updated", onUpdate);
    };
  }, [activeProfile]);

  const favoriteGames = useMemo(
    () => props.snapshot.recentGames.filter((game) => favoriteIds.includes(game.id)),
    [favoriteIds, props.snapshot.recentGames]
  );

  return (
    <section className="panel">
      <div>
        <span className="badge inline-flex items-center gap-2">
          <FavoriteIcon className="h-3.5 w-3.5" />
          <span>Favorites</span>
        </span>
        <h2 className="panel-title mt-3">Saved games</h2>
      </div>

      <div className="mt-6 space-y-4">
        {favoriteGames.length ? (
          favoriteGames.map((game) => (
            <Link
              key={game.id}
              href={`/games/${game.id}`}
              className="surface-soft flex flex-wrap items-center justify-between gap-4 px-4 py-3 hover:translate-y-[-1px]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <FavoriteIcon className="h-4 w-4 fill-current text-amber-600" />
                  <p className="font-semibold">{game.opening}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>{formatPlayedAt(game.playedAt)}</span>
                  <ResultPill compact result={game.result} />
                </div>
              </div>
              <div className="text-right text-sm text-muted">
                <p>vs {game.opponent}</p>
                <p className="font-semibold text-[color:var(--primary)]">Quick open</p>
              </div>
            </Link>
          ))
        ) : (
          <p className="surface-soft p-5 text-sm text-muted-strong">No favorite games saved yet on this device.</p>
        )}
      </div>
    </section>
  );
}

export function RecentGames(props: { snapshot: DashboardSnapshot }) {
  const activeProfile = getStoredActiveProfile() ?? props.snapshot.profile?.username ?? "default";
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const ids = await listFavoriteGameIds(activeProfile);
      if (!cancelled) {
        setFavoriteIds(ids);
      }
    }
    void load();
    const onUpdate = () => void load();
    window.addEventListener("favorites-updated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("favorites-updated", onUpdate);
    };
  }, [activeProfile]);

  return (
    <section className="panel">
      <div>
        <span className="badge inline-flex items-center gap-2">
          <GameFeedIcon className="h-3.5 w-3.5" />
          <span>Game Feed</span>
        </span>
        <h2 className="panel-title mt-3">Recent imports</h2>
      </div>

      <div className="mt-6 space-y-4">
        {props.snapshot.recentGames.length ? (
          props.snapshot.recentGames.map((game) => (
            <Link
              key={game.id}
              href={`/games/${game.id}`}
              className="surface-card flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:translate-y-[-1px]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <GamesIcon className="h-4 w-4 text-muted" />
                  <p className="font-semibold">{game.opening}</p>
                  {favoriteIds.includes(game.id) ? <FavoriteIcon className="h-4 w-4 fill-current text-amber-600" /> : null}
                  <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {game.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>{formatPlayedAt(game.playedAt)}</span>
                  <ResultPill compact result={game.result} />
                </div>
              </div>
              <div className="text-right text-sm text-muted">
                <p>vs {game.opponent}</p>
                <p className="font-semibold text-[color:var(--primary)]">Open review</p>
              </div>
            </Link>
          ))
        ) : (
          <p className="surface-soft p-5 text-sm text-muted-strong">No games imported yet.</p>
        )}
      </div>
    </section>
  );
}

function formatPlayedAt(value: string) {
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
