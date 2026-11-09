"use client";

import { useEffect, useState } from "react";
import type { Prefs } from "@/lib/prefs";
import { GUAVA_AT_EVENT, GUAVA_PREFS_EVENT, applyGuava, clearGuava } from "@/lib/guava/apply";

/** The Guava sky behind every page when the Guava theme is on. Refreshes every 5 minutes and on return. */
export function GuavaSky({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [at, setAt] = useState<number | null>(null);
  const on = prefs.theme === "guava";

  useEffect(() => {
    const onPrefs = (e: Event) => setPrefs((e as CustomEvent<Prefs>).detail);
    const onAt = (e: Event) => setAt((e as CustomEvent<number | null>).detail);
    window.addEventListener(GUAVA_PREFS_EVENT, onPrefs);
    window.addEventListener(GUAVA_AT_EVENT, onAt);
    return () => {
      window.removeEventListener(GUAVA_PREFS_EVENT, onPrefs);
      window.removeEventListener(GUAVA_AT_EVENT, onAt);
    };
  }, []);

  useEffect(() => {
    if (!on) {
      clearGuava();
      return;
    }
    const paint = () => applyGuava(prefs.guava, at);
    paint();
    const timer = setInterval(paint, 5 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") paint();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", paint);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", paint);
    };
  }, [on, prefs.guava, at]);

  useEffect(() => {
    document.documentElement.classList.toggle("guava-playing", at != null);
  }, [at]);

  if (!on) return null;
  return (
    <div id="backdrop" aria-hidden="true">
      <i className="sun" />
    </div>
  );
}
