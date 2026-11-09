import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs, serializePrefs } from "../prefs";
import { guavaSky } from "./sky";

const NY = { name: "New York", lat: 40.71, lon: -74.01, tz: "America/New_York" };
const date = new Date(Date.UTC(2026, 10, 7, 17));

describe("guava theme", () => {
  it("keeps Guava settings in the prefs cookie", () => {
    const p = { ...DEFAULT_PREFS, theme: "guava" as const, guava: { look: "marigold" as const, font: "poster" as const, city: "London", cycle: false, freeze: 7.25 } };
    expect(parsePrefs(serializePrefs(p))).toEqual(p);
    expect(parsePrefs(serializePrefs({ ...p, guava: { look: "neon", freeze: 99 } } as never)).guava).toEqual(DEFAULT_PREFS.guava);
  });

  it("is light at noon, dark at night, and Night Shift is always dark", () => {
    expect(guavaSky({ city: NY, cycle: false, freeze: 12, date }).scheme).toBe("light");
    expect(guavaSky({ city: NY, cycle: false, freeze: 23, date }).scheme).toBe("dark");
    expect(guavaSky({ look: "nightshift", city: NY, cycle: false, freeze: 12, date }).scheme).toBe("dark");
  });

  it("sets the variables the app styles with", () => {
    const vars = guavaSky({ city: NY, at: 15, date }).vars as Record<string, string>;
    for (const k of ["--ground", "--panel", "--panel-glass", "--ink", "--ink-soft", "--rule", "--accent", "--accent-fill", "--on-accent", "--accent-soft", "--signal", "--art1", "--sun-x", "--f-body"]) {
      expect(vars[k], k).toBeTruthy();
    }
  });
});
