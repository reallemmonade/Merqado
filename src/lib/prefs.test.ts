import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, initials, parsePrefs, serializePrefs } from "./prefs";

describe("prefs", () => {
  it("round-trips", () => {
    const p = { ...DEFAULT_PREFS, theme: "dark" as const, accent: "rose" as const, caseMenu: "full" as const };
    expect(parsePrefs(serializePrefs(p))).toEqual(p);
  });

  it("falls back on missing, damaged or unknown values", () => {
    expect(parsePrefs(undefined)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("%7Bnot json")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(serializePrefs({ ...DEFAULT_PREFS, theme: "neon" } as never)).theme).toBe("system");
  });

  it("makes initials", () => {
    expect(initials("Maxam Lemmon")).toBe("ML");
    expect(initials("Cher")).toBe("C");
    expect(initials("Ana de la Cruz")).toBe("AC");
  });
});
