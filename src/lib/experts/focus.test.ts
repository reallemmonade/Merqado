import { describe, expect, it } from "vitest";
import type { ExpertRow } from "./data";
import { resolveFocus } from "./focus";

const ex = (id: string, typeId: string, status: ExpertRow["status"], interviewDate: string | null = null) =>
  ({ id, typeId, status, interviewDate, topicIds: [], honorarium: 0 }) as unknown as ExpertRow;

const data = {
  experts: [ex("a", "cust", "completed", "2026-10-01"), ex("b", "cust", "scheduled", "2026-11-20"), ex("c", "comp", "completed", "2026-10-05"), ex("d", "cust", "declined")],
  types: [
    { id: "cust", name: "Customers" },
    { id: "comp", name: "Competitors" },
  ],
  topics: [],
  transcripts: [],
};

describe("resolveFocus from the Overview", () => {
  it("status:<status> picks everyone at that status, latest call first", () => {
    expect(resolveFocus(data, "status:completed")?.ids).toEqual(["c", "a"]);
    expect(resolveFocus(data, "status:scheduled")?.ids).toEqual(["b"]);
  });
  it("type:<id> picks everyone of that type except declined", () => {
    expect(resolveFocus(data, "type:cust")?.ids).toEqual(["a", "b"]);
  });
  it("ignores unknown keys", () => {
    expect(resolveFocus(data, "status:nope")).toBeNull();
    expect(resolveFocus(data, "type:missing")).toBeNull();
  });
});
