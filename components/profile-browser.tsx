"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  getStoredActiveProfile,
  listSavedProfiles,
  removeProfileShortcut,
  saveProfileShortcut,
  setStoredActiveProfile,
  touchProfileShortcut
} from "@/lib/client/private-store";

type PublicProfile = {
  username: string;
  updatedAt: number;
  source?: "chesscom" | "known";
};

export function ProfileBrowser(props: { activeUsername?: string | null; embedded?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [savedProfiles, setSavedProfiles] = useState<Array<{ username: string; savedAt: number; lastOpenedAt: number }>>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void listSavedProfiles().then((items) => {
      if (!cancelled) {
        setSavedProfiles(items);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function activate(username: string, save = false) {
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/public/profiles/${encodeURIComponent(username)}`, {
          method: "POST"
        });
        const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!response.ok || payload.ok === false) {
          setNotice(payload.error || "Could not activate profile.");
          return;
        }
        setStoredActiveProfile(username);
        if (save) {
          await saveProfileShortcut(username);
          setSavedProfiles(await listSavedProfiles());
        } else {
          await touchProfileShortcut(username);
        }
        router.refresh();
      } catch {
        setNotice("Could not activate profile.");
      }
    });
  }

  function searchProfiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      setHasSearched(false);
      setResults([]);
      setNotice("Type a Chess.com username first.");
      return;
    }

    setNotice(null);
    setHasSearched(true);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/public/profiles/search?q=${encodeURIComponent(normalized)}`, {
          cache: "no-store"
        });
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          profiles?: PublicProfile[];
        };

        if (!response.ok || payload.ok === false) {
          setResults([]);
          setNotice(payload.error || "Could not search Chess.com profiles.");
          return;
        }

        setResults(payload.profiles ?? []);
        if (!(payload.profiles ?? []).length) {
          setNotice("No Chess.com profile found for that username.");
        }
      } catch {
        setResults([]);
        setNotice("Could not search Chess.com profiles.");
      }
    });
  }

  const active = props.activeUsername ?? getStoredActiveProfile() ?? null;

  return (
    <section className={props.embedded ? "surface-soft rounded-[24px] p-5" : "surface-card p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="badge">Step 1</span>
          <h2 className="mt-3 font-display text-2xl">Choose the profile you want to coach</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Enter the exact Chess.com username you want to work on, open it, and optionally save it on this device.
            Public games and engine analysis live on the server per profile. Your saved shortcuts stay private in this
            browser.
          </p>
        </div>
        {active ? (
          <div className="surface-soft rounded-[18px] px-4 py-3 text-sm text-muted-strong">
            Active public profile
            <p className="mt-1 font-semibold text-[color:var(--text)]">{active}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
        <div className="space-y-3">
          <form className="space-y-3" onSubmit={searchProfiles}>
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted" htmlFor="profile-search">
              Exact Chess.com username
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="profile-search"
                className="field"
                placeholder="For example: hikaru"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setNotice(null);
                  if (!event.target.value.trim()) {
                    setHasSearched(false);
                    setResults([]);
                  }
                }}
              />
              <button className="btn-primary w-full sm:w-auto" disabled={isPending} type="submit">
                {isPending ? "Opening..." : "Open username"}
              </button>
            </div>
            <p className="text-xs text-muted">
              This lookup checks the exact public Chess.com username. It does not search broadly across similar names.
            </p>
          </form>
          <div className="space-y-2">
            {results.length ? (
              results.map((profile) => (
                <div key={profile.username} className="surface-soft flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-semibold">{profile.username}</p>
                    <p className="text-xs text-muted">
                      {profile.source === "chesscom" ? "Found on Chess.com" : "Already known in ChessMe"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary text-xs" disabled={isPending} onClick={() => void activate(profile.username)} type="button">
                      Open
                    </button>
                    <button className="btn-primary text-xs" disabled={isPending} onClick={() => void activate(profile.username, true)} type="button">
                      Save
                    </button>
                  </div>
                </div>
              ))
            ) : hasSearched ? (
              <p className="surface-soft rounded-[18px] p-4 text-sm text-muted-strong">
                No Chess.com profile matched that exact username.
              </p>
            ) : (
              <p className="surface-soft rounded-[18px] p-4 text-sm text-muted-strong">
                Search a Chess.com username to open it and make it your active training workspace.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Saved on this device</p>
          {savedProfiles.length ? (
            savedProfiles.map((profile) => (
              <div key={profile.username} className="surface-soft flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-semibold">{profile.username}</p>
                  <p className="text-xs text-muted">Private shortcut</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary text-xs" disabled={isPending} onClick={() => void activate(profile.username)} type="button">
                    Open
                  </button>
                  <button
                    className="btn-ghost text-xs text-[color:var(--error-text)]"
                    onClick={() => {
                      void removeProfileShortcut(profile.username).then(async () => {
                        setSavedProfiles(await listSavedProfiles());
                      });
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="surface-soft rounded-[18px] p-4 text-sm text-muted-strong">No saved profiles on this device yet.</p>
          )}
        </div>
      </div>

      {notice ? <p className="mt-3 text-sm text-[color:var(--error-text)]">{notice}</p> : null}
    </section>
  );
}
