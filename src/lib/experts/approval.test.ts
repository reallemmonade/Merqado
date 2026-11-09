import { describe, expect, it } from "vitest";
import { canPass, isApproved, signoffFor, slots, waitingOn, type Signer } from "./approval";

const team: Signer[] = [
  { id: "assoc", archetype: "associate" },
  { id: "senior", archetype: "associate" },
  { id: "cons", archetype: "consultant" },
  { id: "mgr", archetype: "manager" },
];

describe("expert sign-offs", () => {
  it("needs only a consultant when no one else asked", () => {
    const s = { requestedBy: null, approvals: [] };
    expect(waitingOn(s, team)).toEqual(["cons"]);
    expect(signoffFor(s, "assoc", team)).toBeNull();
    expect(signoffFor(s, "cons", team)).toBe("consultant");
    expect(isApproved({ ...s, approvals: ["cons"] }, team)).toBe(true);
  });

  it("needs both the consultant and a senior associate who asked", () => {
    const s = { requestedBy: "senior", approvals: [] as string[] };
    expect(waitingOn(s, team).sort()).toEqual(["cons", "senior"]);
    expect(signoffFor(s, "senior", team)).toBe("requester");
    expect(isApproved({ ...s, approvals: ["senior"] }, team)).toBe(false);
    expect(isApproved({ ...s, approvals: ["cons"] }, team)).toBe(false);
    expect(waitingOn({ ...s, approvals: ["cons"] }, team)).toEqual(["senior"]);
    expect(isApproved({ ...s, approvals: ["cons", "senior"] }, team)).toBe(true);
  });

  it("doesn't let a manager who asked also count as the consultant", () => {
    const s = { requestedBy: "mgr", approvals: ["mgr"] };
    expect(isApproved(s, team)).toBe(false);
    expect(slots(s, team).find((x) => x.slot === "consultant")!.done).toBe(false);
    expect(signoffFor(s, "mgr", team)).toBeNull();
    expect(signoffFor(s, "cons", team)).toBe("consultant");
  });

  it("takes one sign-off when the consultant is the one who asked", () => {
    const s = { requestedBy: "cons", approvals: ["cons"] };
    expect(slots(s, team)).toHaveLength(1);
    expect(isApproved(s, team)).toBe(true);
  });

  it("falls back to managers when the case has no consultant", () => {
    const noCons = team.filter((m) => m.id !== "cons");
    expect(waitingOn({ requestedBy: null, approvals: [] }, noCons)).toEqual(["mgr"]);
  });

  it("lets the asker or a consultant pass, not other associates", () => {
    const s = { requestedBy: "senior", approvals: [] };
    expect(canPass(s, "senior", team)).toBe(true);
    expect(canPass(s, "cons", team)).toBe(true);
    expect(canPass(s, "assoc", team)).toBe(false);
  });
});
