"use client";

import { useSyncExternalStore } from "react";
import { speechApi } from "./Dictate";
import { setWakeWord, wakeWordOn } from "./WakeWord";

/** Settings switch for the "Hey <case GPT>" wake phrase. Off by default. */
export function WakeWordSetting() {
  const on = useSyncExternalStore(
    (cb) => {
      window.addEventListener("merqado:wake-word", cb);
      return () => window.removeEventListener("merqado:wake-word", cb);
    },
    () => wakeWordOn(),
    () => false,
  );
  const supported = useSyncExternalStore(
    () => () => {},
    () => speechApi() !== null,
    () => false,
  );
  if (!supported) return null;
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <strong>Wake phrase</strong>
      <input type="checkbox" role="switch" aria-label="Wake phrase" checked={on} onChange={(e) => setWakeWord(e.target.checked)} />
    </label>
  );
}
