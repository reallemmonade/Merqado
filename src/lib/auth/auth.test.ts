import { describe, expect, it } from "vitest";
import { emailDomain, parseDomains } from "./oidc";
import { hashToken, safeReturnTo } from "./session";

describe("sign-in helpers", () => {
  it("reads email domains", () => {
    expect(emailDomain("Jane@Acme.COM")).toBe("acme.com");
    expect(emailDomain("not-an-email")).toBeNull();
    expect(emailDomain("@acme.com")).toBeNull();
    expect(parseDomains(" Acme.com, acme.co.uk ,,")).toEqual(["acme.com", "acme.co.uk"]);
  });

  it("only returns to same-site paths", () => {
    expect(safeReturnTo("/e/123")).toBe("/e/123");
    expect(safeReturnTo("//evil.com")).toBe("/");
    expect(safeReturnTo("https://evil.com")).toBe("/");
    expect(safeReturnTo("/\\evil.com")).toBe("/");
    expect(safeReturnTo(undefined)).toBe("/");
  });

  it("never stores raw session tokens", () => {
    expect(hashToken("abc")).toHaveLength(64);
    expect(hashToken("abc")).not.toContain("abc");
  });
});
