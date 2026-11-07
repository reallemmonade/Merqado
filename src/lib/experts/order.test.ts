import { describe, expect, it } from "vitest";
import { moveBefore } from "./order";

describe("moveBefore", () => {
  it("moves an item rightward onto the target's place", () => {
    expect(moveBefore(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
  });
  it("moves an item leftward onto the target's place", () => {
    expect(moveBefore(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });
  it("leaves the list alone when dropped on itself or an unknown target", () => {
    expect(moveBefore(["a", "b"], "a", "a")).toEqual(["a", "b"]);
    expect(moveBefore(["a", "b"], "a", "z")).toEqual(["a", "b"]);
  });
});
