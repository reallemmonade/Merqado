import type { Archetype } from "@/db/schema";
import { ROOM_TEMPLATES } from "@/lib/case/rooms";
import { emptyOnboarding, type Network, type Onboarding, type Standard } from "./model";

/** What the "+ New case" wizard collects beyond the case name. */
export interface NewCaseInput {
  market: string;
  objective: string;
  weeks: string;
  angles: { name: string; n: string }[];
  /** Network names picked from the firm's list. */
  networks: string[];
  docs: { id: string; filename: string }[];
}

/**
 * Onboarding data for a new case: the AI fill from the SOW as the base, then what the person typed on top.
 * Angle details the AI found (who, roles, screeners) stay when the person keeps that angle's name.
 */
export function buildOnboarding(fill: Partial<Onboarding>, input: NewCaseInput, firmStandard: Standard): Onboarding {
  const base = { ...emptyOnboarding(), ...fill };
  const fromFill = new Map((fill.angles ?? []).map((a) => [a.name.trim().toLowerCase(), a]));
  const angles = input.angles
    .map((a) => ({ name: a.name.trim(), n: a.n.trim() }))
    .filter((a) => a.name)
    .slice(0, 12)
    .map((a, i) => {
      const f = fromFill.get(a.name.toLowerCase());
      return { id: `a${i + 1}`, name: a.name, n: a.n, who: f?.who ?? "", companies: f?.companies ?? "", roles: f?.roles ?? "", screeners: f?.screeners ?? "" };
    });
  return {
    ...base,
    market: input.market.trim(),
    objective: input.objective.trim(),
    weeks: input.weeks.replace(/[^\d.]/g, ""),
    angles,
    team: [],
    standard: networksOverride(firmStandard, input.networks),
    docs: input.docs.slice(0, 30),
    started: true,
  };
}

/** A case override of the firm standard only when the picked networks differ from the firm's list. */
export function networksOverride(firmStandard: Standard, picked: string[]): Standard | null {
  const want = new Set(picked.map((p) => p.trim().toLowerCase()));
  const networks: Network[] = firmStandard.networks.filter((n) => want.has(n.name.trim().toLowerCase()));
  if (networks.length === firmStandard.networks.length) return null;
  return { ...firmStandard, networks };
}

/** Room rows for the chats picked at setup, in template order. Unknown names are ignored. */
export function roomRows(engagementId: string, names: string[], createdBy: string) {
  const want = new Set(names);
  return ROOM_TEMPLATES.filter((t) => want.has(t.name)).map((t, i) => ({
    engagementId,
    name: t.name,
    archetypes: JSON.stringify(t.archetypes),
    createdBy,
    sort: i,
  }));
}

/** Team rows the creator picked, limited to people in the firm, without the creator (who leads). */
export function teamRowsToAdd(
  picked: { userId: string; caseRole: Archetype | null }[],
  firmUserIds: Set<string>,
  creatorId: string,
) {
  const seen = new Set<string>([creatorId]);
  const out: { userId: string; caseRole: Archetype | null }[] = [];
  for (const p of picked) {
    if (seen.has(p.userId) || !firmUserIds.has(p.userId)) continue;
    seen.add(p.userId);
    out.push(p);
  }
  return out;
}
