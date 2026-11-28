import { describe, expect, it } from "vitest";
import { keyTail, looksLikeOpenAIKey } from "./key";

describe("looksLikeOpenAIKey", () => {
  it("accepts project and legacy keys", () => {
    expect(looksLikeOpenAIKey("sk-proj-abcdefghijklmnopqrstuvwxyz0123")).toBe(true);
    expect(looksLikeOpenAIKey(" sk-abcdefghijklmnopqrstuvwxyz0123 ")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(looksLikeOpenAIKey("hello")).toBe(false);
    expect(looksLikeOpenAIKey("sk-short")).toBe(false);
    expect(looksLikeOpenAIKey(42)).toBe(false);
  });
  it("shows the last four characters", () => {
    expect(keyTail("sk-abcdef1234")).toBe("1234");
  });
});
