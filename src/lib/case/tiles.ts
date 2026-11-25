import { webUrl } from "./webTiles";

/**
 * Tiles page: which case sections can be tiles, and where each tile goes.
 * Sizing follows Celaya's board (reallemmonade/celaya public/mosaica.js `reflow`): about √n tiles per row,
 * every row fills the full width, and the rows share the full height, so the board never has gaps.
 */

export const TILE_SECTIONS = ["overview", "desk", "gpt", "workplan", "experts", "meetings", "deck", "channel", "files", "dictionary", "notes", "search"] as const;
export type TileSection = (typeof TILE_SECTIONS)[number];
export type TileMode = "grid" | "focus";
export type TileRect = { x: number; y: number; w: number; h: number }; // fractions of the board, 0..1

/** A tile is one case page; `path` is the page under /e/<id>, e.g. "/notes" or "/gpt/abc". */
export type Tile = { id: string; section: TileSection | "web"; path: string; url?: string; main?: boolean; rect?: GridRect };
/** A tile's place on the board's grid: GRID_COLS columns by GRID_ROWS rows that always fill the board. */
export type GridRect = { x: number; y: number; w: number; h: number };
export const GRID_COLS = 12;
export const GRID_ROWS = 12;
/** Smallest tile a person can size or drag to, in grid cells. */
export const MIN_W = 3;
export const MIN_H = 3;
export type TilesState = { tiles: Tile[]; mode: TileMode };

export const EMPTY_TILES: TilesState = { tiles: [], mode: "grid" };
export const MAX_TILES = 9;

/** Section of a path under the case ("" is the Overview). */
export function sectionOf(path: string): TileSection | null {
  const first = path.split(/[?#]/)[0].split("/").filter(Boolean)[0] ?? "";
  if (first === "") return "overview";
  return (TILE_SECTIONS as readonly string[]).includes(first) ? (first as TileSection) : null;
}

/**
 * The case page a dropped link points to, or null when it is not a page of this case (or is Tiles itself).
 * Accepts a full URL or a path.
 */
export function pathFromDrop(text: string, engagementId: string, origin: string): string | null {
  const raw = text.split(/\r?\n/).map((s) => s.trim()).find((s) => s && !s.startsWith("#"));
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  const base = `/e/${engagementId}`;
  if (url.pathname !== base && !url.pathname.startsWith(base + "/")) return null;
  const path = url.pathname.slice(base.length) || "/";
  if (!sectionOf(path)) return null;
  return path + url.search;
}

/** Adds a web page (an https address) as a tile; a page already on the board is not added twice. */
export function addWebTile(state: TilesState, url: string, id?: string): TilesState {
  if (state.tiles.some((t) => t.url === url)) return state;
  const tile: Tile = { id: id ?? `web-${Date.now().toString(36)}`, section: "web", path: url, url };
  return { ...state, tiles: [...state.tiles, tile].slice(-MAX_TILES) };
}

/** Adds a page as a tile (or moves it if that page is already a tile). `at` is the index to put it at. */
export function addTile(state: TilesState, path: string, at?: number, id?: string): TilesState {
  const section = sectionOf(path);
  if (!section) return state;
  const existing = state.tiles.find((t) => t.path === path);
  const rest = state.tiles.filter((t) => t.path !== path);
  const tile = existing ?? { id: id ?? `${section}-${Date.now().toString(36)}`, section, path };
  const i = at == null ? rest.length : Math.max(0, Math.min(at, rest.length));
  const tiles = [...rest.slice(0, i), tile, ...rest.slice(i)].slice(-MAX_TILES);
  return { ...state, tiles };
}

export function removeTile(state: TilesState, id: string): TilesState {
  return { ...state, tiles: state.tiles.filter((t) => t.id !== id) };
}

export function swapTiles(state: TilesState, a: string, b: string): TilesState {
  const i = state.tiles.findIndex((t) => t.id === a);
  const j = state.tiles.findIndex((t) => t.id === b);
  if (i < 0 || j < 0 || i === j) return state;
  const tiles = state.tiles.slice();
  [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  return { ...state, tiles };
}

/**
 * Where each tile sits. Grid: ceil(√n) per row (fewer when the board is too narrow for `minWidth` px tiles),
 * each row split evenly across the full width, rows sharing the full height. Focus: the first tile takes
 * two thirds at full height and the rest stack in the last third. Phones (`narrow`) get one column.
 */
export function layoutTiles(n: number, mode: TileMode, boardWidth = 1200, minWidth = 320): TileRect[] {
  if (n <= 0) return [];
  const fit = Math.max(1, Math.floor(boardWidth / minWidth));
  if (mode === "focus" && n > 1 && fit >= 2) {
    const fw = 2 / 3;
    const h = 1 / (n - 1);
    return [{ x: 0, y: 0, w: fw, h: 1 }, ...Array.from({ length: n - 1 }, (_, i) => ({ x: fw, y: i * h, w: 1 - fw, h }))];
  }
  const cols = Math.max(1, Math.min(Math.ceil(Math.sqrt(n)), fit));
  const rows = Math.ceil(n / cols);
  const out: TileRect[] = [];
  for (let r = 0, i = 0; r < rows; r++) {
    // Like Celaya, the last row takes what is left and its tiles widen to fill the row.
    const k = Math.min(cols, n - i);
    for (let c = 0; c < k; c++, i++) out.push({ x: c / k, y: r / rows, w: 1 / k, h: 1 / rows });
  }
  return out;
}

/** Reads a saved layout, dropping anything that is not a valid tile. */
export function parseTiles(json: string | null | undefined): TilesState | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Partial<TilesState>;
    if (!v || !Array.isArray(v.tiles)) return null;
    const seen = new Set<string>();
    const tiles: Tile[] = [];
    for (const t of v.tiles) {
      if (!t || typeof t.id !== "string" || typeof t.path !== "string" || seen.has(t.path)) continue;
      const web = typeof t.url === "string" ? webUrl(t.url) : null;
      const section = web ? "web" : sectionOf(t.path);
      if (!section || (!web && !t.path.startsWith("/"))) continue;
      seen.add(t.path);
      const r = t.rect;
      const okRect = r && [r.x, r.y, r.w, r.h].every((v) => Number.isInteger(v)) && r.x >= 0 && r.y >= 0 && r.w >= 1 && r.h >= 1 && r.x + r.w <= GRID_COLS && r.y + r.h <= GRID_ROWS;
      tiles.push({ id: t.id, section, path: web ?? t.path, ...(web ? { url: web } : {}), ...(t.main ? { main: true } : {}), ...(okRect ? { rect: { x: r.x, y: r.y, w: r.w, h: r.h } } : {}) });
    }
    const out: TilesState = { tiles: tiles.slice(-MAX_TILES), mode: v.mode === "focus" ? "focus" : "grid" };
    // Saved places that overlap (an older or hand-edited layout) are tidied rather than drawn on top of each other.
    return placesValid(out.tiles) ? out : tidy(out);
  } catch {
    return null;
  }
}

const overlaps = (a: GridRect, b: GridRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inBoard = (r: GridRect) => r.x >= 0 && r.y >= 0 && r.w >= 1 && r.h >= 1 && r.x + r.w <= GRID_COLS && r.y + r.h <= GRID_ROWS;

/** Every tile has a place on the board and none overlap. */
export function placesValid(tiles: Tile[]): boolean {
  for (let i = 0; i < tiles.length; i++) {
    const a = tiles[i].rect;
    if (!a || !inBoard(a)) return false;
    for (let j = i + 1; j < tiles.length; j++) {
      const b = tiles[j].rect;
      if (b && overlaps(a, b)) return false;
    }
  }
  return true;
}

/** Fractions of the board to whole grid cells, rounding each edge so neighbours still meet. */
function toGrid(r: TileRect, ox = 0, oy = 0, cols = GRID_COLS, rows = GRID_ROWS): GridRect {
  const x0 = Math.round(r.x * cols), x1 = Math.round((r.x + r.w) * cols);
  const y0 = Math.round(r.y * rows), y1 = Math.round((r.y + r.h) * rows);
  return { x: ox + x0, y: oy + y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/**
 * Lays every tile out again with no gaps. Grid: Celaya's even rows. Focus: the main tiles (starred; the
 * first tile when none is) share the left two thirds, the others stack small in the right third.
 */
export function tidy(state: TilesState, mode: TileMode = state.mode): TilesState {
  const n = state.tiles.length;
  if (!n) return { ...state, mode };
  if (mode === "focus" && n > 1) {
    const anyMain = state.tiles.some((t) => t.main);
    const isMain = (t: Tile, i: number) => (anyMain ? !!t.main : i === 0);
    const mains = state.tiles.filter(isMain);
    const fringe = state.tiles.filter((t, i) => !isMain(t, i));
    if (fringe.length) {
      const mw = 8, fw = GRID_COLS - mw;
      const mainRects = layoutTiles(mains.length, "grid").map((r) => toGrid(r, 0, 0, mw, GRID_ROWS));
      const fr = layoutTiles(fringe.length, "grid", 1, 1).map((r) => toGrid(r, mw, 0, fw, GRID_ROWS));
      const rect = new Map<string, GridRect>();
      mains.forEach((t, i) => rect.set(t.id, mainRects[i]));
      fringe.forEach((t, i) => rect.set(t.id, fr[i]));
      return { mode, tiles: state.tiles.map((t) => ({ ...t, rect: rect.get(t.id) })) };
    }
  }
  const rs = layoutTiles(n, "grid").map((r) => toGrid(r));
  return { mode, tiles: state.tiles.map((t, i) => ({ ...t, rect: rs[i] })) };
}

/** Star or unstar a tile as a main one; in Focus the board re-tidies around the mains. */
export function toggleMain(state: TilesState, id: string): TilesState {
  const next = { ...state, tiles: state.tiles.map((t) => (t.id === id ? { ...t, main: !t.main } : t)) };
  return state.mode === "focus" ? tidy(next) : next;
}

/**
 * Drags a tile so its top-left lands on cell (x, y). Dropped on another tile, the two swap places; on free
 * cells it moves there if it fits without overlapping. Anything else leaves the board as it was.
 */
export function moveTile(state: TilesState, id: string, x: number, y: number): TilesState {
  const me = state.tiles.find((t) => t.id === id);
  if (!me?.rect) return state;
  const cx = Math.max(0, Math.min(GRID_COLS - 1, x)), cy = Math.max(0, Math.min(GRID_ROWS - 1, y));
  const hit = state.tiles.find((t) => t.id !== id && t.rect && overlaps(t.rect, { x: cx, y: cy, w: 1, h: 1 }));
  if (hit?.rect) {
    const a = me.rect, b = hit.rect;
    return { ...state, tiles: state.tiles.map((t) => (t.id === id ? { ...t, rect: b } : t.id === hit.id ? { ...t, rect: a } : t)) };
  }
  const to = { ...me.rect, x: Math.min(cx, GRID_COLS - me.rect.w), y: Math.min(cy, GRID_ROWS - me.rect.h) };
  if (state.tiles.some((t) => t.id !== id && t.rect && overlaps(t.rect, to))) return state;
  return { ...state, tiles: state.tiles.map((t) => (t.id === id ? { ...t, rect: to } : t)) };
}

/** Resizes a tile from its bottom-right corner, never below MIN_W x MIN_H, past the board or over another tile. */
export function resizeTile(state: TilesState, id: string, w: number, h: number): TilesState {
  const me = state.tiles.find((t) => t.id === id);
  if (!me?.rect) return state;
  const r = me.rect;
  let nw = Math.max(Math.min(MIN_W, r.w), Math.min(w, GRID_COLS - r.x));
  let nh = Math.max(Math.min(MIN_H, r.h), Math.min(h, GRID_ROWS - r.y));
  const others = state.tiles.filter((t) => t.id !== id && t.rect).map((t) => t.rect!);
  // Grow as far as allowed: shrink back one cell at a time along whichever side hits a neighbour.
  while ((nw > r.w || nh > r.h) && others.some((o) => overlaps(o, { x: r.x, y: r.y, w: nw, h: nh }))) {
    if (nw > r.w && others.some((o) => overlaps(o, { x: r.x, y: r.y, w: nw, h: Math.min(nh, r.h) }))) nw--;
    else if (nh > r.h) nh--;
    else nw--;
  }
  if (nw === r.w && nh === r.h) return state;
  return { ...state, tiles: state.tiles.map((t) => (t.id === id ? { ...t, rect: { ...r, w: nw, h: nh } } : t)) };
}

/** Adds a page and gives it a place: the board is tidied so the new tile fits with no gaps. */
export function dropTile(state: TilesState, path: string, at?: number): TilesState {
  const next = addTile(state, path, at);
  return next === state ? state : tidy(next);
}

