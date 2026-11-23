"use client";

import { useEffect, useRef, useState } from "react";
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

/** The desktop app's browser has a recognizer object that never returns words, so it doesn't count. */
const isDesktopApp = () => typeof navigator !== "undefined" && /Electron\//.test(navigator.userAgent);

/** The browser's speech recognizer, where it exists and works. */
export function speechApi(): (new () => Recognition) | null {
  if (typeof window === "undefined" || isDesktopApp()) return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let serverOn: Promise<boolean> | null = null;
/** Whether the server can turn recorded audio into text (checked once per page load). */
function serverTranscribe(): Promise<boolean> {
  serverOn ??= fetch("/api/transcribe")
    .then((r) => r.json())
    .then((d: { enabled?: boolean }) => Boolean(d.enabled))
    .catch(() => false);
  return serverOn;
}

type Mode = "browser" | "record" | null;

/** Mic button: dictation into a text value, shared by the Ask bars and Notes. */
export function Dictate({ value, onText, className = "ask-tool ask-mic" }: { value: string; onText: (t: string) => void; className?: string }) {
  const [mode, setMode] = useState<Mode>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (speechApi()) return setMode("browser");
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) return;
    let off = false;
    serverTranscribe().then((on) => !off && on && setMode("record"));
    return () => {
      off = true;
    };
  }, []);

  if (!mode) return null;
  const start = value ? value.replace(/\s*$/, " ") : "";

  function browserToggle() {
    if (live) return rec.current?.stop();
    const Api = speechApi();
    if (!Api) return;
    const r = new Api();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e) => onText(start + Array.from(e.results, (x) => x[0]?.transcript ?? "").join(""));
    r.onend = () => setLive(false);
    rec.current = r;
    r.start();
    setLive(true);
  }

  async function recordToggle() {
    if (live) return recorder.current?.stop();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (!stream) return;
    const chunks: Blob[] = [];
    const m = new MediaRecorder(stream);
    m.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    m.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setLive(false);
      const blob = new Blob(chunks, { type: m.mimeType || "audio/webm" });
      if (!blob.size) return;
      setBusy(true);
      const body = new FormData();
      body.append("audio", new File([blob], "speech.webm", { type: blob.type }));
      const res = await fetch("/api/transcribe", { method: "POST", body }).catch(() => null);
      const data = res?.ok ? ((await res.json()) as { text?: string }) : null;
      setBusy(false);
      if (data?.text) onText(start + data.text);
    };
    recorder.current = m;
    m.start();
    setLive(true);
  }

  return (
    <button
      type="button"
      className={className}
      aria-label="Dictate"
      aria-pressed={live}
      disabled={busy}
      onClick={mode === "browser" ? browserToggle : recordToggle}
    >
      <Icon name="mic" size={18} />
    </button>
  );
}
