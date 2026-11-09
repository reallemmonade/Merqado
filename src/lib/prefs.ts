/** Per-person display preferences, kept in a cookie so the server renders them with no flash. */

export const PREFS_COOKIE = "mq_prefs";

/** Appearance follows the Guava sky (see lib/guava): the sky decides light or dark, so there is no theme switch. */
export const GUAVA_LOOKS = ["guava", "lavender-aurora", "ember-aurora", "aurora", "nightshift", "rosewater", "marigold"] as const;
export const GUAVA_FONTS = ["clean", "storybook", "rounded", "receipt", "poster", "notebook"] as const;
/** guava = the living sky; normal = one quiet solid background. */
export const GUAVA_STYLES = ["guava", "normal"] as const;
/** Light / Dark / System exists only in Normal style; in Guava style the sky decides. */
export const NORMAL_MODES = ["system", "light", "dark"] as const;
export const TEXT_SIZES = ["small", "default", "large"] as const;
export const CASE_MENUS = ["auto", "full", "icons"] as const;

export interface GuavaCity {
  name: string;
  lat: number;
  lon: number;
  tz: string;
}

export interface GuavaPrefs {
  style: (typeof GUAVA_STYLES)[number];
  mode: (typeof NORMAL_MODES)[number];
  look: (typeof GUAVA_LOOKS)[number];
  font: (typeof GUAVA_FONTS)[number];
  /** The place whose sunrise and sunset drive the day; null follows the device's time zone. */
  city: GuavaCity | null;
  /** true = change through the day; false = stick to `freeze`. */
  cycle: boolean;
  /** Local hour in quarter hours, used when cycle is off. */
  freeze: number;
}

export interface Prefs {
  text: (typeof TEXT_SIZES)[number];
  /** Case side menu: auto = full on the Overview, icons in sections. */
  caseMenu: (typeof CASE_MENUS)[number];
  guava: GuavaPrefs;
}

export const DEFAULT_GUAVA: GuavaPrefs = { style: "guava", mode: "system", look: "guava", font: "clean", city: null, cycle: true, freeze: 12 };

export const DEFAULT_PREFS: Prefs = { text: "default", caseMenu: "auto", guava: DEFAULT_GUAVA };

function pick<T extends readonly string[]>(options: T, value: unknown, fallback: T[number]): T[number] {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

/** Reads the cookie value; anything missing or unknown falls back to the default. */
export function parsePrefs(raw: string | undefined): Prefs {
  let data: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(raw));
      if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
    } catch {
      // Ignore a damaged cookie.
    }
  }
  const d = DEFAULT_PREFS;
  return {
    text: pick(TEXT_SIZES, data.text, d.text),
    caseMenu: pick(CASE_MENUS, data.caseMenu, d.caseMenu),
    guava: parseGuava(data.guava),
  };
}

function parseCity(raw: unknown): GuavaCity | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const lat = Number(c.lat), lon = Number(c.lon);
  if (typeof c.name !== "string" || typeof c.tz !== "string" || !c.tz) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  // Rounded to about 0.1 degree: enough for sunrise and sunset, not a street address.
  return { name: c.name.slice(0, 60), lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10, tz: c.tz.slice(0, 60) };
}

function parseGuava(raw: unknown): GuavaPrefs {
  const g = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_GUAVA;
  const freeze = typeof g.freeze === "number" && g.freeze >= 0 && g.freeze < 24 ? Math.round(g.freeze * 4) / 4 : d.freeze;
  return {
    style: pick(GUAVA_STYLES, g.style, d.style),
    mode: pick(NORMAL_MODES, g.mode, d.mode),
    look: pick(GUAVA_LOOKS, g.look, d.look),
    font: pick(GUAVA_FONTS, g.font, d.font),
    city: parseCity(g.city),
    cycle: typeof g.cycle === "boolean" ? g.cycle : d.cycle,
    freeze,
  };
}

export function serializePrefs(prefs: Prefs): string {
  return encodeURIComponent(JSON.stringify(prefs));
}

/** Attributes on <html> that the stylesheet keys off. data-theme (light or dark) comes from the sky or the Normal mode. */
export function htmlAttrs(prefs: Prefs) {
  return {
    "data-text": prefs.text,
    "data-style": prefs.guava.style,
  };
}

export const GUAVA_CACHE = "mq_guava";

/**
 * Runs before paint: puts back the last colors this browser drew so the first paint is already right.
 * Normal style on System keeps both variants and picks one from the device's current scheme.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement;try{var c=JSON.parse(localStorage.getItem("${GUAVA_CACHE}")||"null");if(!c)return;if(c.style)d.setAttribute("data-style",c.style);var s=c.scheme,v=c.vars;if(c.both){s=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";v=c.both[s]}if(v){for(var k in v)d.style.setProperty(k,v[k]);d.setAttribute("data-theme",s);d.style.colorScheme=s}}catch(e){}})()`;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
