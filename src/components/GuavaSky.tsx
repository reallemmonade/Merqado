"use client";

import { useEffect, useState } from "react";
import type { Prefs } from "@/lib/prefs";
import { GUAVA_PREFS_EVENT, applyGuava } from "@/lib/guava/apply";

/**
 * The Guava sky behind every page. Refreshes every 5 minutes and when the window comes back to the front.
 * In Normal style the sky never runs; System mode follows the device's light or dark setting live.
 */
export function GuavaSky({ initial }: { initial: Prefs }) {
  const [guava, setGuava] = useState(initial.guava);

  useEffect(() => {
    const onPrefs = (e: Event) => setGuava((e as CustomEvent<Prefs>).detail.guava);
    window.addEventListener(GUAVA_PREFS_EVENT, onPrefs);
    return () => window.removeEventListener(GUAVA_PREFS_EVENT, onPrefs);
  }, []);

  useEffect(() => {
    const paint = () => applyGuava(guava);
    paint();
    if (guava.style === "normal") {
      const mq = matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", paint);
      return () => mq.removeEventListener("change", paint);
    }
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
  }, [guava]);

  return (
    <div id="backdrop" aria-hidden="true">
      <i className="sun" />
    </div>
  );
}
