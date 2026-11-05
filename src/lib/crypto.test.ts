import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "./crypto";

beforeAll(() => {
  process.env.MERQADO_SECRET_KEY = randomBytes(32).toString("base64");
});

describe("secret encryption", () => {
  it("round-trips JSON", () => {
    const value = { kind: "anthropic", apiKey: "sk-test", model: "claude-opus-5-5" };
    expect(decryptJson(encryptJson(value))).toEqual(value);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptJson({ a: 1 })).not.toEqual(encryptJson({ a: 1 }));
  });

  it("rejects tampered ciphertext", () => {
    const parts = encryptJson({ a: 1 }).split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptJson(parts.join("."))).toThrow();
  });
});
