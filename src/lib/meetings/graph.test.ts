import { describe, expect, it } from "vitest";
import { toMeeting, type GraphEvent } from "./graph";

const now = new Date("2026-11-23T12:00:00Z");
const ev = (over: Partial<GraphEvent> = {}): GraphEvent => ({
  id: "id1",
  iCalUId: "ical1",
  subject: "CASE001 steerco",
  start: { dateTime: "2026-11-23T10:00:00.0000000" },
  end: { dateTime: "2026-11-23T10:58:00.0000000" },
  organizer: { emailAddress: { address: "A@Firm.test" } },
  attendees: [{ emailAddress: { address: "b@firm.test" } }, { emailAddress: { address: "a@firm.test" } }],
  onlineMeetingProvider: "teamsForBusiness",
  onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/x" },
  ...over,
});

describe("toMeeting", () => {
  it("reads a finished Teams meeting", () => {
    expect(toMeeting(ev(), now)).toEqual({
      externalId: "ical1",
      subject: "CASE001 steerco",
      startAt: new Date("2026-11-23T10:00:00Z"),
      minutes: 58,
      people: ["a@firm.test", "b@firm.test"],
      source: "teams",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/x",
    });
  });

  it("marks other calls as Outlook", () => {
    expect(toMeeting(ev({ onlineMeetingProvider: "unknown", onlineMeeting: null }), now)?.source).toBe("outlook");
  });

  it("skips meetings still running, cancelled or all-day", () => {
    expect(toMeeting(ev({ end: { dateTime: "2026-11-23T13:00:00" } }), now)).toBeNull();
    expect(toMeeting(ev({ isCancelled: true }), now)).toBeNull();
    expect(toMeeting(ev({ isAllDay: true }), now)).toBeNull();
  });
});
