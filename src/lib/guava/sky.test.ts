import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs, serializePrefs } from "../prefs";
import { guavaSky } from "./sky";

const NY = { name: "New York", lat: 40.71, lon: -74.01, tz: "America/New_York" };
const date = new Date(Date.UTC(2026, 10, 7, 17));

describe("guava theme", () => {
  it("keeps Guava settings in the prefs cookie", () => {
    const p = { ...DEFAULT_PREFS, guava: { look: "marigold" as const, font: "poster" as const, city: { name: "London", lat: 51.5, lon: -0.1, tz: "Europe/London" }, cycle: false, freeze: 7.25 } };
    expect(parsePrefs(serializePrefs(p))).toEqual(p);
    expect(parsePrefs(serializePrefs({ ...p, guava: { look: "neon", freeze: 99, city: { name: "X", lat: 300 } } } as never)).guava).toEqual(DEFAULT_PREFS.guava);
    // A location is kept to about 0.1 degree.
    const near = parsePrefs(serializePrefs({ ...p, guava: { ...p.guava, city: { name: "My location", lat: 40.71234, lon: -74.00597, tz: "America/New_York" } } }));
    expect(near.guava.city).toEqual({ name: "My location", lat: 40.7, lon: -74, tz: "America/New_York" });
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
