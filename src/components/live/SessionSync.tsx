"use client";

import { useEffect } from "react";

const CHANNEL = "merqado-session";

/**
 * Keeps sign-in the same across every open tab and window: signing out in one sends the others
 * to sign-in, and a tab left on the sign-in page moves on once another tab has signed in.
 */
export function SessionSync() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    const onLogin = () => location.pathname === "/login";
    ch.onmessage = (e: MessageEvent<{ type?: string }>) => {
      if (e.data?.type === "out" && !onLogin()) location.reload();
      if (e.data?.type === "in" && onLogin()) location.reload();
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (form?.action && new URL(form.action, location.href).pathname === "/api/auth/logout") ch.postMessage({ type: "out" });
    };
    // A tab on the sign-in page checks when it comes back into view.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !onLogin()) return;
      fetch("/api/auth/status", { cache: "no-store" })
        .then((r) => r.ok && location.reload())
        .catch(() => null);
    };
    // Any signed-in page tells tabs waiting on the sign-in page.
    if (!onLogin()) {
      fetch("/api/auth/status", { cache: "no-store" })
        .then((r) => r.ok && ch.postMessage({ type: "in" }))
        .catch(() => null);
    }
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      ch.close();
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
  return null;
}
