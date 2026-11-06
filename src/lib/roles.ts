import type { AccessLevel, Archetype } from "@/db/schema";

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
  | "manage_connections";

const REQUIRED: Record<Action, AccessLevel> = {
  read: "viewer",
  ask: "viewer",
  upload: "editor",
  edit_findings: "editor",
  /** Propose experts, log calls, upload transcripts, edit takeaways. */
  edit_experts: "editor",
  /** Approve or pass on proposed experts. Raise to "lead" to limit it to engagement leads. */
  approve_experts: "editor",
  manage_members: "lead",
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
