import { describe, expect, it } from "vitest";
import { allowedMoves, checkMove, dueOf, primaryMove, reviewerOf, type TaskLike } from "./tasks";

const t = (over: Partial<TaskLike>): TaskLike => ({ status: "not_yet", assigneeId: "assoc", reviewerId: "cons", createdBy: "cons", ...over });

describe("task rules", () => {
  it("falls back from reviewer to assigner to module lead", () => {
    expect(reviewerOf(t({}))).toBe("cons");
    expect(reviewerOf(t({ reviewerId: null }))).toBe("cons");
    expect(reviewerOf(t({ reviewerId: null, createdBy: null }), "lead")).toBe("lead");
    expect(reviewerOf(t({ reviewerId: null, createdBy: null }))).toBeNull();
  });

  it("lets the assignee start and hand in, but not close", () => {
    expect(primaryMove(t({}), "assoc", true)).toBe("in_progress");
    expect(primaryMove(t({ status: "in_progress" }), "assoc", true)).toBe("almost_done");
    expect(allowedMoves(t({ status: "almost_done" }), "assoc", true)).not.toContain("done");
    expect(primaryMove(t({ status: "almost_done" }), "assoc", true)).toBeNull();
  });

  it("lets the reviewer close or send back", () => {
    const moves = allowedMoves(t({ status: "almost_done" }), "cons", true);
    expect(moves).toContain("done");
    expect(moves).toContain("in_progress");
    expect(allowedMoves(t({ status: "done" }), "cons", true)).toEqual(["in_progress"]);
  });

  it("gives bystanders and viewers nothing", () => {
    expect(allowedMoves(t({ status: "in_progress" }), "other", true)).toEqual([]);
    expect(allowedMoves(t({}), "assoc", false)).toEqual([]);
  });

  it("lets the assignee close a task with no reviewer, and self-reviewers skip review", () => {
    expect(primaryMove(t({ status: "in_progress", reviewerId: null, createdBy: null }), "assoc", true)).toBe("done");
    expect(primaryMove(t({ status: "in_progress", reviewerId: "assoc" }), "assoc", true)).toBe("done");
  });

  it("ticks to ready for review for the assignee and done for the reviewer", () => {
    expect(checkMove(t({}), "assoc", true)).toBe("almost_done");
    expect(checkMove(t({ status: "almost_done" }), "cons", true)).toBe("done");
    expect(checkMove(t({ status: "almost_done" }), "assoc", true)).toBeNull();
  });

  it("uses the task's due date, else its column", () => {
    const dates = new Map([["ms1", "2026-11-16"]]);
    expect(dueOf({ dueDate: "2026-11-13", milestoneId: "ms1" }, dates)).toBe("2026-11-13");
    expect(dueOf({ dueDate: null, milestoneId: "ms1" }, dates)).toBe("2026-11-16");
    expect(dueOf({ dueDate: null, milestoneId: null }, dates)).toBeNull();
  });
});
