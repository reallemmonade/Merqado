"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ACCENTS,
  CASE_MENUS,
  PREFS_COOKIE,
  SIDEBARS,
  TEXT_SIZES,
  THEMES,
  htmlAttrs,
  serializePrefs,
  type Prefs,
} from "@/lib/prefs";

const LABELS: Record<string, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
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

function Seg<K extends keyof Prefs>({
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
    if (name === "caseMenu") router.refresh();
  }

  return (
    <>
      <section className="card">
        <h2 style={{ fontSize: 18 }}>Appearance</h2>
        <Seg label="Theme" name="theme" options={THEMES} prefs={prefs} set={set} />
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
        <Seg label="Sidebar" name="sidebar" options={SIDEBARS} prefs={prefs} set={set} />
        <Seg label="Text size" name="text" options={TEXT_SIZES} prefs={prefs} set={set} />
      </section>
      <section className="card">
        <h2 style={{ fontSize: 18 }}>Layout</h2>
        <Seg label="Case menu" name="caseMenu" options={CASE_MENUS} prefs={prefs} set={set} />
      </section>
    </>
  );
}
