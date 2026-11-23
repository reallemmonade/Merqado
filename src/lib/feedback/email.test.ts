import { describe, expect, it, vi } from "vitest";
import { buildFeedbackEmail, sendFeedbackEmail } from "./email";

const base = {
  note: "Send button <b>overlaps</b>\nsecond line",
  photo: "data:image/png;base64,iVBORw0KGgo=",
  from: { name: "Person 01", email: "person01@example.com" },
  firm: "Practice",
  page: "/e/abc",
  at: new Date("2026-11-23T17:00:00Z"),
};

describe("feedback email", () => {
  it("goes to Maxam by default, with the photo inline and the note escaped", () => {
    const m = buildFeedbackEmail(base, {});
    expect(m.to).toEqual(["maxam@guava.ventures"]);
    expect(m.from).toBe("Merqado <onboarding@resend.dev>");
    expect(m.subject).toBe("Feedback: Send button <b>overlaps</b>");
    expect(m.html).toContain("&lt;b&gt;overlaps&lt;/b&gt;");
    expect(m.html).toContain('src="cid:feedback-photo"');
    expect(m.attachments).toEqual([{ filename: "screenshot.png", content: "iVBORw0KGgo=", content_id: "feedback-photo" }]);
    expect(m.reply_to).toBe("person01@example.com");
  });

  it("skips the image and reply-to when there is no photo or a practice address", () => {
    const m = buildFeedbackEmail({ ...base, photo: null, from: { name: "Practice", email: "practice@practice.invalid" } }, {});
    expect(m.attachments).toBeUndefined();
    expect(m.html).not.toContain("<img");
    expect(m.reply_to).toBeUndefined();
  });

  it("does nothing without RESEND_API_KEY", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await sendFeedbackEmail(base, {})).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("posts to Resend with the key", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendFeedbackEmail(base, { RESEND_API_KEY: "re_test" })).toBe(true);
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    spy.mockRestore();
  });
});
