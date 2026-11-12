import { describe, expect, it } from "vitest";
import { snoozeUntil, zonedInstant } from "./snooze";

describe("snoozeUntil", () => {
  const now = new Date("2026-11-12T22:00:00Z"); // Thursday

  it("adds an hour", () => {
    expect(snoozeUntil("hour", now, "UTC").toISOString()).toBe("2026-11-12T23:00:00.000Z");
  });

  it("wakes tomorrow at 08:30 in the person's zone", () => {
    expect(snoozeUntil("tomorrow", now, "America/New_York").toISOString()).toBe("2026-11-13T13:30:00.000Z");
    expect(snoozeUntil("tomorrow", now, "Asia/Tokyo").toISOString()).toBe("2026-11-13T23:30:00.000Z");
  });

  it("wakes next Monday at 08:30", () => {
    expect(snoozeUntil("monday", now, "UTC").toISOString()).toBe("2026-11-16T08:30:00.000Z");
    const monday = new Date("2026-11-16T07:00:00Z");
    expect(snoozeUntil("monday", monday, "UTC").toISOString()).toBe("2026-11-23T08:30:00.000Z");
  });

  it("handles a daylight-saving change", () => {
    expect(zonedInstant("2026-03-09", 8, 30, "America/New_York").toISOString()).toBe("2026-03-09T12:30:00.000Z");
    expect(zonedInstant("2026-03-07", 8, 30, "America/New_York").toISOString()).toBe("2026-03-07T13:30:00.000Z");
  });

  it("falls back to UTC for a missing zone", () => {
    expect(snoozeUntil("tomorrow", now, null).toISOString()).toBe("2026-11-13T08:30:00.000Z");
  });
});
