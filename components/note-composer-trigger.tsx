"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import type { NoteAnchorType, NoteRecord } from "@/lib/types";

type NoteContext = {
  anchorType: NoteAnchorType;
  anchorLabel?: string | null;
  sourcePath: string;
  gameId?: string | null;
  ply?: number | null;
  fen?: string | null;
  opening?: string | null;
  leakKey?: string | null;
  trainingCardId?: string | null;
  focusArea?: string | null;
  coachMessageContext?: string | null;
};

function buildContextChips(context: NoteContext) {
  const chips: string[] = [context.anchorType.replace(/-/g, " ")];

  if (context.anchorLabel) {
    chips.push(context.anchorLabel);
  }
  if (context.opening) {
    chips.push(context.opening);
  }
  if (context.leakKey) {
    chips.push(context.leakKey.replace(/-/g, " "));
  }
  if (typeof context.ply === "number") {
    chips.push(`Ply ${context.ply}`);
  }
  if (context.focusArea) {
    chips.push(context.focusArea);
  }

  return Array.from(new Set(chips.filter(Boolean)));
}

function contextFromNote(note: NoteRecord): NoteContext {
  return {
    anchorType: note.anchorType,
    anchorLabel: note.anchorLabel,
    sourcePath: note.sourcePath,
    gameId: note.gameId,
    ply: note.ply,
    fen: note.fen,
    opening: note.opening,
    leakKey: note.leakKey,
    trainingCardId: note.trainingCardId,
    focusArea: note.focusArea,
    coachMessageContext: note.coachMessageContext
  };
}

export function NoteComposerTrigger(props: {
  buttonLabel: string;
  buttonClassName?: string;
  dialogTitle?: string;
  context?: NoteContext;
  existingNote?: NoteRecord;
  initialTitle?: string;
  initialBody?: string;
  initialManualTags?: string[];
  refreshOnSave?: boolean;
  onSaved?: () => void;
}) {
  const context = useMemo(
    () => props.context ?? (props.existingNote ? contextFromNote(props.existingNote) : undefined),
    [props.context, props.existingNote]
  );
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState(props.existingNote?.title ?? props.initialTitle ?? "");
  const [body, setBody] = useState(props.existingNote?.body ?? props.initialBody ?? "");
  const [tags, setTags] = useState<string[]>(props.existingNote?.manualTags ?? props.initialManualTags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !isMounted) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setNotice(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMounted, isOpen]);

  function pushTag(rawValue: string) {
    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) {
      return;
    }

    setTags((current) => (current.includes(normalized) ? current : [...current, normalized]));
    setTagInput("");
  }

  function close() {
    setIsOpen(false);
    setNotice(null);
  }

  const modal = isOpen ? (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-[color:var(--border)] bg-[color:var(--panel-strong)] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Notes</p>
            <h2 className="mt-2 font-display text-3xl">
              {props.dialogTitle ?? (props.existingNote ? "Edit note" : "Save note")}
            </h2>
          </div>
          <button className="btn-ghost px-3 py-2 text-sm" onClick={close} type="button">
            Close
          </button>
        </div>

        {context ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Locked context</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {buildContextChips(context).map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-[color:var(--border)] bg-[color:var(--panel-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-strong"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="note-title">
              Title
            </label>
            <input
              id="note-title"
              className="field mt-2"
              placeholder="Optional title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="note-body">
              Note
            </label>
            <textarea
              id="note-body"
              className="field-area mt-2 min-h-40 rounded-[20px]"
              placeholder="Write what you want to remember..."
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="note-tag-input">
              Manual tags
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag}
                  className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-sky-700"
                  onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                  type="button"
                >
                  {tag} ×
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="note-tag-input"
                className="field"
                placeholder="Add a tag and press Enter"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    pushTag(tagInput);
                  }
                }}
              />
              <button className="btn-secondary px-4 py-2 text-sm" onClick={() => pushTag(tagInput)} type="button">
                Add tag
              </button>
            </div>
          </div>
        </div>

        {notice ? <p className="mt-4 text-sm text-[color:var(--error-text)]">{notice}</p> : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button className="btn-secondary px-4 py-2 text-sm" onClick={close} type="button">
            Cancel
          </button>
          <button
            className="btn-primary px-4 py-2 text-sm"
            disabled={isPending}
            onClick={() => {
              setNotice(null);
              startTransition(async () => {
                if (!body.trim()) {
                  setNotice("Note body is required.");
                  return;
                }

                try {
                  const response = await fetch(props.existingNote ? `/api/notes/${props.existingNote.id}` : "/api/notes", {
                    method: props.existingNote ? "PATCH" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                      props.existingNote
                        ? {
                            title: title.trim() || undefined,
                            body: body.trim(),
                            manualTags: tags
                          }
                        : {
                            title: title.trim() || undefined,
                            body: body.trim(),
                            manualTags: tags,
                            ...context
                          }
                    )
                  });

                  const payload = (await response.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                  };

                  if (!response.ok || payload.ok === false) {
                    setNotice(payload.error || "Could not save note.");
                    return;
                  }

                  window.dispatchEvent(new CustomEvent("notes-updated"));
                  props.onSaved?.();
                  close();

                  if (!props.existingNote) {
                    setTitle(props.initialTitle ?? "");
                    setBody(props.initialBody ?? "");
                    setTags(props.initialManualTags ?? []);
                  }

                  if (props.refreshOnSave) {
                    window.location.reload();
                  }
                } catch {
                  setNotice("Could not save note.");
                }
              });
            }}
            type="button"
          >
            {isPending ? "Saving..." : props.existingNote ? "Save changes" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button className={props.buttonClassName ?? "btn-secondary text-sm"} onClick={() => setIsOpen(true)} type="button">
        {props.buttonLabel}
      </button>

      {isMounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
