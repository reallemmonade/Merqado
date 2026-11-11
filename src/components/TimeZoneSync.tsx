"use client";

import { useEffect } from "react";

/** Renders nothing. Saves the browser's time zone when it differs from the one on file. */
export function TimeZoneSync({ saved }: { saved: string | null }) {
  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone || timeZone === saved) return;
    fetch("/api/me/time-zone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timeZone }),
    }).catch(() => {});
  }, [saved]);
  return null;
}
