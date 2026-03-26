"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { ProfileIcon } from "@/components/app-icons";
import { getStoredActiveProfile, listSavedProfiles, setStoredActiveProfile, touchProfileShortcut } from "@/lib/client/private-store";

type SavedProfile = {
  username: string;
  savedAt: number;
  lastOpenedAt: number;
};

type ActiveProfileSummary = {
  username: string;
  name?: string;
  avatar?: string;
  title?: string;
  followers?: number;
  totals: {
    games: number;
    analyzedGames: number;
    weaknessCount: number;
  };
};

export function ProfileSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [activeUsername, setActiveUsername] = useState<string | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [activeSummary, setActiveSummary] = useState<ActiveProfileSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadProfiles() {
      const [saved, active] = await Promise.all([listSavedProfiles(), Promise.resolve(getStoredActiveProfile())]);
      if (cancelled) {
        return;
      }
      setSavedProfiles(saved);
      setActiveUsername(active);
    }

    void loadProfiles();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeUsername) {
      setActiveSummary(null);
      return;
    }

    const username = activeUsername;

    let cancelled = false;

    async function loadSummary() {
      try {
        const response = await fetch(`/api/public/profiles/${encodeURIComponent(username)}`, {
          cache: "no-store"
        });
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          player?: {
            username: string;
            name?: string;
            avatar?: string;
            title?: string;
            followers?: number;
          } | null;
          snapshot?: {
            totals?: {
              games: number;
              analyzedGames: number;
              weaknessCount: number;
            };
          };
        };

        if (cancelled || !response.ok || payload.ok === false) {
          return;
        }

        setActiveSummary({
          username,
          name: payload.player?.name,
          avatar: payload.player?.avatar,
          title: payload.player?.title,
          followers: payload.player?.followers,
          totals: {
            games: payload.snapshot?.totals?.games ?? 0,
            analyzedGames: payload.snapshot?.totals?.analyzedGames ?? 0,
            weaknessCount: payload.snapshot?.totals?.weaknessCount ?? 0
          }
        });
      } catch {
        if (!cancelled) {
          setActiveSummary(null);
        }
      }
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [activeUsername]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const visibleProfiles = useMemo(
    () => savedProfiles.filter((profile) => profile.username !== activeUsername).slice(0, 5),
    [activeUsername, savedProfiles]
  );

  function switchProfile(username: string) {
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/public/profiles/${encodeURIComponent(username)}`, {
          method: "POST"
        });
        const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!response.ok || payload.ok === false) {
          setNotice(payload.error || "Could not switch profile.");
          return;
        }

        setStoredActiveProfile(username);
        await touchProfileShortcut(username);
        const saved = await listSavedProfiles();
        setSavedProfiles(saved);
        setActiveUsername(username);
        setIsOpen(false);
        router.refresh();
      } catch {
        setNotice("Could not switch profile.");
      }
    });
  }

  const currentLabel = activeUsername || "Choose profile";

  const avatarFallback = (activeSummary?.username || currentLabel || "P")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <div className="relative hidden sm:block">
        <button
          className={`profile-switcher-trigger ${isOpen ? "profile-switcher-trigger-active" : ""}`}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          {activeSummary?.avatar ? (
            <img alt="" className="profile-switcher-avatar" src={activeSummary.avatar} />
          ) : (
            <span className="profile-switcher-icon">
              {activeUsername ? <span className="profile-switcher-avatar-fallback">{avatarFallback}</span> : <ProfileIcon className="h-4 w-4" />}
            </span>
          )}
          <span className="profile-switcher-copy">
            <span className="profile-switcher-label">Active profile</span>
            <span className="profile-switcher-name">{currentLabel}</span>
          </span>
        </button>

        {isOpen ? (
          <>
            <button
              aria-label="Close profile switcher"
              className="fixed inset-0 z-30"
              onClick={() => setIsOpen(false)}
              type="button"
            />
            <div className="profile-switcher-panel">
              <div className="profile-switcher-summary">
                {activeSummary?.avatar ? (
                  <img alt="" className="profile-switcher-summary-avatar" src={activeSummary.avatar} />
                ) : (
                  <div className="profile-switcher-summary-avatar profile-switcher-summary-avatar-fallback">
                    {activeUsername ? avatarFallback : <ProfileIcon className="h-5 w-5" />}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Active profile</p>
                  <p className="truncate text-lg font-semibold text-[color:var(--text)]">
                    {activeUsername || "No profile selected yet"}
                  </p>
                  {activeSummary?.name || activeSummary?.title ? (
                    <p className="truncate text-sm text-muted-strong">
                      {[activeSummary.title, activeSummary.name].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted">
                    {activeSummary?.followers ? `${activeSummary.followers.toLocaleString()} followers on Chess.com` : ""}
                  </p>
                </div>
              </div>

              <div className="profile-switcher-stat-grid">
                <div className="profile-switcher-stat">
                  <span className="profile-switcher-stat-label">Games</span>
                  <span className="profile-switcher-stat-value">{activeSummary?.totals.games ?? 0}</span>
                </div>
                <div className="profile-switcher-stat">
                  <span className="profile-switcher-stat-label">Analyzed</span>
                  <span className="profile-switcher-stat-value">{activeSummary?.totals.analyzedGames ?? 0}</span>
                </div>
                <div className="profile-switcher-stat">
                  <span className="profile-switcher-stat-label">Leaks</span>
                  <span className="profile-switcher-stat-value">{activeSummary?.totals.weaknessCount ?? 0}</span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted">
                  {activeUsername
                    ? "Switching keeps you on this page and reloads it for the new profile."
                    : "Pick a profile from the dashboard control room first."}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Saved profiles</p>
                {visibleProfiles.length ? (
                  visibleProfiles.map((profile) => (
                    <button
                      key={profile.username}
                      className="profile-switcher-item"
                      disabled={isPending}
                      onClick={() => switchProfile(profile.username)}
                      type="button"
                    >
                      <span>{profile.username}</span>
                      <span className="text-xs text-muted">Switch</span>
                    </button>
                  ))
                ) : (
                  <p className="surface-soft rounded-[18px] px-4 py-3 text-sm text-muted-strong">
                    No other saved profiles on this device yet.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Link className="btn-primary w-full text-sm" href="/#control-room" onClick={() => setIsOpen(false)}>
                  Find another profile
                </Link>
              </div>

              {notice ? <p className="text-sm text-[color:var(--error-text)]">{notice}</p> : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="sm:hidden">
        <button className="profile-switcher-mobile-trigger" onClick={() => setIsOpen(true)} type="button">
          {activeSummary?.avatar ? (
            <img alt="" className="profile-switcher-mobile-avatar" src={activeSummary.avatar} />
          ) : (
            <span className="profile-switcher-mobile-avatar profile-switcher-summary-avatar-fallback">
              {activeUsername ? avatarFallback : <ProfileIcon className="h-4 w-4" />}
            </span>
          )}
          <span>{currentLabel}</span>
        </button>
      </div>

      {isOpen ? (
        <div className="profile-switcher-mobile-sheet sm:hidden">
          <button className="profile-switcher-mobile-backdrop" onClick={() => setIsOpen(false)} type="button" />
          <div className="profile-switcher-mobile-panel">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Active profile</p>
                <p className="mt-1 text-lg font-semibold text-[color:var(--text)]">{activeUsername || "Choose profile"}</p>
                {activeSummary?.name || activeSummary?.title ? (
                  <p className="mt-1 truncate text-sm text-muted-strong">
                    {[activeSummary.title, activeSummary.name].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>
              <button className="btn-secondary px-3 py-2 text-xs" onClick={() => setIsOpen(false)} type="button">
                Close
              </button>
            </div>

            <div className="mt-4 profile-switcher-stat-grid">
              <div className="profile-switcher-stat">
                <span className="profile-switcher-stat-label">Games</span>
                <span className="profile-switcher-stat-value">{activeSummary?.totals.games ?? 0}</span>
              </div>
              <div className="profile-switcher-stat">
                <span className="profile-switcher-stat-label">Analyzed</span>
                <span className="profile-switcher-stat-value">{activeSummary?.totals.analyzedGames ?? 0}</span>
              </div>
              <div className="profile-switcher-stat">
                <span className="profile-switcher-stat-label">Leaks</span>
                <span className="profile-switcher-stat-value">{activeSummary?.totals.weaknessCount ?? 0}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Saved profiles</p>
              {visibleProfiles.length ? (
                visibleProfiles.map((profile) => (
                  <button
                    key={profile.username}
                    className="profile-switcher-item"
                    disabled={isPending}
                    onClick={() => switchProfile(profile.username)}
                    type="button"
                  >
                    <span>{profile.username}</span>
                    <span className="text-xs text-muted">Switch</span>
                  </button>
                ))
              ) : (
                <p className="surface-soft rounded-[18px] px-4 py-3 text-sm text-muted-strong">
                  Save profiles from the dashboard, then they will appear here for quick switching.
                </p>
              )}
            </div>

            <div className="mt-4">
              <Link className="btn-primary w-full text-sm" href="/#control-room" onClick={() => setIsOpen(false)}>
                Find another profile
              </Link>
            </div>

            {notice ? <p className="mt-3 text-sm text-[color:var(--error-text)]">{notice}</p> : null}
            {pathname ? <p className="mt-3 text-xs text-muted">Current page stays open when the profile changes.</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
