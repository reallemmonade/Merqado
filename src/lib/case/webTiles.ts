/**
 * Web pages as Tiles tiles: an address typed into Add (or dropped as a link) opens as a tile of its own.
 * Only https pages are accepted; the page itself is shown in the tile when its site allows it to be framed,
 * otherwise the tile offers an Open button.
 */

/** The https address a person typed, or null when it is not one. A missing scheme is taken as https. */
export function webUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!url.hostname.includes(".") || url.hostname.length > 253) return null;
  return url.toString();
}

/** The site name shown on a web tile: its host without "www.". */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
