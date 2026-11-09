/** Applies the Guava sky (lib/guava/sky.ts) to the page. Browser only. */
import { GUAVA_CACHE, type GuavaPrefs } from "@/lib/prefs";
import { CITIES, FONTS, guavaSky } from "./sky";

export interface GuavaCity {
  name: string;
  lat: number;
  lon: number;
  tz: string;
}

export interface GuavaResult {
  vars: Record<string, string>;
  scheme: "light" | "dark";
  moment: string;
  localHour: number;
  place: GuavaCity & { auto?: boolean };
}

export const GUAVA_CITIES = CITIES as GuavaCity[];

/** Events other components use to talk to the sky: new settings, or a previewed hour (null = now). */
export const GUAVA_PREFS_EVENT = "mq-guava-prefs";
export const GUAVA_AT_EVENT = "mq-guava-at";

export function guavaSettings(g: GuavaPrefs, at?: number | null) {
  return {
    look: g.look,
    font: g.font,
    city: GUAVA_CITIES.find((c) => c.name === g.city) ?? null,
    cycle: g.cycle,
    freeze: g.freeze,
    sunSpot: "glow",
    ...(at != null ? { at } : {}),
  };
}

export function computeGuava(g: GuavaPrefs, at?: number | null): GuavaResult {
  return guavaSky(guavaSettings(g, at)) as GuavaResult;
}

function loadFont(font: GuavaPrefs["font"]) {
  const id = `guava-font-${font}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${FONTS[font].google}&display=swap`;
  document.head.appendChild(link);
}

export function applyGuava(g: GuavaPrefs, at?: number | null): GuavaResult {
  const root = document.documentElement;
  const r = computeGuava(g, at);
  for (const [k, v] of Object.entries(r.vars)) root.style.setProperty(k, v);
  root.setAttribute("data-theme", r.scheme);
  loadFont(g.font);
  if (at == null) {
    try {
      localStorage.setItem(GUAVA_CACHE, JSON.stringify({ vars: r.vars, scheme: r.scheme }));
    } catch {
      // Storage can be blocked; the sky is recomputed on load anyway.
    }
  }
  return r;
}

export function clearGuava() {
  const root = document.documentElement;
  const style = root.style;
  for (let i = style.length - 1; i >= 0; i--) {
    const name = style[i];
    if (name.startsWith("--")) style.removeProperty(name);
  }
}
