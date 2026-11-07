import { describe, expect, it } from "vitest";
import { findTestAccount, parseTestAccounts, testAccountFirmDomain } from "./test-accounts";
import { verifiedGoogleEmail } from "./platform";

describe("test accounts", () => {
  it("parses emails with optional titles", () => {
    expect(parseTestAccounts(" Jo@Gmail.com , sam@gmail.com:Manager,,bad")).toEqual([
      { email: "jo@gmail.com", title: null },
      { email: "sam@gmail.com", title: "Manager" },
    ]);
  });
  it("only matches listed emails", () => {
    const env = { TEST_ACCOUNT_EMAILS: "jo@gmail.com" };
    expect(findTestAccount("JO@gmail.com", env)).toEqual({ email: "jo@gmail.com", title: null });
    expect(findTestAccount("someone@gmail.com", env)).toBeNull();
    expect(findTestAccount("jo@gmail.com", {})).toBeNull();
  });
  it("joins the admin's firm unless a domain is given", () => {
    expect(testAccountFirmDomain({ SSO_ADMIN_EMAIL: "max@guava.ventures" })).toBe("guava.ventures");
    expect(
      testAccountFirmDomain({ SSO_ADMIN_EMAIL: "max@guava.ventures", TEST_ACCOUNT_FIRM_DOMAIN: "acme.com" }),
    ).toBe("acme.com");
  });
  it("requires a verified Google email", () => {
    expect(verifiedGoogleEmail({ email: "Jo@gmail.com", email_verified: true })).toBe("jo@gmail.com");
    expect(verifiedGoogleEmail({ email: "jo@gmail.com", email_verified: false })).toBeNull();
  });
});
