import { describe, expect, it } from "vitest";
import { DEFAULT_STANDARD } from "./model";
import { buildOnboarding, networksOverride, roomRows, teamRowsToAdd } from "./newcase";

const std = { ...DEFAULT_STANDARD, networks: [{ name: "Network 1", email: "a@n1.test" }, { name: "Network 2", email: "b@n2.test" }] };

describe("new case wizard", () => {
  it("keeps typed fields over the AI fill and AI angle detail for kept angles", () => {
    const fill = {
      market: "ai market",
      geography: "US",
      angles: [{ id: "", name: "OEMs", n: "~20", who: "Device OEMs", companies: "OEM 01", roles: "VP Ops", screeners: "Q1" }],
    };
    const d = buildOnboarding(fill, { market: "Medical CDMO", objective: "", weeks: "8 wks", angles: [{ name: "OEMs", n: "~15" }, { name: " ", n: "" }], networks: ["Network 1", "Network 2"], docs: [] }, std);
    expect(d.market).toBe("Medical CDMO");
    expect(d.geography).toBe("US");
    expect(d.weeks).toBe("8");
    expect(d.angles).toHaveLength(1);
    expect(d.angles[0]).toMatchObject({ name: "OEMs", n: "~15", who: "Device OEMs", screeners: "Q1" });
    expect(d.standard).toBeNull();
    expect(d.started).toBe(true);
  });

  it("overrides the firm networks only when some are left out", () => {
    expect(networksOverride(std, ["network 1", "Network 2"])).toBeNull();
    expect(networksOverride(std, ["Network 2"])?.networks).toEqual([{ name: "Network 2", email: "b@n2.test" }]);
  });

  it("makes rooms from known templates in order", () => {
    const rows = roomRows("e1", ["MDs only", "Core team", "Nope"], "u1");
    expect(rows.map((r) => r.name)).toEqual(["Core team", "MDs only"]);
    expect(rows.map((r) => r.sort)).toEqual([0, 1]);
  });

  it("adds only firm people, once, and never the creator", () => {
    const rows = teamRowsToAdd(
      [
        { userId: "u1", caseRole: "manager" },
        { userId: "u2", caseRole: "associate" },
        { userId: "u2", caseRole: "partner" },
        { userId: "x", caseRole: null },
      ],
      new Set(["u1", "u2"]),
      "u1",
    );
    expect(rows).toEqual([{ userId: "u2", caseRole: "associate" }]);
  });
});
