/** Per-person display preferences, kept in a cookie so the server renders them with no flash. */

export const PREFS_COOKIE = "mq_prefs";

export const THEMES = ["system", "light", "dark"] as const;
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
}

export const DEFAULT_PREFS: Prefs = { theme: "system", accent: "blue", sidebar: "dark", text: "default", caseMenu: "auto" };

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
  };
}

export function serializePrefs(prefs: Prefs): string {
  return encodeURIComponent(JSON.stringify(prefs));
}

/** Attributes on <html> that the stylesheet keys off. */
export function htmlAttrs(prefs: Prefs) {
  return {
    "data-theme-pref": prefs.theme,
    "data-theme": prefs.theme === "system" ? undefined : prefs.theme,
    "data-accent": prefs.accent,
    "data-sidebar": prefs.sidebar,
    "data-text": prefs.text,
  };
}

/** Runs before paint: resolves the "system" theme and follows OS changes. */
export const THEME_SCRIPT = `(function(){var d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function s(){if(d.getAttribute("data-theme-pref")==="system")d.setAttribute("data-theme",m.matches?"dark":"light")}s();m.addEventListener("change",s)})()`;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}
