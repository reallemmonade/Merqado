import { describe, expect, it } from "vitest";
import { MICROSOFT_CONSUMER_TENANT, workEmailFromClaims } from "./platform";

describe("work email from Google claims", () => {
  it("accepts a verified Workspace account", () => {
    expect(workEmailFromClaims("google", { email: "Jo@Acme.com", email_verified: true, hd: "acme.com" })).toEqual({
      email: "jo@acme.com",
    });
  });
  it("rejects personal Gmail (no hd)", () => {
    expect(workEmailFromClaims("google", { email: "jo@gmail.com", email_verified: true })).toEqual({
      error: "personal_account",
    });
  });
  it("rejects unverified email or a domain that doesn't match hd", () => {
    expect(workEmailFromClaims("google", { email: "jo@acme.com", email_verified: false, hd: "acme.com" })).toEqual({
      error: "no_email",
    });
    expect(workEmailFromClaims("google", { email: "jo@other.com", email_verified: true, hd: "acme.com" })).toEqual({
      error: "no_email",
    });
  });
});

describe("work email from Microsoft claims", () => {
  it("uses the UPN, not the editable email claim", () => {
    expect(
      workEmailFromClaims("microsoft", { tid: "t1", preferred_username: "Jo@Acme.com", email: "ceo@victim.com" }),
    ).toEqual({ email: "jo@acme.com" });
  });
  it("rejects personal Microsoft accounts", () => {
    expect(
      workEmailFromClaims("microsoft", { tid: MICROSOFT_CONSUMER_TENANT, preferred_username: "jo@outlook.com" }),
    ).toEqual({ error: "personal_account" });
  });
});
