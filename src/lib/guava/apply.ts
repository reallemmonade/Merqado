/** Applies the Guava appearance (lib/guava/sky.ts): Guava style (the sky) or Normal style (one solid background). */
import { GUAVA_CACHE, type GuavaCity, type GuavaPrefs } from "@/lib/prefs";
import { CITIES, FONTS, contrast, guavaSky, reach } from "./sky";

export type { GuavaCity };

export interface GuavaResult {
  vars: Record<string, string>;
  scheme: "light" | "dark";
  moment: string;
  localHour: number;
  skyHour: number;
  place: GuavaCity & { auto?: boolean };
}

export const GUAVA_CITIES = CITIES as GuavaCity[];

type Font = { label: string; family: string; fallback: string; google: string };

/** The six Guava fonts. Merqado's "Clean" is Inter, the brand font (the engine's own Clean is Plus Jakarta Sans). */
export const APP_FONTS: Record<GuavaPrefs["font"], Font> = {
  ...(FONTS as Record<GuavaPrefs["font"], Font>),
  clean: { label: "Clean", family: "Inter", fallback: "ui-sans-serif, system-ui, sans-serif", google: "family=Inter:wght@300..700" },
};

const fontStack = (font: GuavaPrefs["font"]) => `"${APP_FONTS[font].family}", ${APP_FONTS[font].fallback}`;

/** Event the settings page sends when the saved appearance changes. */
export const GUAVA_PREFS_EVENT = "mq-guava-prefs";

export function guavaSettings(g: GuavaPrefs, extra?: { at?: number | null; look?: GuavaPrefs["look"]; date?: Date }) {
  return {
    look: extra?.look ?? g.look,
    font: g.font,
    city: g.city,
    cycle: g.cycle,
    freeze: g.freeze,
    sunSpot: "glow",
    ...(extra?.at != null ? { at: extra.at } : {}),
    ...(extra?.date ? { date: extra.date } : {}),
  };
}

export function computeGuava(g: GuavaPrefs, extra?: { at?: number | null; look?: GuavaPrefs["look"]; date?: Date }): GuavaResult {
  const r = guavaSky(guavaSettings(g, extra)) as GuavaResult;
  r.vars["--f-body"] = r.vars["--f-display"] = fontStack(g.font);
  return r;
}

// ---------- Normal style: one quiet solid background (values from the guava-theme skill) ----------
const NORMAL_NEUTRALS: Record<"light" | "dark", Record<string, string>> = {
  light: {
    "--ground": "#FAF9F5", "--panel": "#FFFFFF", "--ink": "#141413", "--ink-soft": "#5E5D59", "--ink-faint": "#87867F",
    "--rule": "#E8E6DC", "--rule-strong": "#D1CFC5", "--hero-bg": "#F0EEE6", "--hero-on": "#141413",
  },
  dark: {
    "--ground": "#1F1E1D", "--panel": "#262624", "--ink": "#FAF9F5", "--ink-soft": "#C2C0B6", "--ink-faint": "#9C9A92",
    "--rule": "#3A3936", "--rule-strong": "#4A4844", "--hero-bg": "#30302E", "--hero-on": "#FAF9F5",
  },
};
const TEXT_KEYS = ["--accent", "--good", "--signal", "--bad", "--good-field", "--bad-field"];
const CHART_KEY = /^--(c[1-9]|cx[1-9])$/;
const COLOR_KEY =/^--(accent-fill|on-accent|accent-soft|accent-line|on-status|c[1-9]|cx[1-9]|c-other|g[1-4])(-fill2?|-on)?$/;

/** Normal-style variables: the fixed neutrals plus the Guava look's own colors, nudged to stay readable on them. */
export function computeNormal(g: GuavaPrefs, scheme: "light" | "dark"): GuavaResult {
  const base = computeGuava({ ...g, look: "guava" }, { at: scheme === "light" ? 13 : 0 });
  const n = NORMAL_NEUTRALS[scheme];
  const vars: Record<string, string> = { ...n, "--panel-glass": n["--panel"], "--sun-o": "0" };
  for (const [k, v] of Object.entries(base.vars)) {
    if (CHART_KEY.test(k)) vars[k] = reach(reach(v, n["--panel"], 3), n["--ground"], 3);
    else if (COLOR_KEY.test(k)) vars[k] = v;
  }
  for (const k of TEXT_KEYS) {
    let c = base.vars[k];
    if (!c) continue;
    for (let i = 0; i < 3; i++) for (const bg of [n["--ground"], n["--panel"]]) c = reach(c, bg, 4.5);
    vars[k] = c;
  }
  if (contrast(vars["--accent"], vars["--accent-soft"]) < 4.5) vars["--accent"] = reach(vars["--accent"], vars["--accent-soft"], 4.5);
  vars["--f-body"] = vars["--f-display"] = fontStack(g.font);
  return { vars, scheme, moment: "", localHour: base.localHour, skyHour: base.skyHour, place: base.place };
}

export function systemScheme(): "light" | "dark" {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The colors for the saved appearance right now. */
export function computeAppearance(g: GuavaPrefs, extra?: { at?: number | null }): GuavaResult {
  if (g.style === "normal") return computeNormal(g, g.mode === "system" ? systemScheme() : g.mode);
  return computeGuava(g, extra);
}

export function loadGuavaFont(font: GuavaPrefs["font"]) {
  const id = `guava-font-${font}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${APP_FONTS[font].google}&display=swap`;
  document.head.appendChild(link);
}

export function applyGuava(g: GuavaPrefs): GuavaResult {
  const root = document.documentElement;
  const r = computeAppearance(g);
  root.setAttribute("data-style", g.style);
  for (const [k, v] of Object.entries(r.vars)) root.style.setProperty(k, v);
  root.setAttribute("data-theme", r.scheme);
  root.style.colorScheme = r.scheme;
  loadGuavaFont(g.font);
  try {
    const both = g.style === "normal" && g.mode === "system" ? { light: computeNormal(g, "light").vars, dark: computeNormal(g, "dark").vars } : undefined;
    localStorage.setItem(GUAVA_CACHE, JSON.stringify({ style: g.style, vars: r.vars, scheme: r.scheme, both }));
  } catch {
    // Storage can be blocked; the colors are recomputed on load anyway.
  }
  return r;
}

/** Sky variables as an inline style, to scope a sky to one element (phone preview, look swatch). */
export function htmlVars(vars: Record<string, string>): React.CSSProperties {
  return vars as unknown as React.CSSProperties;
}
