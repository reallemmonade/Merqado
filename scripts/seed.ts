/** Seeds a demo firm with one example engagement. All data here is fictional. */
import { getDb } from "../src/db/client";
import { engagementMembers, engagements, firmMembers, firmRoles, firms, findings, users } from "../src/db/schema";
import { DEFAULT_FIRM_ROLES } from "../src/lib/roles";

const db = getDb();

const [firm] = await db
  .insert(firms)
  .values({ name: "Demo Partners", slug: "demo-partners", aiBillingMode: "managed" })
  .onConflictDoNothing()
  .returning();
if (!firm) {
  console.log("Demo firm already exists; nothing to do.");
  process.exit(0);
}

const roles = await db
  .insert(firmRoles)
  .values(DEFAULT_FIRM_ROLES.map((r) => ({ ...r, firmId: firm.id })))
  .returning();
const roleId = (archetype: string) => roles.find((r) => r.archetype === archetype)!.id;

const people = await db
  .insert(users)
  .values([
    { email: "partner@demo.test", name: "Alex Partner" },
    { email: "manager@demo.test", name: "Sam Manager" },
    { email: "consultant@demo.test", name: "Priya Consultant" },
    { email: "associate@demo.test", name: "Tomás Associate" },
  ])
  .returning();
const archetypes = ["partner", "manager", "consultant", "associate"];
await db.insert(firmMembers).values(
  people.map((u, i) => ({ firmId: firm.id, userId: u.id, firmRoleId: roleId(archetypes[i]!), isAdmin: i === 0 })),
);

const [eng] = await db
  .insert(engagements)
  .values({ firmId: firm.id, clientName: "Halcyon Beverages", title: "LatAm market entry" })
  .returning();
await db.insert(engagementMembers).values(
  people.map((u, i) => ({ engagementId: eng!.id, userId: u.id, access: i <= 1 ? ("lead" as const) : ("editor" as const) })),
);
await db.insert(findings).values([
  { engagementId: eng!.id, statement: "Modern trade is 41% of RTD tea volume in CDMX (illustrative)", status: "supported", workstream: "Where to play" },
  { engagementId: eng!.id, statement: "Planned shelf price sits 12% above the category leader (illustrative)", status: "supported", workstream: "How to win" },
  { engagementId: eng!.id, statement: "Co-packing in Monterrey cuts landed cost by about a fifth (illustrative)", status: "needs_data", workstream: "Economics" },
]);

console.log("Seeded Demo Partners. Sign in locally with DEV_USER_EMAIL=partner@demo.test (or manager@, consultant@, associate@).");
