"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";
import { SOURCE_KINDS, type SourceKind } from "@/lib/case/gptSources";

/** Closes a popover on an outside click or Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function SourceFilter({ kinds, onChange }: { kinds: SourceKind[]; onChange: (k: SourceKind[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const on = (k: SourceKind) => kinds.length === 0 || kinds.includes(k);
  function toggle(k: SourceKind) {
    const cur = kinds.length ? kinds : SOURCE_KINDS.map((s) => s.kind);
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    onChange(next.length === SOURCE_KINDS.length ? [] : next);
  }
  return (
    <div className="pop-wrap" ref={ref}>
      <button type="button" className="ask-tool" aria-label="Sources" aria-expanded={open} aria-pressed={kinds.length > 0} onClick={() => setOpen((o) => !o)}>
        <Icon name="filter" size={16} />
        {kinds.length > 0 && <span className="ask-count">{kinds.length}</span>}
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="pop-menu pop-up" role="menu">
          {SOURCE_KINDS.map((s) => (
            <button key={s.kind} type="button" role="menuitemcheckbox" aria-checked={on(s.kind)} onClick={() => toggle(s.kind)}>
              <span className="pop-check">{on(s.kind) && <Icon name="check" size={14} />}</span>
              {s.label}
            </button>
          ))}
          {kinds.length > 0 && (
            <button type="button" role="menuitem" className="pop-reset" onClick={() => onChange([])}>
              All
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null };

function speechApi(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Dictation into the ask box, where the browser supports it. */
function Mic({ value, onText }: { value: string; onText: (t: string) => void }) {
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
    <button type="button" className="ask-tool ask-mic" aria-label="Dictate" aria-pressed={live} onClick={toggle}>
      <Icon name="mic" size={18} />
    </button>
  );
}

/** The case GPT's ask box: question, source filter, dictation and send. */
export function GptAsk({
  name,
  value,
  onChange,
  onSubmit,
  disabled,
  kinds,
  onKinds,
  autoFocus,
  rows = 2,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  kinds: SourceKind[];
  onKinds: (k: SourceKind[]) => void;
  autoFocus?: boolean;
  rows?: number;
}) {
  return (
    <form
      className="ask-box"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() && !disabled) onSubmit();
      }}
    >
      <label htmlFor="gpt-input" className="sr-only">
        Ask {name}
      </label>
      <textarea
        id="gpt-input"
        rows={rows}
        value={value}
        placeholder={`Ask ${name}`}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="ask-row">
        <SourceFilter kinds={kinds} onChange={onKinds} />
        <span style={{ flex: 1 }} />
        <Mic value={value} onText={onChange} />
        <button type="submit" className="ask-send" aria-label={`Ask ${name}`} disabled={disabled || !value.trim()}>
          <Icon name="up" size={18} />
        </button>
      </div>
    </form>
  );
}

/** Who can see the chat: the whole case team, or only you. */
export function ScopeMenu({ shared, onChange, disabled }: { shared: boolean; onChange: (shared: boolean) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const opts = [
    { v: true, label: "Team", icon: "team" as const },
    { v: false, label: "Only me", icon: "lock" as const },
  ];
  const cur = opts.find((o) => o.v === shared)!;
  return (
    <div className="pop-wrap scope" ref={ref}>
      <button type="button" className="scope-btn" aria-expanded={open} aria-haspopup="menu" disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <Icon name={cur.icon} size={16} />
        {cur.label}
        <Icon name="chevron" size={14} />
      </button>
      {open && (
        <div className="pop-menu pop-right" role="menu">
          {opts.map((o) => (
            <button
              key={o.label}
              type="button"
              role="menuitemradio"
              aria-checked={o.v === shared}
              onClick={() => {
                setOpen(false);
                if (o.v !== shared) onChange(o.v);
              }}
            >
              <Icon name={o.icon} size={16} />
              <span style={{ flex: 1 }}>{o.label}</span>
              <span className="pop-check">{o.v === shared && <Icon name="check" size={14} />}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function partOfDay(h: number) {
  return h < 5 ? "evening" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

/** "Good evening, Maxam" in the viewer's own time of day. */
export function Greeting({ first }: { first: string }) {
  const part = useSyncExternalStore(
    () => () => {},
    () => partOfDay(new Date().getHours()),
    () => "",
  );
  return (
    <h1 className="gpt-hello" style={{ visibility: part ? "visible" : "hidden" }}>
      Good {part || "day"}
      {first ? (
        <>
          , <strong>{first}</strong>
        </>
      ) : null}
    </h1>
  );
}
