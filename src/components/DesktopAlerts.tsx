"use client";

import { useEffect } from "react";

const EVERY_MS = 60 * 1000;

type Alert = { key: string; title: string; body: string; href: string };

/** In the desktop app, shows new and re-nudged Needs-you items as native notifications. */
export function DesktopAlerts() {
  useEffect(() => {
    if (!/Electron\//.test(navigator.userAgent) || typeof Notification === "undefined") return;
    let since = new Date().toISOString();
    const tick = async () => {
      try {
        const res = await fetch(`/api/inbox/alerts?since=${encodeURIComponent(since)}`, { cache: "no-store" });
        if (!res.ok) return;
        const { alerts, now } = (await res.json()) as { alerts: Alert[]; now: string };
        since = now;
        for (const a of alerts) {
          const n = new Notification(a.title, { body: a.body, tag: a.key });
          n.onclick = () => {
            window.focus();
            window.location.href = a.href;
          };
        }
      } catch {
        // Offline: try again next tick.
      }
    };
    const timer = setInterval(() => void tick(), EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  return null;
}
