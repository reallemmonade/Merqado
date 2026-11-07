/** Applies the Guava sky (lib/guava/sky.ts) to the page. Browser only. */
import { GUAVA_CACHE, type GuavaCity, type GuavaPrefs } from "@/lib/prefs";
import { CITIES, FONTS, guavaSky } from "./sky";

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
  return guavaSky(guavaSettings(g, extra)) as GuavaResult;
}

export function loadGuavaFont(font: GuavaPrefs["font"]) {
  const id = `guava-font-${font}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${FONTS[font].google}&display=swap`;
  document.head.appendChild(link);
}

export function applyGuava(g: GuavaPrefs): GuavaResult {
  const root = document.documentElement;
  const r = computeGuava(g);
  for (const [k, v] of Object.entries(r.vars)) root.style.setProperty(k, v);
  root.setAttribute("data-theme", r.scheme);
  root.style.colorScheme = r.scheme;
  loadGuavaFont(g.font);
  try {
    localStorage.setItem(GUAVA_CACHE, JSON.stringify({ vars: r.vars, scheme: r.scheme }));
  } catch {
    // Storage can be blocked; the sky is recomputed on load anyway.
  }
  return r;
}

/** Sky variables as an inline style, to scope a sky to one element (phone preview, look swatch). */
export function htmlVars(vars: Record<string, string>): React.CSSProperties {
  return vars as unknown as React.CSSProperties;
}
