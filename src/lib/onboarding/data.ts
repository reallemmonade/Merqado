import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import { caseOnboarding, engagementMembers, engagements, expertTypes, firms, sources, users } from "@/db/schema";
import { ROLE_LABEL } from "@/lib/roles";
import type { CaseMember } from "@/lib/case/page";
import { parseOnboarding, parseStandard, targetCount, tzLabel, type Onboarding, type Standard, type TeamRow } from "./model";

export interface OnboardingState {
  caseCode: string;
  data: Onboarding;
  /** The firm's standard text (or the built-in one). */
  firmStandard: Standard;
}

const ROLE_COPY: Record<string, TeamRow["copy"]> = { partner: "invites", manager: "all", consultant: "all", associate: "all" };

/** The case team as onboarding rows: name, role, time zone and email from each person's profile. */
export async function teamRows(db: DB, engagementId: string, members: CaseMember[]): Promise<TeamRow[]> {
  if (!members.length) return [];
  const profiles = await db
    .select({ id: users.id, email: users.email, timeZone: users.timeZone })
    .from(users)
    .innerJoin(engagementMembers, eq(engagementMembers.userId, users.id))
    .where(and(eq(engagementMembers.engagementId, engagementId), inArray(users.id, members.map((m) => m.id))));
  const by = new Map(profiles.map((p) => [p.id, p]));
  const order = { partner: 0, manager: 1, consultant: 2, associate: 3 } as const;
  const rows = [...members]
    .sort((a, b) => order[a.archetype] - order[b.archetype])
    .map((m) => ({
      userId: m.id,
      name: m.name,
      email: by.get(m.id)?.email ?? "",
      role: ROLE_LABEL[m.archetype],
      tz: tzLabel(by.get(m.id)?.timeZone),
      copy: ROLE_COPY[m.archetype] ?? "all",
      lead: false,
    }));
  const lead = rows.find((r) => r.role === ROLE_LABEL.consultant) ?? rows.find((r) => r.role === ROLE_LABEL.manager) ?? rows[0];
  if (lead) lead.lead = true;
  return rows;
}

export async function loadOnboarding(db: DB, engagement: { id: string; firmId: string; startsOn: string | null; endsOn: string | null }, members: CaseMember[]): Promise<OnboardingState> {
  const [row, firm] = await Promise.all([
    db.query.caseOnboarding.findFirst({ where: eq(caseOnboarding.engagementId, engagement.id) }),
    db.query.firms.findFirst({ where: eq(firms.id, engagement.firmId), columns: { onboardingStandard: true } }),
  ]);
  const data = parseOnboarding(row?.data);
  if (!data.team.length) data.team = await teamRows(db, engagement.id, members);
  if (!data.startsOn && engagement.startsOn) data.startsOn = engagement.startsOn;
  if (!data.endsOn && engagement.endsOn) data.endsOn = engagement.endsOn;
  return { caseCode: row?.caseCode ?? "", data, firmStandard: parseStandard(firm?.onboardingStandard) };
}

/** Saves the form, and copies what other tabs use: dates onto the case, angles into Experts. */
export async function saveOnboarding(db: DB, engagementId: string, userId: string, caseCode: string, data: Onboarding) {
  await db
    .insert(caseOnboarding)
    .values({ engagementId, caseCode, data: JSON.stringify(data), updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: caseOnboarding.engagementId, set: { caseCode, data: JSON.stringify(data), updatedBy: userId, updatedAt: new Date() } });

  await db
    .update(engagements)
    .set({ startsOn: data.startsOn.trim() || null, endsOn: data.endsOn.trim() || null })
    .where(eq(engagements.id, engagementId));

  const existing = await db.select({ id: expertTypes.id, name: expertTypes.name, target: expertTypes.target }).from(expertTypes).where(eq(expertTypes.engagementId, engagementId));
  const byName = new Map(existing.map((t) => [t.name.trim().toLowerCase(), t]));
  for (const a of data.angles) {
    const name = a.name.trim();
    if (!name) continue;
    const target = targetCount(a.n);
    const have = byName.get(name.toLowerCase());
    if (!have) {
      await db.insert(expertTypes).values({ engagementId, name, target, sort: Date.now() % 1e9 });
      byName.set(name.toLowerCase(), { id: "", name, target });
    } else if (have.id && target && have.target !== target) {
      await db.update(expertTypes).set({ target }).where(eq(expertTypes.id, have.id));
    }
  }
}

export async function saveFirmStandard(db: DB, firmId: string, std: Standard) {
  await db.update(firms).set({ onboardingStandard: JSON.stringify(std) }).where(eq(firms.id, firmId));
}

/** Text of case files the person picked, for filling the form. */
export async function docTexts(db: DB, engagementId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ id: sources.id, filename: sources.filename, text: sources.textBody, roomId: sources.roomId })
    .from(sources)
    .where(and(eq(sources.engagementId, engagementId), inArray(sources.id, ids)));
}
