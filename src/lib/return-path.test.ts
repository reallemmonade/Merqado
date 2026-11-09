import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it("keeps same-site paths", () => expect(safeReturnPath("/e/abc/notes")).toBe("/e/abc/notes"));
  it("sends anything else home", () => {
    for (const bad of [undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "e/abc"]) expect(safeReturnPath(bad)).toBe("/");
  });
});
