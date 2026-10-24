"use client";

import { useEffect } from "react";
import { useChartStore } from "@/lib/store/chart-store";

const DEBOUNCE_MS = 3000;

/**
 * Mounted once near the app root. Whenever the saved state changes it sends a copy to
 * /api/backup, which writes it to the project's `backups` folder — browser cleaners wipe
 * localStorage, but not that folder. Only does anything when the app runs on localhost.
 */
export function BackupSync() {
  useEffect(() => {
    const key = useChartStore.persist.getOptions().name!;
    // Start from what's already saved, so merely opening the app (e.g. on freshly wiped
    // storage) doesn't overwrite today's backup with an untouched state
    let lastSent = localStorage.getItem(key);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = useChartStore.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const raw = localStorage.getItem(key);
        if (!raw || raw === lastSent) return;
        lastSent = raw;
        fetch("/api/backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: raw,
        }).catch(() => {});
      }, DEBOUNCE_MS);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return null;
}
