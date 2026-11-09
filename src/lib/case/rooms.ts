import { ARCHETYPES, type Archetype } from "@/db/schema";

/** Chats a case can start with, picked during setup. Partners are the MDs. */
export const ROOM_TEMPLATES: { name: string; archetypes: Archetype[] }[] = [
  { name: "Core team", archetypes: ["consultant", "associate"] },
  { name: "Full team", archetypes: ["manager", "consultant", "associate"] },
  { name: "Chat with MDs", archetypes: ["partner", "manager", "consultant", "associate"] },
  { name: "Manager + consultant + MDs", archetypes: ["partner", "manager", "consultant"] },
  { name: "MDs only", archetypes: ["partner"] },
  { name: "Associates only", archetypes: ["associate"] },
];

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  partner: "MDs",
  manager: "Manager",
  consultant: "Consultants",
  associate: "Associates",
};

export function parseArchetypes(json: string): Archetype[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((a): a is Archetype => (ARCHETYPES as readonly string[]).includes(a)) : [];
  } catch {
    return [];
  }
}

export function canSeeRoom(archetypesJson: string, archetype: Archetype): boolean {
  return parseArchetypes(archetypesJson).includes(archetype);
}

export function roomMembersLabel(archetypesJson: string): string {
  const list = parseArchetypes(archetypesJson);
  if (list.length === ARCHETYPES.length) return "Everyone";
  return ARCHETYPES.filter((a) => list.includes(a))
    .reverse()
    .map((a) => ARCHETYPE_LABEL[a])
    .join(" + ");
}

export interface ChatAccess {
  kind: string;
  archetypes: string;
  memberIds: string;
}

export function parseIds(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Rooms go by role; 1:1 and group chats only to the people in them. */
export function canSeeChat(chat: ChatAccess, viewer: { id: string; archetype: Archetype }): boolean {
  if (chat.kind === "room") return canSeeRoom(chat.archetypes, viewer.archetype);
  return parseIds(chat.memberIds).includes(viewer.id);
}

/** The same people, in any order, means the same chat. */
export function sameMembers(a: string[], b: string[]): boolean {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "✅", "👀"] as const;

/**
 * Ids of people @mentioned by full name or first name. Longest names are matched first and the
 * text they cover is used up, so "@Ana Reyes" tags Ana Reyes only, not every other Ana.
 */
export function findMentions(body: string, people: { id: string; name: string }[]): string[] {
  const text = body.toLowerCase();
  const found = new Set<string>();
  const taken: [number, number][] = [];
  const names = people
    .flatMap((p) => {
      const full = p.name.trim();
      const first = full.split(/\s+/)[0] ?? "";
      return [{ id: p.id, name: full }, ...(first && first !== full ? [{ id: p.id, name: first }] : [])];
    })
    .filter((n) => n.name)
    .sort((a, b) => b.name.length - a.name.length);
  for (const n of names) {
    const needle = "@" + n.name.toLowerCase();
    let at = text.indexOf(needle);
    while (at !== -1) {
      const end = at + needle.length;
      const after = text[end];
      const free = !taken.some(([s, e]) => at < e && end > s);
      if (free && (after === undefined || !/[\p{L}\p{N}]/u.test(after))) {
        found.add(n.id);
        taken.push([at, end]);
      }
      at = text.indexOf(needle, at + 1);
    }
  }
  return [...found];
}

export type Presence = "available" | "busy" | "dnd" | "away" | "offline";

/** What the green / yellow / red dot shows. */
export function presenceOf(status: string, lastSeen: Date | null, now = new Date()): Presence {
  const mins = lastSeen ? (now.getTime() - lastSeen.getTime()) / 60000 : Infinity;
  if (mins > 30) return "offline";
  if (status === "busy" || status === "dnd" || status === "away") return status;
  return mins <= 5 ? "available" : "away";
}

export const PRESENCE_LABEL: Record<Presence, string> = {
  available: "Available",
  busy: "Busy",
  dnd: "Do not disturb",
  away: "Away",
  offline: "Offline",
};
