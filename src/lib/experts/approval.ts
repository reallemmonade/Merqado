import type { Archetype } from "@/db/schema";
import { ROLE_RANK } from "@/lib/roles";

/**
 * Who signs off a proposed expert.
 * A consultant always does. If someone else asked for the expert (say a senior associate or a
 * manager), that person signs off too, and the expert is approved only once both have.
 */
export interface SignoffState {
  requestedBy: string | null;
  approvals: string[];
}

export interface Signer {
  id: string;
  /** Effective role on the case. */
  archetype: Archetype;
}

export type Slot = "consultant" | "requester";

const isSenior = (m: Signer | undefined) => !!m && ROLE_RANK[m.archetype] >= ROLE_RANK.consultant;

/** The consultants an approval goes to: consultants on the case, else anyone above them. */
export function consultantsOf(members: Signer[]): string[] {
  const exact = members.filter((m) => m.archetype === "consultant");
  return (exact.length ? exact : members.filter(isSenior)).map((m) => m.id);
}

/** True when the person who asked is not a consultant, so their sign-off is needed on top. */
export function needsRequester(state: SignoffState, members: Signer[]): boolean {
  if (!state.requestedBy) return false;
  const who = members.find((m) => m.id === state.requestedBy);
  return who?.archetype !== "consultant";
}

/** The sign-offs this expert needs and whether each is in. */
export function slots(state: SignoffState, members: Signer[]): { slot: Slot; done: boolean; by: string | null }[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const withRequester = needsRequester(state, members);
  // One person fills one slot, so a manager who asked can't also stand in for the consultant.
  const consultant = state.approvals.find((id) => isSenior(byId.get(id)) && !(withRequester && id === state.requestedBy)) ?? null;
  const out: { slot: Slot; done: boolean; by: string | null }[] = [{ slot: "consultant", done: !!consultant, by: consultant }];
  if (withRequester) {
    const done = state.approvals.includes(state.requestedBy!);
    out.push({ slot: "requester", done, by: done ? state.requestedBy : null });
  }
  return out;
}

export function isApproved(state: SignoffState, members: Signer[]): boolean {
  return slots(state, members).every((s) => s.done);
}

/** The open sign-off this person would fill, or null if they have none to give. */
export function signoffFor(state: SignoffState, userId: string, members: Signer[]): Slot | null {
  if (state.approvals.includes(userId)) return null;
  const open = slots(state, members).filter((s) => !s.done);
  if (open.some((s) => s.slot === "requester") && userId === state.requestedBy) return "requester";
  const me = members.find((m) => m.id === userId);
  if (open.some((s) => s.slot === "consultant") && isSenior(me) && !(needsRequester(state, members) && userId === state.requestedBy)) return "consultant";
  return null;
}

/** Whose inbox the expert sits in: the people who still need to sign off. */
export function waitingOn(state: SignoffState, members: Signer[]): string[] {
  const ids: string[] = [];
  for (const s of slots(state, members)) {
    if (s.done) continue;
    if (s.slot === "requester") ids.push(state.requestedBy!);
    else ids.push(...consultantsOf(members).filter((id) => !(needsRequester(state, members) && id === state.requestedBy)));
  }
  return [...new Set(ids)];
}

/** Anyone who signs off may also pass on the expert. */
export function canPass(state: SignoffState, userId: string, members: Signer[]): boolean {
  if (userId === state.requestedBy) return true;
  return isSenior(members.find((m) => m.id === userId));
}

export function parseApprovals(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
