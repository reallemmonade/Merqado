"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { speechApi } from "./Dictate";

const KEY = "merqado.wakeWord";

/** Settings toggle value, kept per device. Off until the user turns it on. */
export function wakeWordOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setWakeWord(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private window: the setting simply won't stick */
  }
  window.dispatchEvent(new Event("merqado:wake-word"));
}

/**
 * Listens for "Hey <name>" only when the user has opted in. Says nothing on screen;
 * on a match it opens the case GPT and focuses its Ask box.
 */
export function WakeWord({ engagementId, name }: { engagementId: string; name: string }) {
  const router = useRouter();
  useEffect(() => {
    const Api = speechApi();
    if (!Api) return;
    let rec: { stop(): void } | null = null;
    let stopped = false;
    const phrase = `hey ${name.toLowerCase()}`;
    const start = () => {
      if (rec || !wakeWordOn()) return;
      const r = new Api();
      r.lang = navigator.language || "en-US";
      r.interimResults = false;
      r.continuous = true;
      r.onresult = (e) => {
        const heard = Array.from(e.results, (x) => x[0]?.transcript ?? "").join(" ").toLowerCase();
        if (!heard.includes(phrase)) return;
        r.stop();
        rec = null;
        router.push(`/e/${engagementId}/gpt#ask`);
      };
      r.onend = () => {
        rec = null;
        if (!stopped && wakeWordOn()) setTimeout(start, 500);
      };
      rec = r;
      try {
        r.start();
      } catch {
        rec = null;
      }
    };
    const onToggle = () => {
      if (!wakeWordOn()) {
        stopped = false;
        rec?.stop();
      } else start();
    };
    window.addEventListener("merqado:wake-word", onToggle);
    start();
    return () => {
      stopped = true;
      window.removeEventListener("merqado:wake-word", onToggle);
      rec?.stop();
    };
  }, [engagementId, name, router]);
  return null;
}
