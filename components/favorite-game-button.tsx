"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FavoriteIcon } from "@/components/app-icons";

export function FavoriteGameButton(props: {
  gameId: string;
  initialFavorite: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(props.initialFavorite);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
              const response = await fetch(`/api/games/${props.gameId}/favorite`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ favorite: nextFavorite })
              });

              const payload = (await response.json().catch(() => ({}))) as {
                ok?: boolean;
                error?: string;
                favorite?: boolean;
              };

              if (!response.ok || payload.ok === false) {
                setIsFavorite(previous);
                setNotice(payload.error || "Could not save favorite.");
                return;
              }

              setIsFavorite(Boolean(payload.favorite));
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
