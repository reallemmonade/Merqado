"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ACCENTS,
  CASE_MENUS,
  PREFS_COOKIE,
  SIDEBARS,
  TEXT_SIZES,
  THEMES,
  htmlAttrs,
  serializePrefs,
  type GuavaPrefs,
  type Prefs,
} from "@/lib/prefs";
import { GUAVA_AT_EVENT, GUAVA_CITIES, GUAVA_PREFS_EVENT, computeGuava } from "@/lib/guava/apply";
import { FONTS, LOOKS, fmtHour, sunTimes } from "@/lib/guava/sky";

const LABELS: Record<string, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
  guava: "Guava",
  small: "Small",
  default: "Default",
  large: "Large",
  auto: "Collapse in sections",
  full: "Always full",
  icons: "Always icons",
  blue: "Blue",
  green: "Green",
  teal: "Teal",
  violet: "Violet",
  orange: "Orange",
  rose: "Rose",
};

type SegKey = Exclude<keyof Prefs, "guava">;

function Seg<K extends SegKey>({
  label,
  name,
  options,
  prefs,
  set,
}: {
  label: string;
  name: K;
  options: readonly Prefs[K][];
  prefs: Prefs;
  set: (name: K, value: Prefs[K]) => void;
}) {
  return (
    <div className="setting">
      <span className="setting-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={prefs[name] === o} onClick={() => set(name, o)}>
            {LABELS[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Appearance and layout choices; each change applies at once and is kept in a cookie. */
export function SettingsForm({ initial }: { initial: Prefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);

  function set<K extends keyof Prefs>(name: K, value: Prefs[K]) {
    const next = { ...prefs, [name]: value };
    setPrefs(next);
    document.cookie = `${PREFS_COOKIE}=${serializePrefs(next)}; path=/; max-age=31536000; samesite=lax`;
    const root = document.documentElement;
    for (const [attr, v] of Object.entries(htmlAttrs(next))) {
      if (attr === "data-theme" && v === undefined) {
        root.setAttribute(attr, matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      } else if (v !== undefined) {
        root.setAttribute(attr, v);
      }
    }
    window.dispatchEvent(new CustomEvent(GUAVA_PREFS_EVENT, { detail: next }));
    if (name === "caseMenu") router.refresh();
  }

  return (
    <>
      <section className="card">
        <h2 style={{ fontSize: 18 }}>Appearance</h2>
        <Seg label="Theme" name="theme" options={THEMES} prefs={prefs} set={set} />
        {prefs.theme === "guava" && <GuavaSettings value={prefs.guava} onChange={(g) => set("guava", g)} />}
        {prefs.theme !== "guava" && (
        <div className="setting">
          <span className="setting-label">Accent</span>
          <div className="swatches" role="radiogroup" aria-label="Accent">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={prefs.accent === a}
                aria-label={LABELS[a]}
                title={LABELS[a]}
                className={`swatch swatch-${a}`}
                onClick={() => set("accent", a)}
              />
            ))}
          </div>
        </div>
        )}
        {prefs.theme !== "guava" && <Seg label="Sidebar" name="sidebar" options={SIDEBARS} prefs={prefs} set={set} />}
        <Seg label="Text size" name="text" options={TEXT_SIZES} prefs={prefs} set={set} />
      </section>
      <section className="card">
        <h2 style={{ fontSize: 18 }}>Layout</h2>
        <Seg label="Case menu" name="caseMenu" options={CASE_MENUS} prefs={prefs} set={set} />
      </section>
    </>
  );
}

type Look = { id: GuavaPrefs["look"]; label: string; gradient: string[] };
type Font = { label: string; family: string; fallback: string; google: string };
const GUAVA_FONT_LIST = Object.entries(FONTS as Record<GuavaPrefs["font"], Font>) as [GuavaPrefs["font"], Font][];
const MARKS = ["12am", "6am", "Noon", "6pm", "12am"];

function previewAt(at: number | null) {
  window.dispatchEvent(new CustomEvent(GUAVA_AT_EVENT, { detail: at }));
}

/** Guava: look, text, change through the day / stick to, Play the day, city. */
function GuavaSettings({ value, onChange }: { value: GuavaPrefs; onChange: (g: GuavaPrefs) => void }) {
  const [at, setAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const spring = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef(0);
  const now = computeGuava(value, at);
  const shown = computeGuava(value, at ?? (value.cycle ? null : value.freeze));
  const sun = sunTimes(now.place, new Date()) as { rise: number | null; set: number | null; polar?: string };

  useEffect(() => {
    // Font samples on the Text cards.
    const id = "guava-font-all";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${GUAVA_FONT_LIST.map(([, f]) => f.google).join("&")}&display=swap`;
    document.head.appendChild(link);
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    clearTimeout(spring.current);
    previewAt(null);
  }, []);

  function show(h: number | null) {
    setAt(h);
    previewAt(h);
  }

  function stop() {
    cancelAnimationFrame(frame.current);
    setPlaying(false);
    show(null);
  }

  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function play() {
    if (playing) return stop();
    clearTimeout(spring.current);
    const from = shown.localHour;
    const t0 = performance.now();
    setPlaying(true);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 9000);
      show((from + k * 24) % 24);
      if (k < 1) frame.current = requestAnimationFrame(step);
      else stop();
    };
    frame.current = requestAnimationFrame(step);
  }

  function slide(h: number) {
    if (playing) {
      cancelAnimationFrame(frame.current);
      setPlaying(false);
    }
    clearTimeout(spring.current);
    if (value.cycle) {
      show(h);
    } else {
      onChange({ ...value, freeze: h });
    }
  }

  function release() {
    if (!value.cycle) return;
    clearTimeout(spring.current);
    spring.current = setTimeout(() => show(null), 1500);
  }

  return (
    <>
      <div className="setting-stack">
        <span className="setting-label">Look</span>
        <div className="looks" role="radiogroup" aria-label="Look">
          {(LOOKS as Look[]).map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={value.look === l.id}
              className="look"
              onClick={() => onChange({ ...value, look: l.id })}
            >
              <i className="look-sky" style={{ background: `linear-gradient(135deg, ${l.gradient.join(", ")})` }} />
              <b>{l.label}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="setting-stack">
        <span className="setting-label">Text</span>
        <div className="looks" role="radiogroup" aria-label="Text">
          {GUAVA_FONT_LIST.map(([id, f]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={value.font === id}
              className="look"
              style={{ fontFamily: `"${f.family}", ${f.fallback}` }}
              onClick={() => onChange({ ...value, font: id })}
            >
              <span className="look-aa">Aa</span>
              <b>{f.label}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="setting">
        <span className="setting-label" id="guava-cycle">Change through the day</span>
        <button
          type="button"
          role="switch"
          className="switch"
          aria-labelledby="guava-cycle"
          aria-checked={value.cycle}
          onClick={() => {
            show(null);
            onChange({ ...value, cycle: !value.cycle, freeze: value.cycle ? Math.round(now.localHour * 4) / 4 : value.freeze });
          }}
        />
      </div>
      <div className="setting-stack">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="setting-label">{value.cycle ? "Preview a time" : "Stick to"}</span>
          <span className="tl-read">
            {fmtHour(shown.localHour)} · {shown.moment}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="small" onClick={play}>
            {playing ? "Stop" : "Play the day"}
          </button>
        </div>
        <div className="timeline">
          <input
            type="range"
            min={0}
            max={23.75}
            step={0.25}
            aria-label={value.cycle ? "Preview a time" : "Stick to"}
            value={Math.round(shown.localHour * 4) / 4}
            onChange={(e) => slide(Number(e.target.value))}
            onPointerUp={release}
            onKeyUp={release}
          />
          <div className="tl-marks" aria-hidden="true">
            {MARKS.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="setting">
        <span className="setting-label">City</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="muted">
            {sun.rise != null && sun.set != null ? `Sunrise ${fmtHour(sun.rise)} · Sunset ${fmtHour(sun.set)}` : ""}
          </span>
          <select aria-label="City" value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })}>
            <option value="">{`${now.place.name} (time zone)`}</option>
            {GUAVA_CITIES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}
