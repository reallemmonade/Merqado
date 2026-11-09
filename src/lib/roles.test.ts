import { describe, expect, it } from "vitest";
import { allows, can, PERSONA_HOME } from "./roles";
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

describe("case roles", () => {
  it("needs consultant or above to approve experts and assign tasks", () => {
    expect(allows({ access: "editor", role: "associate" }, "approve_experts")).toBe(false);
    expect(allows({ access: "editor", role: "associate" }, "edit_experts")).toBe(true);
    expect(allows({ access: "editor", role: "consultant" }, "approve_experts")).toBe(true);
    expect(allows({ access: "editor", role: "consultant" }, "assign_tasks")).toBe(true);
  });
  it("keeps modules, dates and roles for managers and up", () => {
    expect(allows({ access: "editor", role: "consultant" }, "edit_plan")).toBe(false);
    expect(allows({ access: "editor", role: "manager" }, "edit_plan")).toBe(true);
    expect(allows({ access: "lead", role: "partner" }, "set_roles")).toBe(true);
  });
  it("still needs edit access whatever the role", () => {
    expect(allows({ access: "viewer", role: "partner" }, "approve_experts")).toBe(false);
    expect(allows(null, "read")).toBe(false);
  });
});
