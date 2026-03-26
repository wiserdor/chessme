"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { FavoriteIcon } from "@/components/app-icons";
import { getStoredActiveProfile, isFavoriteGame, setFavoriteGame } from "@/lib/client/private-store";

export function FavoriteGameButton(props: {
  gameId: string;
  initialFavorite: boolean;
  compact?: boolean;
  profileUsername?: string;
}) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(props.initialFavorite);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const profileUsername = props.profileUsername ?? getStoredActiveProfile() ?? "default";

  useEffect(() => {
    let cancelled = false;
    void isFavoriteGame(profileUsername, props.gameId).then((favorite) => {
      if (!cancelled) {
        setIsFavorite(favorite);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profileUsername, props.gameId]);

  return (
    <div className="space-y-1">
      <button
        className={`inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
          isFavorite
            ? "border-amber-500/25 bg-amber-500/14 text-amber-700"
            : "border-[color:var(--border)] bg-[color:var(--panel-soft)] text-muted-strong"
        } ${props.compact ? "px-3 py-1.5 text-xs uppercase tracking-[0.12em]" : ""}`}
        disabled={isPending}
        onClick={() => {
          setNotice(null);
          const previous = isFavorite;
          const nextFavorite = !previous;
          setIsFavorite(nextFavorite);

          startTransition(async () => {
            try {
              await setFavoriteGame(profileUsername, props.gameId, nextFavorite);
              window.dispatchEvent(new CustomEvent("favorites-updated"));
              router.refresh();
            } catch {
              setIsFavorite(previous);
              setNotice("Could not save favorite.");
            }
          });
        }}
        type="button"
      >
        <FavoriteIcon className={`shrink-0 ${props.compact ? "h-4 w-4" : "h-[18px] w-[18px]"} ${isFavorite ? "fill-current" : ""}`} />
        <span>{isFavorite ? "Saved" : "Save game"}</span>
      </button>
      {notice ? <p className="text-xs text-[color:var(--error-text)]">{notice}</p> : null}
    </div>
  );
}
