/** Per-person display preferences, kept in a cookie so the server renders them with no flash. */

export const PREFS_COOKIE = "mq_prefs";

export const THEMES = ["system", "light", "dark", "guava"] as const;
/** Guava theme: a sky that follows the real sunrise and sunset (see lib/guava). */
export const GUAVA_LOOKS = ["guava", "lavender-aurora", "ember-aurora", "aurora", "nightshift", "rosewater", "marigold"] as const;
export const GUAVA_FONTS = ["clean", "storybook", "rounded", "receipt", "poster", "notebook"] as const;
export const ACCENTS = ["blue", "green", "teal", "violet", "orange", "rose"] as const;
export const SIDEBARS = ["dark", "light"] as const;
export const TEXT_SIZES = ["small", "default", "large"] as const;
export const CASE_MENUS = ["auto", "full", "icons"] as const;

export interface Prefs {
  theme: (typeof THEMES)[number];
  accent: (typeof ACCENTS)[number];
  sidebar: (typeof SIDEBARS)[number];
  text: (typeof TEXT_SIZES)[number];
  /** Case side menu: auto = full on the Overview, icons in sections. */
  caseMenu: (typeof CASE_MENUS)[number];
  guava: GuavaPrefs;
}

export interface GuavaPrefs {
  look: (typeof GUAVA_LOOKS)[number];
  font: (typeof GUAVA_FONTS)[number];
  /** City name from the Guava city list; "" follows the device's time zone. */
  city: string;
  /** true = change through the day; false = stick to `freeze`. */
  cycle: boolean;
  /** Local hour in quarter hours, used when cycle is off. */
  freeze: number;
}

export const DEFAULT_GUAVA: GuavaPrefs = { look: "guava", font: "clean", city: "", cycle: true, freeze: 12 };

export const DEFAULT_PREFS: Prefs = { theme: "system", accent: "blue", sidebar: "dark", text: "default", caseMenu: "auto", guava: DEFAULT_GUAVA };

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
    theme: pick(THEMES, data.theme, d.theme),
    accent: pick(ACCENTS, data.accent, d.accent),
    sidebar: pick(SIDEBARS, data.sidebar, d.sidebar),
    text: pick(TEXT_SIZES, data.text, d.text),
    caseMenu: pick(CASE_MENUS, data.caseMenu, d.caseMenu),
    guava: parseGuava(data.guava),
  };
}

function parseGuava(raw: unknown): GuavaPrefs {
  const g = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_GUAVA;
  const freeze = typeof g.freeze === "number" && g.freeze >= 0 && g.freeze < 24 ? Math.round(g.freeze * 4) / 4 : d.freeze;
  return {
    look: pick(GUAVA_LOOKS, g.look, d.look),
    font: pick(GUAVA_FONTS, g.font, d.font),
    city: typeof g.city === "string" ? g.city.slice(0, 60) : d.city,
    cycle: typeof g.cycle === "boolean" ? g.cycle : d.cycle,
    freeze,
  };
}

export function serializePrefs(prefs: Prefs): string {
  return encodeURIComponent(JSON.stringify(prefs));
}

/** Attributes on <html> that the stylesheet keys off. */
export function htmlAttrs(prefs: Prefs) {
  return {
    "data-theme-pref": prefs.theme,
    "data-theme": prefs.theme === "system" || prefs.theme === "guava" ? undefined : prefs.theme,
    "data-accent": prefs.accent,
    "data-sidebar": prefs.sidebar,
    "data-text": prefs.text,
  };
}

export const GUAVA_CACHE = "mq_guava";

/** Runs before paint: resolves the "system" theme, follows OS changes, and paints the last Guava sky. */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function s(){if(d.getAttribute("data-theme-pref")==="system")d.setAttribute("data-theme",m.matches?"dark":"light")}if(d.getAttribute("data-theme-pref")==="guava"){try{var c=JSON.parse(localStorage.getItem("${GUAVA_CACHE}")||"null");if(c&&c.vars){for(var k in c.vars)d.style.setProperty(k,c.vars[k]);d.setAttribute("data-theme",c.scheme)}}catch(e){}}s();m.addEventListener("change",s)})()`;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
