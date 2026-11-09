import { describe, expect, it } from "vitest";
import { buildPrompt, matchMember, normTitle, parseSuggestions } from "./extract";
import { canSeeTodo, isMine } from "./data";
import type { SourceMessage } from "./sources/types";

const members = [
  { id: "u1", name: "Dana Reyes" },
  { id: "u2", name: "Sam Ito" },
  { id: "u3", name: "Sam Park" },
];
const msg = (n: number, text: string): SourceMessage => ({
  source: "channel",
  key: `channel:m${n}`,
  container: "Core team",
  author: "Dana Reyes",
  at: new Date("2026-11-04T09:00:00Z"),
  text,
  link: `/e/x/channel#m-m${n}`,
  audience: ["consultant", "associate"],
});

describe("matchMember", () => {
  it("matches full and unique first names only", () => {
    expect(matchMember("Dana Reyes", members)).toBe("u1");
    expect(matchMember("dana", members)).toBe("u1");
    expect(matchMember("Sam", members)).toBeNull();
    expect(matchMember("null", members)).toBeNull();
    expect(matchMember(undefined, members)).toBeNull();
  });
});

describe("parseSuggestions", () => {
  const messages = [msg(1, "I will share storyline v2 by Wednesday"), msg(2, "Call booked")];
  it("maps messages, assignees and dates", () => {
    const out = parseSuggestions(
      { todos: [{ title: "Share storyline v2", assignee: "Dana", due: "2026-11-11", from: "M1" }] },
      messages,
      members,
      [],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "Share storyline v2", assigneeId: "u1", dueDate: "2026-11-11" });
    expect(out[0]!.message.key).toBe("channel:m1");
  });
  it("drops repeats, bad refs and bad dates", () => {
    const out = parseSuggestions(
      {
        todos: [
          { title: "Share storyline V2!", assignee: null, due: null, from: "M1" },
          { title: "Ghost", assignee: null, due: null, from: "M9" },
          { title: "Book call", assignee: null, due: "Friday", from: "M2" },
          { title: "book call", assignee: null, due: null, from: "M2" },
        ],
      },
      messages,
      members,
      ["Share storyline v2"],
    );
    expect(out.map((s) => s.title)).toEqual(["Book call"]);
    expect(out[0]!.dueDate).toBeNull();
  });
  it("rejects a malformed reply", () => {
    expect(() => parseSuggestions({ nope: 1 }, messages, members, [])).toThrow();
  });
});

describe("buildPrompt", () => {
  it("numbers messages and lists existing to-dos", () => {
    const { system, user } = buildPrompt([msg(1, "hello")], members, ["Draft memo"], "2026-11-07");
    expect(system).toContain("2026-11-07");
    expect(user).toContain("M1 [Core team] Dana Reyes, 2026-11-04: hello");
    expect(user).toContain("- Draft memo");
  });
});

describe("visibility", () => {
  it("keeps private-chat to-dos with that chat's roles", () => {
    expect(canSeeTodo({ audience: null }, "associate")).toBe(true);
    expect(canSeeTodo({ audience: '["partner"]' }, "associate")).toBe(false);
    expect(canSeeTodo({ audience: '["partner"]' }, "partner")).toBe(true);
  });
  it("counts unassigned to-dos I wrote as mine", () => {
    expect(isMine({ assigneeId: "u1", createdBy: "u2" }, "u1")).toBe(true);
    expect(isMine({ assigneeId: null, createdBy: "u1" }, "u1")).toBe(true);
    expect(isMine({ assigneeId: "u2", createdBy: "u1" }, "u1")).toBe(false);
  });
  it("normalizes titles", () => {
    expect(normTitle(" Send v2 deck! ")).toBe("send v2 deck");
  });
});
