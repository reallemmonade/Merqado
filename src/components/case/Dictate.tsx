"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";

export type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

/** The browser's speech recognizer, where it exists. */
export function speechApi(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Mic button: dictation into a text value, shared by the Ask bar and Notes. */
export function Dictate({ value, onText, className = "ask-tool ask-mic" }: { value: string; onText: (t: string) => void; className?: string }) {
  const supported = useSyncExternalStore(
    () => () => {},
    () => speechApi() !== null,
    () => false,
  );
  const [live, setLive] = useState(false);
  const rec = useRef<Recognition | null>(null);
  if (!supported) return null;
  function toggle() {
    if (live) return rec.current?.stop();
    const Api = speechApi();
    if (!Api) return;
    const r = new Api();
    const start = value ? value.replace(/\s*$/, " ") : "";
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e) => onText(start + Array.from(e.results, (x) => x[0]?.transcript ?? "").join(""));
    r.onend = () => setLive(false);
    rec.current = r;
    r.start();
    setLive(true);
  }
  return (
    <button type="button" className={className} aria-label="Dictate" aria-pressed={live} onClick={toggle}>
      <Icon name="mic" size={18} />
    </button>
  );
}
