import { describe, expect, it } from "vitest";
import { can, PERSONA_HOME } from "./roles";
import { ARCHETYPES } from "@/db/schema";

describe("permissions", () => {
  it("follows engagement access, not title", () => {
    expect(can("viewer", "ask")).toBe(true);
    expect(can("viewer", "upload")).toBe(false);
    expect(can("editor", "upload")).toBe(true);
    expect(can("editor", "manage_members")).toBe(false);
    expect(can("lead", "manage_connections")).toBe(true);
    expect(can(null, "read")).toBe(false);
  });

  it("gives every archetype a home view", () => {
    for (const a of ARCHETYPES) expect(PERSONA_HOME[a].view).toBeTruthy();
  });
});
