import { describe, expect, it } from "vitest";
import { age, rowText, webLink } from "./present";

describe("Needs-you rows", () => {
  it("links each kind to its place in the case", () => {
    expect(webLink({ kind: "mention", caseId: "c1", roomId: "r1" })).toBe("/e/c1/channel?room=r1");
    expect(webLink({ kind: "reply", caseId: "c1", roomId: "r1", threadId: "m1" })).toBe("/e/c1/channel?room=r1&thread=m1");
    expect(webLink({ kind: "review", caseId: "c1", taskId: "t1" })).toBe("/e/c1/workplan#task-t1");
    expect(webLink({ kind: "todo", caseId: "c1", todoId: "d1" })).toBe("/e/c1#todo-d1");
  });

  it("words each kind", () => {
    expect(rowText({ kind: "mention", title: "Person 04", body: "Check OEM 15" })).toEqual({ title: "Person 04 mentioned you", sub: "Check OEM 15" });
    expect(rowText({ kind: "review", title: "Sizing model", body: "Module 2" })).toEqual({ title: "Review: Sizing model", sub: "Module 2" });
    expect(rowText({ kind: "todo", title: "Send guide", body: "Person 02" }).sub).toBe("To-do · Person 02");
  });

  it("shows short ages", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    expect(age("2026-11-12T11:48:00Z", now)).toBe("12m");
    expect(age("2026-11-12T09:00:00Z", now)).toBe("3h");
    expect(age("2026-11-03T12:00:00Z", now)).toBe("9d");
  });
});
