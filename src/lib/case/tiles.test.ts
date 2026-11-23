import { describe, expect, it } from "vitest";
import { addTile, dropTile, EMPTY_TILES, GRID_COLS, GRID_ROWS, layoutTiles, MAX_TILES, MIN_H, MIN_W, moveTile, parseTiles, pathFromDrop, placesValid, removeTile, resizeTile, sectionOf, swapTiles, tidy, toggleMain, type TilesState } from "./tiles";

const area = (rs: { w: number; h: number }[]) => rs.reduce((a, r) => a + r.w * r.h, 0);

describe("layoutTiles", () => {
  it("fills the whole board with no gaps or overlaps for 1 to 9 tiles", () => {
    for (let n = 1; n <= 9; n++) {
      for (const mode of ["grid", "focus"] as const) {
        const rs = layoutTiles(n, mode);
        expect(rs).toHaveLength(n);
        expect(area(rs)).toBeCloseTo(1, 6);
        for (const r of rs) {
          expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
          expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  it("puts two tiles side by side and four in a 2x2 grid", () => {
    expect(layoutTiles(2, "grid")).toEqual([
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ]);
    const four = layoutTiles(4, "grid");
    expect(four.map((r) => [r.w, r.h])).toEqual([
      [0.5, 0.5],
      [0.5, 0.5],
      [0.5, 0.5],
      [0.5, 0.5],
    ]);
  });

  it("widens the last row so it ends flush", () => {
    const three = layoutTiles(3, "grid");
    expect(three[2]).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 });
  });

  it("uses one column when the board is narrow (phone)", () => {
    const rs = layoutTiles(3, "grid", 390, 320);
    expect(rs.every((r) => r.w === 1)).toBe(true);
    expect(layoutTiles(3, "focus", 390, 320).every((r) => r.w === 1)).toBe(true);
  });

  it("gives the first tile two thirds in focus", () => {
    const rs = layoutTiles(3, "focus");
    expect(rs[0].w).toBeCloseTo(2 / 3);
    expect(rs[0].h).toBe(1);
    expect(rs[1].h).toBe(0.5);
  });
});

describe("tiles state", () => {
  it("adds, moves, swaps and removes tiles", () => {
    let s = addTile(EMPTY_TILES, "/gpt", undefined, "a");
    s = addTile(s, "/notes", undefined, "b");
    expect(s.tiles.map((t) => t.section)).toEqual(["gpt", "notes"]);
    s = addTile(s, "/gpt", 2);
    expect(s.tiles.map((t) => t.id)).toEqual(["b", "a"]);
    s = swapTiles(s, "a", "b");
    expect(s.tiles.map((t) => t.id)).toEqual(["a", "b"]);
    s = removeTile(s, "a");
    expect(s.tiles.map((t) => t.id)).toEqual(["b"]);
  });

  it("ignores pages that are not case sections and caps the count", () => {
    expect(addTile(EMPTY_TILES, "/tiles")).toBe(EMPTY_TILES);
    let s = EMPTY_TILES;
    for (let i = 0; i < 12; i++) s = addTile(s, `/gpt/${i}`, undefined, `t${i}`);
    expect(s.tiles).toHaveLength(MAX_TILES);
  });

  it("knows each section", () => {
    expect(sectionOf("/")).toBe("overview");
    expect(sectionOf("/experts/ktas?x=1")).toBe("experts");
    expect(sectionOf("/tiles")).toBeNull();
  });
});

describe("pathFromDrop", () => {
  const o = "https://merqado.ai";
  it("reads a dragged sidebar link", () => {
    expect(pathFromDrop("https://merqado.ai/e/E1/notes", "E1", o)).toBe("/notes");
    expect(pathFromDrop("https://merqado.ai/e/E1", "E1", o)).toBe("/");
    expect(pathFromDrop("#comment\nhttps://merqado.ai/e/E1/gpt/abc?x=1", "E1", o)).toBe("/gpt/abc?x=1");
  });
  it("refuses other cases, other sites and the Tiles page", () => {
    expect(pathFromDrop("https://merqado.ai/e/E2/notes", "E1", o)).toBeNull();
    expect(pathFromDrop("https://evil.example/e/E1/notes", "E1", o)).toBeNull();
    expect(pathFromDrop("https://merqado.ai/e/E1/tiles", "E1", o)).toBeNull();
    expect(pathFromDrop("https://merqado.ai/e/E10/notes", "E1", o)).toBeNull();
  });
});

describe("parseTiles", () => {
  it("keeps valid tiles only", () => {
    const s = parseTiles(JSON.stringify({ mode: "focus", tiles: [{ id: "a", path: "/notes" }, { id: "b", path: "/tiles" }, { id: "c", path: "/notes" }, { id: 4, path: "/gpt" }] }));
    expect(s).toEqual({ mode: "focus", tiles: [{ id: "a", section: "notes", path: "/notes", rect: { x: 0, y: 0, w: GRID_COLS, h: GRID_ROWS } }] });
    expect(parseTiles("nope")).toBeNull();
    expect(parseTiles(null)).toBeNull();
  });
});

const cells = (s: TilesState) => s.tiles.reduce((a, t) => a + t.rect!.w * t.rect!.h, 0);
const board = (paths: string[], mode: "grid" | "focus" = "grid") => {
  let s: TilesState = { ...EMPTY_TILES, mode };
  paths.forEach((p, i) => (s = addTile(s, p, undefined, `t${i}`)));
  return tidy(s);
};

describe("grid board", () => {
  it("tidy fills every cell with no overlaps, in both layouts, for 1 to 9 tiles", () => {
    const all = ["/", "/gpt", "/notes", "/experts", "/deck", "/files", "/workplan", "/channel", "/dictionary"];
    for (let n = 1; n <= 9; n++) {
      for (const mode of ["grid", "focus"] as const) {
        const s = board(all.slice(0, n), mode);
        expect(placesValid(s.tiles)).toBe(true);
        expect(cells(s)).toBe(GRID_COLS * GRID_ROWS);
      }
    }
  });

  it("focus gives starred tiles the main area and the rest a side column", () => {
    let s = board(["/gpt", "/notes", "/experts", "/files"], "focus");
    s = toggleMain(s, "t0");
    s = toggleMain(s, "t1");
    const r = Object.fromEntries(s.tiles.map((t) => [t.id, t.rect!]));
    expect(r.t0.x + r.t0.w).toBeLessThanOrEqual(8);
    expect(r.t1.x + r.t1.w).toBeLessThanOrEqual(8);
    expect(r.t2.x).toBe(8);
    expect(r.t3.x).toBe(8);
    expect(cells(s)).toBe(GRID_COLS * GRID_ROWS);
  });

  it("dragging onto another tile swaps them", () => {
    const s = board(["/gpt", "/notes"]);
    const m = moveTile(s, "t0", 8, 3);
    expect(m.tiles[0].rect).toEqual(s.tiles[1].rect);
    expect(m.tiles[1].rect).toEqual(s.tiles[0].rect);
  });

  it("moves into free cells only when it fits", () => {
    let s = board(["/gpt", "/notes"]);
    s = resizeTile(s, "t1", 6, 6); // t1 now top half of the right side, leaving free cells below it
    expect(s.tiles[1].rect).toEqual({ x: 6, y: 0, w: 6, h: 6 });
    const small = resizeTile(s, "t0", 3, 3);
    const moved = moveTile(small, "t0", 9, 9);
    expect(moved.tiles[0].rect).toEqual({ x: 9, y: 9, w: 3, h: 3 });
    expect(placesValid(moved.tiles)).toBe(true);
  });

  it("resizing stops at neighbours, the board edge and the minimum size", () => {
    const s = board(["/gpt", "/notes"]);
    expect(resizeTile(s, "t0", 10, 12)).toBe(s); // t1 is in the way
    const shrunk = resizeTile(s, "t0", 1, 1);
    expect(shrunk.tiles[0].rect).toEqual({ x: 0, y: 0, w: MIN_W, h: MIN_H });
    const grown = resizeTile(shrunk, "t0", 9, 20);
    expect(grown.tiles[0].rect).toEqual({ x: 0, y: 0, w: 6, h: GRID_ROWS });
    expect(placesValid(grown.tiles)).toBe(true);
  });

  it("a dropped page is placed and the board stays full", () => {
    const s = dropTile(board(["/gpt"]), "/notes");
    expect(s.tiles).toHaveLength(2);
    expect(cells(s)).toBe(GRID_COLS * GRID_ROWS);
  });

  it("re-tidies a saved layout whose tiles overlap", () => {
    const bad = JSON.stringify({ mode: "grid", tiles: [{ id: "a", path: "/gpt", rect: { x: 0, y: 0, w: 8, h: 12 } }, { id: "b", path: "/notes", rect: { x: 4, y: 0, w: 8, h: 12 } }] });
    const s = parseTiles(bad)!;
    expect(placesValid(s.tiles)).toBe(true);
  });
});
