"use client";

import { useState, useSyncExternalStore } from "react";
import { setWakeWord, wakeWordOn } from "./WakeWord";

/** Settings switch for the "Hey AtlasGPT" wake phrase. Off by default. */
export function WakeWordSetting() {
  const on = useSyncExternalStore(
    (cb) => {
      window.addEventListener("merqado:wake-word", cb);
      return () => window.removeEventListener("merqado:wake-word", cb);
    },
    () => wakeWordOn(),
    () => false,
  );
  const [supported] = useState(() => typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window));
  if (!supported) return null;
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <strong>Hey AtlasGPT</strong>
      <input type="checkbox" role="switch" aria-label="Hey AtlasGPT" checked={on} onChange={(e) => setWakeWord(e.target.checked)} />
    </label>
  );
}
