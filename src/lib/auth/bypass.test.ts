import { describe, expect, it } from "vitest";
import { bypassEmail } from "./bypass";

const now = Date.parse("2026-11-23T12:00:00Z");
const env = { SIGNIN_BYPASS_CODE: "XXXX", SIGNIN_BYPASS_EMAIL: "Me@Firm.com", SIGNIN_BYPASS_UNTIL: "2026-11-25" };

describe("sign-in bypass", () => {
  it("signs in as the named user when the code is typed", () => {
    expect(bypassEmail(" xxxx ", env, now)).toBe("me@firm.com");
  });
  it("ignores other text", () => {
    expect(bypassEmail("YYYY", env, now)).toBeNull();
    expect(bypassEmail("", env, now)).toBeNull();
  });
  it("is off unless all three are set", () => {
    expect(bypassEmail("XXXX", {}, now)).toBeNull();
    expect(bypassEmail("XXXX", { ...env, SIGNIN_BYPASS_EMAIL: "" }, now)).toBeNull();
    expect(bypassEmail("XXXX", { ...env, SIGNIN_BYPASS_UNTIL: "" }, now)).toBeNull();
    expect(bypassEmail("XXXX", { ...env, SIGNIN_BYPASS_CODE: "ab" }, now)).toBeNull();
  });
  it("expires, and can't be set more than 14 days out", () => {
    expect(bypassEmail("XXXX", { ...env, SIGNIN_BYPASS_UNTIL: "2026-11-23T11:00:00Z" }, now)).toBeNull();
    expect(bypassEmail("XXXX", { ...env, SIGNIN_BYPASS_UNTIL: "2027-03-01" }, now)).toBeNull();
  });
});
