import { z } from "zod";

/**
 * Case onboarding: what the team fills in when a case starts. Its main output is the
 * solicitation email to expert networks. Merqado only drafts that email; a person sends it.
 */

const line = z.string().max(2000).default("");
const block = z.string().max(8000).default("");

export const angleSchema = z.object({
  id: z.string().max(40),
  name: line,
  n: z.string().max(40).default(""),
  who: block,
  companies: block,
  roles: block,
  screeners: block,
});

export const teamRowSchema = z.object({
  userId: z.string().max(64).nullable().default(null),
  name: z.string().max(200).default(""),
  email: z.string().max(320).default(""),
  role: z.string().max(80).default(""),
  tz: z.string().max(40).default(""),
  /** all: every email and invite; invites: calendar invites only; none: left off. */
  copy: z.enum(["all", "invites", "none"]).default("all"),
  lead: z.boolean().default(false),
});

export const networkSchema = z.object({ name: z.string().max(200).default(""), email: z.string().max(320).default("") });

/** Text that is the same on every case. The firm keeps one copy; a case may override it. */
export const standardSchema = z.object({
  doNotContact: block,
  blinding: block,
  moderation: block,
  signOff: line,
  networks: z.array(networkSchema).max(30).default([]),
});

export const onboardingSchema = z.object({
  market: line,
  objective: line,
  weeks: z.string().max(20).default(""),
  startsOn: z.string().max(20).default(""),
  endsOn: z.string().max(20).default(""),
  geography: line,
  /** Case-only additions to the standard do-not-contact list (e.g. the sponsor's portfolio). */
  doNotContactExtra: block,
  angles: z.array(angleSchema).max(12).default([]),
  team: z.array(teamRowSchema).max(30).default([]),
  /** Case override of the firm standard; null keeps the standard. */
  standard: standardSchema.nullable().default(null),
  /** Files the form was filled from. */
  docs: z.array(z.object({ id: z.string().max(64), filename: z.string().max(300) })).max(30).default([]),
  /** Set once someone drops documents or skips that step. */
  started: z.boolean().default(false),
});

export type Angle = z.infer<typeof angleSchema>;
export type TeamRow = z.infer<typeof teamRowSchema>;
export type Network = z.infer<typeof networkSchema>;
export type Standard = z.infer<typeof standardSchema>;
export type Onboarding = z.infer<typeof onboardingSchema>;

export const DEFAULT_STANDARD: Standard = {
  doNotContact: "Current and former employees of {client} and its affiliates.",
  blinding:
    'Do not identify {client} or any affiliate as the client in outreach, screeners or expert calls. Describe the work broadly as a "{market} market study." The restricted list is for compliance only; do not share it with experts.',
  moderation: "All interviews are run by our team. Please do not offer third-party moderation.",
  signOff: "Thanks,",
  networks: [],
};

export function emptyOnboarding(): Onboarding {
  return onboardingSchema.parse({});
}

/** Reads stored JSON, falling back to an empty form for anything missing or broken. */
export function parseOnboarding(raw: string | null | undefined): Onboarding {
  try {
    const r = onboardingSchema.safeParse(raw ? JSON.parse(raw) : {});
    return r.success ? r.data : emptyOnboarding();
  } catch {
    return emptyOnboarding();
  }
}

export function parseStandard(raw: string | null | undefined): Standard {
  try {
    const r = standardSchema.safeParse(raw ? JSON.parse(raw) : null);
    return r.success ? r.data : DEFAULT_STANDARD;
  } catch {
    return DEFAULT_STANDARD;
  }
}

let seq = 0;
export function newAngle(name = ""): Angle {
  seq = (seq + 1) % 1e6;
  return { id: `a${Date.now().toString(36)}${seq}`, name, n: "", who: "", companies: "", roles: "", screeners: "" };
}

/** "PT", "ET", "CT", "MT" for US zones; otherwise the zone's short name (e.g. "GMT+1"). */
export function tzLabel(zone: string | null | undefined, at = new Date()): string {
  if (!zone) return "";
  const us: Record<string, string> = {
    "America/Los_Angeles": "PT",
    "America/Vancouver": "PT",
    "America/Denver": "MT",
    "America/Phoenix": "MT",
    "America/Chicago": "CT",
    "America/New_York": "ET",
    "America/Toronto": "ET",
    "America/Detroit": "ET",
  };
  if (us[zone]) return us[zone];
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName");
    return part?.value ?? zone;
  } catch {
    return zone;
  }
}

/** First whole number in an "N" field ("~20", "10-15" → 20, 10). */
export function targetCount(n: string): number {
  const m = n.match(/\d+/);
  return m ? Math.min(999, Number(m[0])) : 0;
}

/** A fill from documents only writes into fields that are still empty. */
export function mergeFill(current: Onboarding, fill: Partial<Onboarding>): Onboarding {
  const next: Onboarding = { ...current };
  const textKeys = ["market", "objective", "weeks", "startsOn", "endsOn", "geography", "doNotContactExtra"] as const;
  for (const k of textKeys) {
    const v = fill[k];
    if (typeof v === "string" && v.trim() && !current[k].trim()) next[k] = v.trim();
  }
  if (fill.angles?.length) {
    const angles = current.angles.map((a) => ({ ...a }));
    for (const f of fill.angles) {
      const same = angles.find((a) => a.name.trim().toLowerCase() === f.name.trim().toLowerCase() && a.name.trim());
      const target = same ?? angles.find((a) => !a.name.trim() && !a.who.trim());
      if (target) {
        for (const k of ["name", "n", "who", "companies", "roles", "screeners"] as const) if (!target[k].trim() && f[k]?.trim()) target[k] = f[k].trim();
      } else if (angles.length < 12) {
        angles.push({ ...newAngle(), ...f, id: newAngle().id });
      }
    }
    next.angles = angles;
  }
  return next;
}
