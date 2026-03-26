"use client";

import { useEffect } from "react";

import { importLegacyPrivateBootstrap, isMigrationDone } from "@/lib/client/private-store";

export function PrivateProfileBootstrap(props: { username?: string | null }) {
  useEffect(() => {
    if (!props.username) {
      return;
    }

    let cancelled = false;

    async function run() {
      const done = await isMigrationDone(props.username!);
      if (done || cancelled) {
        return;
      }

      const response = await fetch(`/api/private/bootstrap?username=${encodeURIComponent(props.username!)}`, {
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        migrated?: boolean;
        payload?: Parameters<typeof importLegacyPrivateBootstrap>[1];
      };

      if (cancelled || !response.ok || payload.ok === false) {
        return;
      }

      await importLegacyPrivateBootstrap(props.username!, payload.payload ?? null);
      window.dispatchEvent(new CustomEvent("notes-updated"));
      window.dispatchEvent(new CustomEvent("favorites-updated"));
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [props.username]);

  return null;
}
