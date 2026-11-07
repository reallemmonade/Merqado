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
