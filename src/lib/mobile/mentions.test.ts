import { describe, expect, it } from "vitest";
import { findMentions } from "@/lib/mobile/mentions";

const people = [
  { id: "a", name: "Maxam Lemmon" },
  { id: "b", name: "Jordan Reyes" },
  { id: "c", name: "Jordan Lee" },
  { id: "d", name: "Priya Lal" },
];

describe("findMentions", () => {
  it("matches a unique first name", () => {
    expect(findMentions("@Maxam can you check this?", people)).toEqual(["a"]);
  });
  it("needs the full name when first names clash", () => {
    expect(findMentions("@Jordan hi", people)).toEqual([]);
    expect(findMentions("thanks @jordan reyes!", people)).toEqual(["b"]);
  });
  it("ignores emails and partial words", () => {
    expect(findMentions("mail maxam@guava.ventures", people)).toEqual([]);
    expect(findMentions("@Maxamilian", people)).toEqual([]);
  });
  it("@all mentions everyone", () => {
    expect(findMentions("@all standup moved", people).sort()).toEqual(["a", "b", "c", "d"]);
  });
});
