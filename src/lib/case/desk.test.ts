import { describe, expect, it } from "vitest";
import { buildDesk } from "./desk";

const now = new Date("2026-11-12T12:00:00Z");
const t = (o: Partial<Parameters<typeof buildDesk>[0]["tasks"][number]>) => ({
  id: "t", moduleId: "m1", milestoneId: null, title: "Task", assigneeId: null, reviewerId: null, createdBy: null,
  status: "not_yet" as const, dueDate: null, createdAt: now, updatedAt: now, ...o,
});

describe("buildDesk", () => {
  const wp = {
    modules: [{ id: "m1", name: "Market sizing", leadId: "lead" }, { id: "m2", name: "Customers", leadId: null }],
    milestones: [{ id: "u1", date: "2026-11-10" }],
    tasks: [
      t({ id: "a", status: "done", dueDate: "2026-11-01" }),
      t({ id: "b", status: "in_progress", milestoneId: "u1", assigneeId: "amy" }),
      t({ id: "c", status: "almost_done", dueDate: "2026-11-20", assigneeId: "bo" }),
      t({ id: "d", moduleId: "m2", updatedAt: new Date("2026-11-01T12:00:00Z") }),
    ],
  };

  it("counts tasks per workstream and puts reviews first", () => {
    const [market, customers] = buildDesk(wp, "lead", now, "2026-11-12");
    expect(market!.counts).toMatchObject({ done: 1, in_progress: 1, almost_done: 1, not_yet: 0, total: 3 });
    expect(market!.tasks.map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(market!.people).toEqual(["lead", "amy", "bo"]);
    expect(customers!.counts.total).toBe(1);
  });

  it("needs = overdue tasks plus reviews waiting on me; done tasks are never flagged", () => {
    const [market, customers] = buildDesk(wp, "lead", now, "2026-11-12");
    expect(market!.tasks.find((x) => x.id === "b")!.flag).toEqual({ flag: "overdue", days: 2 });
    expect(market!.tasks.find((x) => x.id === "a")!.flag).toBeNull();
    expect(market!.needs).toBe(2);
    expect(customers!.tasks[0]!.flag?.flag).toBe("idle");
    expect(customers!.needs).toBe(0);
    expect(buildDesk(wp, "someone-else", now, "2026-11-12")[0]!.needs).toBe(1);
  });
});
