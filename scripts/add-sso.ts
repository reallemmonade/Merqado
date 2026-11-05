/**
 * Sets up a firm's single sign-on (and the firm itself, if new).
 *
 *   npm run sso:add -- --firm "Acme Consulting" --slug acme \
 *     --issuer https://login.microsoftonline.com/<tenant-id>/v2.0 \
 *     --client-id <id> --client-secret <secret> --domains acme.com,acme.co.uk \
 *     --admin-email jane@acme.com --admin-name "Jane Doe"
 *
 * Options: --default-title "Associate" (title for people signing in the first time),
 *          --no-auto-provision (only pre-added people can sign in).
 */
import { parseArgs } from "node:util";
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { firmMembers, firmRoles, firms, ssoConnections, users } from "../src/db/schema";
import { encryptJson } from "../src/lib/crypto";
import { DEFAULT_FIRM_ROLES } from "../src/lib/roles";
import { parseDomains } from "../src/lib/auth/oidc";

const { values: a } = parseArgs({
  options: {
    firm: { type: "string" },
    slug: { type: "string" },
    issuer: { type: "string" },
    "client-id": { type: "string" },
    "client-secret": { type: "string" },
    domains: { type: "string" },
    "admin-email": { type: "string" },
    "admin-name": { type: "string" },
    "default-title": { type: "string", default: "Associate" },
    "no-auto-provision": { type: "boolean", default: false },
  },
});

const required = ["firm", "slug", "issuer", "client-id", "client-secret", "domains", "admin-email"] as const;
const missing = required.filter((k) => !a[k]);
if (missing.length) {
  console.error(`Missing: ${missing.map((m) => `--${m}`).join(", ")}`);
  process.exit(1);
}
const domains = parseDomains(a.domains!);
const adminEmail = a["admin-email"]!.trim().toLowerCase();
if (!domains.includes(adminEmail.split("@")[1] ?? "")) {
  console.error(`The admin email must be on one of the domains: ${domains.join(", ")}`);
  process.exit(1);
}

// Encrypt first so a missing MERQADO_SECRET_KEY fails before anything is written.
const encryptedClientSecret = encryptJson(a["client-secret"]!);
const db = getDb();

let firm = await db.query.firms.findFirst({ where: eq(firms.slug, a.slug!) });
if (!firm) {
  [firm] = await db.insert(firms).values({ name: a.firm!, slug: a.slug! }).returning();
  await db.insert(firmRoles).values(DEFAULT_FIRM_ROLES.map((r) => ({ ...r, firmId: firm!.id })));
  console.log(`Created firm ${firm!.name}.`);
}
const roles = await db.query.firmRoles.findMany({ where: eq(firmRoles.firmId, firm!.id) });
const defaultRole = roles.find((r) => r.title.toLowerCase() === a["default-title"]!.toLowerCase());
if (!a["no-auto-provision"] && !defaultRole) {
  console.error(`No title "${a["default-title"]}" in this firm. Titles: ${roles.map((r) => r.title).join(", ")}`);
  process.exit(1);
}

await db.insert(ssoConnections).values({
  firmId: firm!.id,
  label: `${a.firm} SSO`,
  issuer: a.issuer!,
  clientId: a["client-id"]!,
  encryptedClientSecret,
  emailDomains: domains.join(","),
  defaultFirmRoleId: a["no-auto-provision"] ? null : defaultRole!.id,
});

let admin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
if (!admin) [admin] = await db.insert(users).values({ email: adminEmail, name: a["admin-name"] ?? adminEmail }).returning();
const partnerRole = roles.find((r) => r.archetype === "partner") ?? roles[roles.length - 1]!;
const existing = await db.query.firmMembers.findFirst({
  where: and(eq(firmMembers.firmId, firm!.id), eq(firmMembers.userId, admin!.id)),
});
if (existing) {
  await db
    .update(firmMembers)
    .set({ isAdmin: true })
    .where(and(eq(firmMembers.firmId, firm!.id), eq(firmMembers.userId, admin!.id)));
} else {
  await db.insert(firmMembers).values({ firmId: firm!.id, userId: admin!.id, firmRoleId: partnerRole.id, isAdmin: true });
}

console.log(`SSO ready for ${domains.join(", ")}. ${adminEmail} is a firm admin.`);
