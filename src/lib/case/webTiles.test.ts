import { describe, expect, it } from "vitest";
import { hostOf, webUrl } from "./webTiles";
import { addWebTile, EMPTY_TILES, parseTiles, tidy } from "./tiles";

describe("webUrl", () => {
  it("takes https pages, adding https when no scheme is typed", () => {
    expect(webUrl("example.com/a")).toBe("https://example.com/a");
    expect(webUrl("  https://www.fda.gov/ ")).toBe("https://www.fda.gov/");
  });
  it("refuses other schemes, spaces and bare words", () => {
    expect(webUrl("http://example.com")).toBeNull();
    expect(webUrl("javascript:alert(1)")).toBeNull();
    expect(webUrl("data:text/html,hi")).toBeNull();
    expect(webUrl("two words.com")).toBeNull();
    expect(webUrl("localhost")).toBeNull();
    expect(webUrl("")).toBeNull();
  });
  it("shows the host without www", () => {
    expect(hostOf("https://www.example.com/x")).toBe("example.com");
  });
});

describe("web tiles", () => {
  it("adds a page once and gives it a place", () => {
    let s = addWebTile(EMPTY_TILES, "https://example.com/");
    s = addWebTile(s, "https://example.com/");
    expect(s.tiles).toHaveLength(1);
    s = tidy(s);
    expect(s.tiles[0].rect).toEqual({ x: 0, y: 0, w: 12, h: 12 });
    expect(s.tiles[0].section).toBe("web");
  });
  it("keeps web tiles when a saved layout is read back, and drops bad addresses", () => {
    const saved = JSON.stringify({
      mode: "grid",
      tiles: [
        { id: "w1", section: "web", path: "https://example.com/", url: "https://example.com/" },
        { id: "w2", section: "web", path: "http://insecure.example/", url: "http://insecure.example/" },
        { id: "n1", section: "notes", path: "/notes" },
      ],
    });
    const s = parseTiles(saved);
    expect(s?.tiles.map((t) => t.id)).toEqual(["w1", "n1"]);
    expect(s?.tiles[0].url).toBe("https://example.com/");
  });
});
