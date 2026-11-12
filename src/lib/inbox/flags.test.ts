import { describe, expect, it } from "vitest";
import { flagLabel, taskFlag } from "./flags";

const now = new Date("2026-11-12T12:00:00Z");
const today = "2026-11-12";

describe("taskFlag", () => {
  it("flags overdue before idle", () => {
    expect(taskFlag({ due: "2026-11-09", changedAt: new Date("2026-10-01") }, now, today)).toEqual({ flag: "overdue", days: 3 });
  });
  it("is not overdue on the due date itself", () => {
    expect(taskFlag({ due: today, changedAt: now }, now, today)).toBeNull();
  });
  it("flags idle after 7 days without a change", () => {
    expect(taskFlag({ due: null, changedAt: new Date("2026-11-03T11:00:00Z") }, now, today)).toEqual({ flag: "idle", days: 9 });
    expect(taskFlag({ due: "2026-12-01", changedAt: new Date("2026-11-07T12:00:00Z") }, now, today)).toBeNull();
  });
  it("labels", () => {
    expect(flagLabel({ flag: "idle", days: 9 })).toBe("Idle 9d");
    expect(flagLabel({ flag: "overdue", days: 2 })).toBe("Overdue 2d");
  });
});
