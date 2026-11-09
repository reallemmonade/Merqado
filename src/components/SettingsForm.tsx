"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CASE_MENUS, PREFS_COOKIE, TEXT_SIZES, serializePrefs, type GuavaCity, type GuavaPrefs, type Prefs } from "@/lib/prefs";
import { GUAVA_CITIES, GUAVA_PREFS_EVENT, computeGuava, htmlVars, type GuavaResult } from "@/lib/guava/apply";
import { FONTS, LOOKS, fmtHour, sunTimes } from "@/lib/guava/sky";

const LABELS: Record<string, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
  auto: "Collapse in sections",
  full: "Always full",
  icons: "Always icons",
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
    document.documentElement.setAttribute("data-text", next.text);
    window.dispatchEvent(new CustomEvent(GUAVA_PREFS_EVENT, { detail: next }));
    if (name === "caseMenu") router.refresh();
  }

  return (
    <>
      <section className="card">
        <h2 style={{ fontSize: 18 }}>Appearance</h2>
        <Appearance value={prefs.guava} onChange={(g) => set("guava", g)} />
        <Seg label="Text size" name="text" options={TEXT_SIZES} prefs={prefs} set={set} />
      </section>
      <section className="card">
        <h2 style={{ fontSize: 18 }}>Layout</h2>
        <Seg label="Case menu" name="caseMenu" options={CASE_MENUS} prefs={prefs} set={set} />
      </section>
    </>
  );
}

type Look = { id: GuavaPrefs["look"]; label: string };
type Font = { label: string; family: string; fallback: string; google: string };
const FONT_LIST = Object.entries(FONTS as Record<GuavaPrefs["font"], Font>) as [GuavaPrefs["font"], Font][];
const MARKS: [number, string][] = [
  [0, "12am"],
  [6, "6am"],
  [12, "Noon"],
  [18, "6pm"],
  [24, "12am"],
];

type Sun = { rise: number | null; set: number | null; noon: number; polar?: "day" | "night" };

/** The sky depends on this device's clock and time zone, so the controls render after mount. */
function Appearance(props: { value: GuavaPrefs; onChange: (g: GuavaPrefs) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <AppearanceControls {...props} /> : <div className="gv-appearance" style={{ minHeight: 440 }} />;
}

/** Look, text, change through the day / stick to, Play the day and city, with a live phone beside them. */
function AppearanceControls({ value, onChange }: { value: GuavaPrefs; onChange: (g: GuavaPrefs) => void }) {
  const [at, setAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const spring = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastMoment = useRef("");
  // Recompute "now" once a minute so the readout and swatches keep up with the clock.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const shownAt = at ?? (value.cycle ? null : value.freeze);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shown = useMemo(() => computeGuava(value, { at: shownAt }), [value, shownAt, tick]);
  const sun = sunTimes(shown.place, new Date()) as Sun;

  useEffect(() => {
    // Font samples on the Text cards.
    const id = "guava-font-all";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${FONT_LIST.map(([, f]) => f.google).join("&")}&display=swap`;
    document.head.appendChild(link);
  }, []);

  useEffect(() => () => clearTimeout(spring.current), []);

  function slide(h: number) {
    clearTimeout(spring.current);
    const r = computeGuava(value, { at: h });
    if (lastMoment.current && r.moment !== lastMoment.current) navigator.vibrate?.(8);
    lastMoment.current = r.moment;
    if (value.cycle) setAt(h);
    else onChange({ ...value, freeze: h });
  }

  function release() {
    lastMoment.current = "";
    if (!value.cycle) return;
    clearTimeout(spring.current);
    spring.current = setTimeout(() => setAt(null), 1500);
  }

  const timeLabel = value.cycle ? "Preview a time" : "Stick to";

  return (
    <div className="gv-appearance">
      <div className="gv-choices">
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
                <LookSwatch value={value} look={l.id} at={shownAt} tick={tick} />
                <b>{l.label}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="setting-stack">
          <span className="setting-label">Text</span>
          <div className="looks fonts" role="radiogroup" aria-label="Text">
            {FONT_LIST.map(([id, f]) => (
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
          <span className="setting-label" id="guava-cycle">
            Change through the day
          </span>
          <button
            type="button"
            role="switch"
            className="switch"
            aria-labelledby="guava-cycle"
            aria-checked={value.cycle}
            onClick={() => {
              clearTimeout(spring.current);
              setAt(null);
              onChange({ ...value, cycle: !value.cycle, freeze: value.cycle ? Math.round(shown.localHour * 4) / 4 : value.freeze });
            }}
          />
        </div>
        <div className="setting-stack">
          <div className="gv-time-head">
            <span className="setting-label">{timeLabel}</span>
            <span className="tl-read">
              {fmtHour(shown.localHour)} · {shown.moment}
            </span>
            <span style={{ flex: 1 }} />
            <button type="button" className="small" onClick={() => setPlaying(true)}>
              Play the day
            </button>
          </div>
          <div className="timeline">
            <input
              type="range"
              min={0}
              max={23.75}
              step={0.25}
              aria-label={timeLabel}
              aria-valuetext={`${fmtHour(shown.localHour)}, ${shown.moment}`}
              value={Math.round(shown.localHour * 4) / 4}
              onChange={(e) => slide(Number(e.target.value))}
              onPointerUp={release}
              onKeyUp={release}
            />
            <div className="tl-marks" aria-hidden="true">
              {MARKS.map(([h, m]) => (
                <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
        <CityPicker value={value} place={shown.place} sun={sun} onChange={onChange} />
      </div>
      <div className="gv-preview">
        <SkyPhone r={shown} />
      </div>
      {playing && <PlayTheDay value={value} from={shown.localHour} onClose={() => setPlaying(false)} />}
    </div>
  );
}

/** A mini sky for one look at the hour on screen. */
function LookSwatch({ value, look, at, tick }: { value: GuavaPrefs; look: GuavaPrefs["look"]; at: number | null; tick: number }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const r = useMemo(() => computeGuava(value, { at, look }), [value.city, value.cycle, value.freeze, look, at, tick]);
  return <i className="look-sky gv-sky" style={htmlVars(r.vars)} aria-hidden="true" />;
}

/** A phone showing a case page under the sky; its colors are scoped to the phone. */
function SkyPhone({ r, big = false }: { r: GuavaResult; big?: boolean }) {
  return (
    <div className={`gv-phone${big ? " gv-phone-big" : ""}`} data-theme={r.scheme} style={htmlVars(r.vars)} aria-hidden="true">
      <div className="gv-screen">
        <div className="gv-sky">
          <i className="gv-sun" />
        </div>
        <div className="gv-ui">
          <div className="gv-status">
            <span>{fmtHour(r.localHour).replace("Noon", "12pm")}</span>
            <span>●●● ▮</span>
          </div>
          <div className="gv-title">Atlas</div>
          <div className="gv-card">
            <div className="gv-lbl">Interviews</div>
            <div className="gv-num">18</div>
            <div className="gv-meter">
              <i style={{ flex: 5, background: "var(--c1)" }} />
              <i style={{ flex: 3, background: "var(--c2)" }} />
              <i style={{ flex: 2, background: "var(--c3)" }} />
              <i style={{ flex: 1.4, background: "var(--c4)" }} />
            </div>
          </div>
          <div className="gv-card">
            <div className="gv-row">
              <i style={{ background: "var(--c1)" }} />
              <span>Storyline</span>
              <em>4pm</em>
            </div>
            <div className="gv-row">
              <i style={{ background: "var(--c4)" }} />
              <span>OEM 04 call</span>
              <em>Mon</em>
            </div>
            <div className="gv-row">
              <i style={{ background: "var(--c3)" }} />
              <span>Market model</span>
              <em>Tue</em>
            </div>
          </div>
          <div className="gv-ask">
            <span>Ask AtlasGPT</span>
            <b>↑</b>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Plays all 24 hours in 9 seconds in a pop-up phone. Never saves. */
function PlayTheDay({ value, from, onClose }: { value: GuavaPrefs; from: number; onClose: () => void }) {
  const [h, setH] = useState(from);
  const close = useRef<HTMLButtonElement>(null);
  const r = useMemo(() => computeGuava(value, { at: h }), [value, h]);

  useEffect(() => {
    close.current?.focus();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    let frame = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 9000);
      // Under reduced motion, step through the day an hour at a time instead of gliding.
      const x = from + k * 24;
      setH((reduce ? Math.floor(x) : x) % 24);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
    };
  }, [from, onClose]);

  // Rendered on <body>: glass cards (backdrop-filter) would otherwise trap a fixed overlay inside them.
  return createPortal(
    <div className="gv-play" role="dialog" aria-modal="true" aria-label="Play the day" onClick={onClose}>
      <div className="gv-play-inner" onClick={(e) => e.stopPropagation()}>
        <button ref={close} type="button" className="gv-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <SkyPhone r={r} big />
        <div className="gv-daybar" aria-hidden="true">
          <i style={{ left: `${(h / 24) * 100}%` }} />
        </div>
        <div className="tl-read">
          {fmtHour(h)} · {r.moment}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function deviceTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** City whose sunrise and sunset drive the day: search, use my location, or follow the time zone. */
function CityPicker({
  value,
  place,
  sun,
  onChange,
}: {
  value: GuavaPrefs;
  place: GuavaCity & { auto?: boolean };
  sun: Sun;
  onChange: (g: GuavaPrefs) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const matches = q.trim()
    ? GUAVA_CITIES.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];

  function pick(city: GuavaCity | null) {
    onChange({ ...value, city });
    setOpen(false);
    setQ("");
    setError("");
  }

  function locate() {
    if (!navigator.geolocation) return setError("Location unavailable");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        // Rounded to about 0.1 degree and kept only in this browser's cookie.
        pick({
          name: "My location",
          lat: Math.round(p.coords.latitude * 10) / 10,
          lon: Math.round(p.coords.longitude * 10) / 10,
          tz: deviceTz(),
        });
      },
      () => {
        setLocating(false);
        setError("Location unavailable");
      },
      { maximumAge: 3_600_000, timeout: 10_000 },
    );
  }

  const sunLine =
    sun.rise != null && sun.set != null
      ? `Sunrise ${fmtHour(sun.rise)}, sunset ${fmtHour(sun.set)}`
      : sun.polar === "day"
        ? "Sun up all day"
        : "Sun down all day";

  return (
    <div className="setting-stack">
      <div className="setting">
        <span className="setting-label">City</span>
        <div className="gv-city-now">
          <span>
            {place.name}
            {value.city ? "" : " (your time zone)"}. <span className="muted">{sunLine}</span>
          </span>
          <button type="button" className="small secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
            Change
          </button>
        </div>
      </div>
      {open && (
        <div className="gv-city-pick">
          <input type="text" placeholder="Search cities" aria-label="Search cities" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {matches.length > 0 && (
            <ul className="gv-city-list">
              {matches.map((c) => (
                <li key={c.name}>
                  <button type="button" onClick={() => pick(c)}>
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="toolbar">
            <button type="button" className="small secondary" onClick={locate} disabled={locating}>
              Use my location
            </button>
            <button type="button" className="small secondary" onClick={() => pick(null)}>
              Use my time zone
            </button>
            {error && <span className="error">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
