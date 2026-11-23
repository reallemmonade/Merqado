import { describe, expect, it } from "vitest";
import { hideClients, isAlertable, readHistory, senderName } from "./check";

describe("email alerts", () => {
  it("alerts only on unread inbox mail outside quiet tabs", () => {
    expect(isAlertable(["INBOX", "UNREAD"])).toBe(true);
    expect(isAlertable(["INBOX", "UNREAD", "CATEGORY_PROMOTIONS"])).toBe(false);
    expect(isAlertable(["SENT", "UNREAD"])).toBe(false);
    expect(isAlertable(["INBOX"])).toBe(false);
  });

  it("closes a thread once it is read or archived after the alert", () => {
    const { added, closed } = readHistory([
      { history: [{ messagesAdded: [{ message: { id: "m1", threadId: "t1", labelIds: ["INBOX", "UNREAD"] } }] }] },
      { history: [{ labelsRemoved: [{ message: { id: "m1", threadId: "t1" }, labelIds: ["UNREAD"] }] }] },
    ]);
    expect(added.has("t1")).toBe(false);
    expect(closed.has("t1")).toBe(true);
  });

  it("keeps the newest alert per thread", () => {
    const { added } = readHistory([
      { history: [{ messagesAdded: [{ message: { id: "m1", threadId: "t1", labelIds: ["INBOX", "UNREAD"] } }] }] },
      { history: [{ messagesAdded: [{ message: { id: "m2", threadId: "t1", labelIds: ["INBOX", "UNREAD"] } }] }] },
    ]);
    expect(added.get("t1")).toBe("m2");
  });

  it("shows the sender's name, not the address", () => {
    expect(senderName('"Dana Lee" <dana@example.com>')).toBe("Dana Lee");
    expect(senderName("dana@example.com")).toBe("dana@example.com");
  });

  it("replaces client names with Client", () => {
    expect(hideClients("Re: Acme Corp call", ["Acme Corp"])).toBe("Re: Client call");
    expect(hideClients("Hello", ["Client"])).toBe("Hello");
  });
});
