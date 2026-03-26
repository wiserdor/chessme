"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { deletePrivateNote, getStoredActiveProfile } from "@/lib/client/private-store";
import { NoteComposerTrigger } from "@/components/note-composer-trigger";
import type { NoteRecord } from "@/lib/types";

export function NoteCard(props: {
  note: NoteRecord;
  compact?: boolean;
  refreshOnChange?: boolean;
  profileUsername?: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const resolvedProfileUsername = props.profileUsername ?? getStoredActiveProfile() ?? "default";

  return (
    <article className={`rounded-[22px] border border-[color:var(--border)] bg-[color:var(--panel-soft)] ${props.compact ? "p-4" : "p-5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`${props.compact ? "text-lg" : "font-display text-2xl"}`}>{props.note.title}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-strong">
              {props.note.anchorType.replace(/-/g, " ")}
            </span>
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-strong">
              {new Date(props.note.updatedAt).toLocaleDateString()}
            </span>
            {props.note.coachMessageContext ? (
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                Saved from coach
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary px-3 py-2 text-xs uppercase tracking-[0.12em]" href={props.note.href}>
            Open source
          </Link>
          <NoteComposerTrigger
            buttonLabel="Edit"
            buttonClassName="btn-ghost px-3 py-2 text-xs uppercase tracking-[0.12em]"
            dialogTitle="Edit note"
            existingNote={props.note}
            refreshOnSave={props.refreshOnChange}
            profileUsername={resolvedProfileUsername}
          />
          <button
            className="btn-ghost px-3 py-2 text-xs uppercase tracking-[0.12em] text-[color:var(--error-text)]"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm("Delete this note?")) {
                return;
              }

              setNotice(null);
              startTransition(async () => {
                try {
                  await deletePrivateNote(resolvedProfileUsername, props.note.id);
                  window.dispatchEvent(new CustomEvent("notes-updated"));
                  if (props.refreshOnChange) {
                    window.location.reload();
                  }
                } catch {
                  setNotice("Could not delete note.");
                }
              });
            }}
            type="button"
          >
            Delete
          </button>
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-strong">
        {props.compact ? props.note.excerpt : props.note.body}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {props.note.anchorLabel}
        </span>
        {props.note.manualTags.map((tag) => (
          <span key={tag} className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
            {tag}
          </span>
        ))}
        {props.note.derivedTags.slice(0, props.compact ? 3 : 6).map((tag) => (
          <span key={tag} className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {tag}
          </span>
        ))}
      </div>

      {notice ? <p className="mt-3 text-xs text-[color:var(--error-text)]">{notice}</p> : null}
    </article>
  );
}
