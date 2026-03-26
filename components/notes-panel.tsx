"use client";

import { useEffect, useState } from "react";

import { NoteCard } from "@/components/note-card";
import { getStoredActiveProfile, searchPrivateNotes } from "@/lib/client/private-store";
import type { NoteRecord } from "@/lib/types";

type SearchRequest = {
  q?: string;
  anchorType?: string;
  tag?: string;
  opening?: string;
  leakKey?: string;
  gameId?: string;
  ply?: number;
  trainingCardId?: string;
  focusArea?: string;
  hasFen?: string | boolean;
  limit?: number;
};

function toQueryString(input: SearchRequest) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    params.set(key, String(value));
  }

  return params.toString();
}

export function NotesPanel(props: {
  title: string;
  description?: string;
  searches: SearchRequest[];
  emptyMessage: string;
  limit?: number;
  profileUsername?: string;
}) {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const profileUsername = props.profileUsername ?? getStoredActiveProfile() ?? "default";

      try {
        const results = await Promise.all(
          props.searches.map((search) =>
            searchPrivateNotes(profileUsername, {
              ...search,
              limit: search.limit ?? props.limit ?? 6
            })
          )
        );

        if (cancelled) {
          return;
        }

        const mergedMap = new Map<string, NoteRecord>();
        for (const bucket of results) {
          for (const note of bucket) {
            if (!mergedMap.has(note.id)) {
              mergedMap.set(note.id, note);
            }
          }
        }

        const merged = Array.from(mergedMap.values()).slice(0, props.limit ?? 6);

        setNotes(merged);
      } catch {
        if (!cancelled) {
          setNotes([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    const handleUpdate = () => {
      load();
    };

    window.addEventListener("notes-updated", handleUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("notes-updated", handleUpdate);
    };
  }, [props.emptyMessage, props.limit, props.searches, props.title]);

  return (
    <section className="surface-card p-5">
      <h3 className="font-display text-2xl">{props.title}</h3>
      {props.description ? <p className="mt-2 text-sm leading-6 text-muted">{props.description}</p> : null}

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="surface-soft rounded-[18px] p-4 text-sm text-muted-strong">Loading notes...</p>
        ) : notes.length ? (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              compact
              note={note}
              profileUsername={props.profileUsername}
              refreshOnChange={false}
            />
          ))
        ) : (
          <p className="surface-soft rounded-[18px] p-4 text-sm text-muted-strong">{props.emptyMessage}</p>
        )}
      </div>
    </section>
  );
}
