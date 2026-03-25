import Link from "next/link";

import { NoteCard } from "@/components/note-card";
import { NoteComposerTrigger } from "@/components/note-composer-trigger";
import { getNotesFilterOptions, searchNotes } from "@/lib/services/repository";

export const dynamic = "force-dynamic";

export default async function NotesPage(props: {
  searchParams?: Promise<{
    q?: string;
    anchorType?: string;
    tag?: string;
    opening?: string;
    leakKey?: string;
    focusArea?: string;
    hasFen?: string;
  }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const [notes, filterOptions] = await Promise.all([
    searchNotes({
      q: searchParams.q,
      anchorType: searchParams.anchorType,
      tag: searchParams.tag,
      opening: searchParams.opening,
      leakKey: searchParams.leakKey,
      focusArea: searchParams.focusArea,
      hasFen: searchParams.hasFen,
      limit: 200
    }),
    getNotesFilterOptions()
  ]);

  return (
    <main className="space-y-6">
      <section className="panel space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="badge">Notebook</span>
            <h1 className="mt-3 font-display text-4xl">All notes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Search your own notes across games, moves, openings, leaks, coach flows, and training moments.
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
              refreshOnSave
            />
            <Link className="btn-secondary text-sm" href="/">
              Back to dashboard
            </Link>
          </div>
        </div>

        <form action="/notes" className="surface-soft grid gap-4 p-4 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="q">
              Search
            </label>
            <input className="field mt-2" id="q" name="q" placeholder="castle late, sicilian, focus..." defaultValue={searchParams.q ?? ""} />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="anchorType">
              Type
            </label>
            <select className="field mt-2" id="anchorType" name="anchorType" defaultValue={searchParams.anchorType ?? ""}>
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
            <select className="field mt-2" id="tag" name="tag" defaultValue={searchParams.tag ?? ""}>
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
            <select className="field mt-2" id="opening" name="opening" defaultValue={searchParams.opening ?? ""}>
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
            <select className="field mt-2" id="leakKey" name="leakKey" defaultValue={searchParams.leakKey ?? ""}>
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
            <select className="field mt-2" id="focusArea" name="focusArea" defaultValue={searchParams.focusArea ?? ""}>
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
              <input defaultChecked={searchParams.hasFen === "true"} name="hasFen" type="checkbox" value="true" />
              Has position
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2 lg:col-span-6">
            <button className="btn-primary px-5 py-3 text-sm" type="submit">
              Search notes
            </button>
            <Link className="btn-secondary px-5 py-3 text-sm" href="/notes">
              Clear
            </Link>
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
            notes.map((note) => <NoteCard key={note.id} note={note} refreshOnChange />)
          ) : (
            <p className="surface-soft rounded-[20px] p-5 text-sm text-muted-strong">
              No notes match the current search yet.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
