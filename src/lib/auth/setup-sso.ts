import { and, eq } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { firmMembers, firmRoles, firms, ssoConnections, users } from "@/db/schema";
import { encryptJson } from "@/lib/crypto";
import { DEFAULT_FIRM_ROLES } from "@/lib/roles";
import { parseDomains } from "@/lib/auth/oidc";

export type SsoSetup = {
  firmName: string;
  slug: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  domains: string;
  adminEmail: string;
  adminName?: string;
  /** Title for people signing in the first time; null disables auto-provisioning. */
  defaultTitle?: string | null;
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Creates the firm (if new), its SSO connection and its first admin. Safe to run repeatedly:
 * a connection with the same issuer and client id is updated instead of duplicated.
 */
export async function setupSso(db: ReturnType<typeof getDb>, s: SsoSetup): Promise<string> {
  const domains = parseDomains(s.domains);
  const adminEmail = s.adminEmail.trim().toLowerCase();
  if (!domains.length) throw new Error("At least one email domain is required.");
  if (!domains.includes(adminEmail.split("@")[1] ?? "")) {
    throw new Error(`The admin email must be on one of the domains: ${domains.join(", ")}`);
  }
  // Encrypt first so a missing MERQADO_SECRET_KEY fails before anything is written.
  const encryptedClientSecret = encryptJson(s.clientSecret.trim());
  const defaultTitle = s.defaultTitle === undefined ? "Associate" : s.defaultTitle;

  let firm = await db.query.firms.findFirst({ where: eq(firms.slug, s.slug) });
  if (!firm) {
    [firm] = await db.insert(firms).values({ name: s.firmName, slug: s.slug }).returning();
    await db.insert(firmRoles).values(DEFAULT_FIRM_ROLES.map((r) => ({ ...r, firmId: firm!.id })));
  }
  const roles = await db.query.firmRoles.findMany({ where: eq(firmRoles.firmId, firm!.id) });
  const defaultRole = defaultTitle
    ? roles.find((r) => r.title.toLowerCase() === defaultTitle.toLowerCase())
    : undefined;
  if (defaultTitle && !defaultRole) {
    throw new Error(`No title "${defaultTitle}" in this firm. Titles: ${roles.map((r) => r.title).join(", ")}`);
  }

  const values = {
    firmId: firm!.id,
    label: `${s.firmName} SSO`,
    issuer: s.issuer.trim(),
    clientId: s.clientId.trim(),
    encryptedClientSecret,
    emailDomains: domains.join(","),
    defaultFirmRoleId: defaultRole?.id ?? null,
    enabled: true,
  };
  const existingConn = await db.query.ssoConnections.findFirst({
    where: and(
      eq(ssoConnections.firmId, firm!.id),
      eq(ssoConnections.issuer, values.issuer),
      eq(ssoConnections.clientId, values.clientId),
    ),
  });
  if (existingConn) {
    await db.update(ssoConnections).set(values).where(eq(ssoConnections.id, existingConn.id));
  } else {
    await db.insert(ssoConnections).values(values);
  }

  let admin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
  if (!admin) {
    [admin] = await db.insert(users).values({ email: adminEmail, name: s.adminName?.trim() || adminEmail }).returning();
  }
  const partnerRole = roles.find((r) => r.archetype === "partner") ?? roles[roles.length - 1]!;
  const member = await db.query.firmMembers.findFirst({
    where: and(eq(firmMembers.firmId, firm!.id), eq(firmMembers.userId, admin!.id)),
  });
  if (member) {
    await db
      .update(firmMembers)
      .set({ isAdmin: true })
      .where(and(eq(firmMembers.firmId, firm!.id), eq(firmMembers.userId, admin!.id)));
  } else {
    await db.insert(firmMembers).values({ firmId: firm!.id, userId: admin!.id, firmRoleId: partnerRole.id, isAdmin: true });
  }

  return `SSO ready for ${domains.join(", ")}. ${adminEmail} is a firm admin.`;
}
