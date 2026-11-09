import type { AccessLevel, Archetype } from "@/db/schema";

export const ROLE_ORDER: Archetype[] = ["associate", "consultant", "manager", "partner"];
export const ROLE_LABEL: Record<Archetype, string> = { associate: "Associate", consultant: "Consultant", manager: "Manager", partner: "Partner" };

export const ROLE_RANK: Record<Archetype, number> = { associate: 0, consultant: 1, manager: 2, partner: 3 };

/** The lowest case role that may take an action, on top of the access level. Others need no role. */
const ROLE_MIN: Partial<Record<Action, Archetype>> = {
  approve_experts: "consultant",
  assign_tasks: "consultant",
  edit_plan: "manager",
  set_roles: "manager",
};

/** What each persona lands on. Everyone shares the same engagement data underneath. */
export const PERSONA_HOME: Record<Archetype, { view: string; label: string }> = {
  partner: { view: "overview", label: "Engagement health and the deck" },
  manager: { view: "storyline", label: "Storyline gaps and assignments" },
  consultant: { view: "workstream", label: "Your workstream" },
  associate: { view: "ask", label: "Ask and analyze the data" },
};

/** Default title-to-archetype mapping a new firm starts with; every title is editable. */
export const DEFAULT_FIRM_ROLES: { title: string; archetype: Archetype; rank: number }[] = [
  { title: "Associate", archetype: "associate", rank: 10 },
  { title: "Consultant", archetype: "consultant", rank: 20 },
  { title: "Manager", archetype: "manager", rank: 30 },
  { title: "Partner", archetype: "partner", rank: 40 },
];

const ACCESS_RANK: Record<AccessLevel, number> = { viewer: 0, editor: 1, lead: 2 };

export type Action =
  | "read"
  | "ask"
  | "upload"
  | "edit_findings"
  | "edit_experts"
  | "approve_experts"
  | "manage_members"
  | "assign_tasks"
  | "edit_plan"
  | "set_roles"
  | "manage_connections";

const REQUIRED: Record<Action, AccessLevel> = {
  read: "viewer",
  ask: "viewer",
  upload: "editor",
  edit_findings: "editor",
  /** Propose experts, log calls, upload transcripts, edit takeaways. */
  edit_experts: "editor",
  /** Approve or pass on proposed experts; also needs consultant or above on the case (ROLE_MIN). */
  approve_experts: "editor",
  manage_members: "lead",
  /** Assign, edit and delete workplan tasks. */
  assign_tasks: "editor",
  /** Add or change workplan modules, leads and dates. */
  edit_plan: "editor",
  /** Change who plays which role on the case. */
  set_roles: "editor",
  manage_connections: "lead",
};

/**
 * Permission is decided by engagement access, never by title. A senior consultant
 * can lead one engagement and only view another.
 */
export function can(access: AccessLevel | null | undefined, action: Action): boolean {
  if (!access) return false;
  return ACCESS_RANK[access] >= ACCESS_RANK[REQUIRED[action]];
}

/** Access level and case role together: e.g. approving experts needs edit access and consultant or above. */
export function allows(member: { access: AccessLevel; role: Archetype } | null | undefined, action: Action): boolean {
  if (!member || !can(member.access, action)) return false;
  const min = ROLE_MIN[action];
  return !min || ROLE_RANK[member.role] >= ROLE_RANK[min];
}
