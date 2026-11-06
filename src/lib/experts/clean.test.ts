import { describe, expect, it } from "vitest";
import { chunkTranscript, cleanTranscriptWithAI, FLAG_MARKER, looksSafe, parseCleanerReply } from "./clean";

describe("chunkTranscript", () => {
  it("keeps paragraphs together and respects the size limit", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Para ${i} ` + "x".repeat(40)).join("\n\n");
    const chunks = chunkTranscript(text, 120);
    expect(chunks.every((c) => c.length <= 120)).toBe(true);
    expect(chunks.join("\n\n")).toBe(text);
  });
});

describe("parseCleanerReply", () => {
  it("splits text and flags", () => {
    const r = parseCleanerReply(`Expert: Prices rose 5%.\n${FLAG_MARKER}\n- "rose 5%" | possible MNPI\n`);
    expect(r.text).toBe("Expert: Prices rose 5%.");
    expect(r.flags).toEqual([{ quote: "rose 5%", reason: "possible MNPI" }]);
  });
  it("handles no flags", () => {
    expect(parseCleanerReply("Expert: Hi.").flags).toEqual([]);
    expect(parseCleanerReply(`Expert: Hi.\n${FLAG_MARKER}\nNone`).flags).toEqual([]);
  });
});

describe("looksSafe", () => {
  it("rejects empty, much shorter or much longer output", () => {
    expect(looksSafe("a".repeat(100), "")).toBe(false);
    expect(looksSafe("a".repeat(100), "a".repeat(20))).toBe(false);
    expect(looksSafe("a".repeat(100), "a".repeat(150))).toBe(false);
    expect(looksSafe("a".repeat(100), "a".repeat(80))).toBe(true);
  });
});

describe("cleanTranscriptWithAI", () => {
  it("keeps a section verbatim when the model's output looks wrong", async () => {
    const verbatim = "Um, so, uh, prices went up, like, five percent.";
    const res = await cleanTranscriptWithAI(verbatim, [], async () => ({ text: "Summary.", model: "m", usage: { inputTokens: 0, outputTokens: 0 }, refused: false }));
    expect(res.text).toBe(verbatim);
    expect(res.keptVerbatim).toBe(1);
  });
  it("uses the cleaned text when it passes", async () => {
    const res = await cleanTranscriptWithAI("Um, so, uh, prices went up, like, five percent.", [], async () => ({
      text: `Expert: Prices went up five percent.\n${FLAG_MARKER}\n`,
      model: "m",
      usage: { inputTokens: 0, outputTokens: 0 },
      refused: false,
    }));
    expect(res.text).toBe("Expert: Prices went up five percent.");
    expect(res.keptVerbatim).toBe(0);
  });
});
