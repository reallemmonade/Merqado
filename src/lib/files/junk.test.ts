import { describe, expect, it } from "vitest";
import { insideFolder } from "./folders";
import { isJunk } from "./junk";

describe("dropped folder clean-up", () => {
  it("skips system and Office lock files", () => {
    for (const n of [".DS_Store", "Thumbs.db", "desktop.ini", "~$Deck v3.pptx", "Icon\r"]) expect(isJunk(n)).toBe(true);
    for (const n of ["Deck v3.pptx", "OEM 16 notes.docx", "icon.png"]) expect(isJunk(n)).toBe(false);
  });
});

describe("insideFolder", () => {
  it("takes % and _ in a folder name literally", () => {
    expect(insideFolder("Q1_data")).toBe("Q1\\_data/%");
    expect(insideFolder("100%")).toBe("100\\%/%");
    expect(insideFolder("Interviews")).toBe("Interviews/%");
  });
});
