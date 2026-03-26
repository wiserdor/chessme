"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { NoteCard } from "@/components/note-card";
import { NoteComposerTrigger } from "@/components/note-composer-trigger";
import { getNotesFilterOptions, getStoredActiveProfile, searchPrivateNotes } from "@/lib/client/private-store";
import type { NoteRecord } from "@/lib/types";

type FilterOptions = Awaited<ReturnType<typeof getNotesFilterOptions>>;

export function NotesBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeProfile = getStoredActiveProfile() ?? "default";
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    tags: [],
    openings: [],
    focusAreas: [],
    leakOptions: []
  });

  const filters = useMemo(
    () => ({
      q: searchParams.get("q") ?? undefined,
      anchorType: searchParams.get("anchorType") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
      opening: searchParams.get("opening") ?? undefined,
      leakKey: searchParams.get("leakKey") ?? undefined,
      focusArea: searchParams.get("focusArea") ?? undefined,
      hasFen: searchParams.get("hasFen") ?? undefined,
      limit: 200
    }),
    [searchParams]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [nextNotes, nextOptions] = await Promise.all([
        searchPrivateNotes(activeProfile, filters),
        getNotesFilterOptions(activeProfile)
      ]);
      if (cancelled) {
        return;
      }
      setNotes(nextNotes);
      setFilterOptions(nextOptions);
    }
    void load();
    const onUpdate = () => void load();
    window.addEventListener("notes-updated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("notes-updated", onUpdate);
    };
  }, [activeProfile, filters]);

  return (
    <main className="space-y-6">
      <section className="panel space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="badge">Notebook</span>
            <h1 className="mt-3 font-display text-4xl">All notes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Search your private notes across games, moves, openings, leaks, coach flows, and training moments.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <NoteComposerTrigger
              buttonLabel="New general note"
              buttonClassName="btn-primary text-sm"
              context={{
                anchorType: "general",
                anchorLabel: "General note",
                sourcePath: "/notes"
              }}
              profileUsername={activeProfile}
              refreshOnSave
            />
            <Link className="btn-secondary text-sm" href="/">
              Back to dashboard
            </Link>
          </div>
        </div>

        <form
          className="surface-soft grid gap-4 p-4 lg:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const params = new URLSearchParams();
            for (const [key, value] of formData.entries()) {
              if (typeof value === "string" && value) {
                params.set(key, value);
              }
            }
            router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
          }}
        >
          <div className="lg:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="q">
              Search
            </label>
            <input className="field mt-2" id="q" name="q" placeholder="castle late, sicilian, focus..." defaultValue={filters.q ?? ""} />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="anchorType">
              Type
            </label>
            <select className="field mt-2" id="anchorType" name="anchorType" defaultValue={filters.anchorType ?? ""}>
              <option value="">All types</option>
              <option value="general">General</option>
              <option value="game">Game</option>
              <option value="move">Move</option>
              <option value="position">Position</option>
              <option value="opening">Opening</option>
              <option value="leak">Leak</option>
              <option value="coach-flow">Coach flow</option>
              <option value="training-card">Training</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="tag">
              Manual tag
            </label>
            <select className="field mt-2" id="tag" name="tag" defaultValue={filters.tag ?? ""}>
              <option value="">All tags</option>
              {filterOptions.tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="opening">
              Opening
            </label>
            <select className="field mt-2" id="opening" name="opening" defaultValue={filters.opening ?? ""}>
              <option value="">All openings</option>
              {filterOptions.openings.map((opening) => (
                <option key={opening} value={opening}>
                  {opening}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="leakKey">
              Leak
            </label>
            <select className="field mt-2" id="leakKey" name="leakKey" defaultValue={filters.leakKey ?? ""}>
              <option value="">All leaks</option>
              {filterOptions.leakOptions.map((leak) => (
                <option key={leak.key} value={leak.key}>
                  {leak.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="focusArea">
              Coach focus
            </label>
            <select className="field mt-2" id="focusArea" name="focusArea" defaultValue={filters.focusArea ?? ""}>
              <option value="">All focus areas</option>
              {filterOptions.focusAreas.map((focusArea) => (
                <option key={focusArea} value={focusArea}>
                  {focusArea}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-muted-strong">
              <input defaultChecked={filters.hasFen === "true"} name="hasFen" type="checkbox" value="true" />
              Has position
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2 lg:col-span-6">
            <button className="btn-primary px-5 py-3 text-sm" type="submit">
              Search notes
            </button>
            <button className="btn-secondary px-5 py-3 text-sm" onClick={() => router.push(pathname)} type="button">
              Clear
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="badge">Results</span>
            <h2 className="panel-title mt-3">{notes.length} notes</h2>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {notes.length ? (
            notes.map((note) => <NoteCard key={note.id} note={note} profileUsername={activeProfile} refreshOnChange />)
          ) : (
            <p className="surface-soft rounded-[20px] p-5 text-sm text-muted-strong">No notes match the current search yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
