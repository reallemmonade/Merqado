/**
 * Adds the sample Experts pipeline to an engagement.
 *
 *   npm run db:seed:experts -- <engagement-id>     (defaults to the first engagement)
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { engagements, experts } from "../src/db/schema";
import { seedSampleExperts } from "../src/lib/experts/sample";

const db = getDb();
const arg = process.argv[2];
const eng = arg
  ? await db.query.engagements.findFirst({ where: eq(engagements.id, arg) })
  : await db.query.engagements.findFirst();
if (!eng) {
  console.error("No engagement found. Run npm run db:seed first, or pass an engagement id.");
  process.exit(1);
}
const already = await db.query.experts.findFirst({ where: eq(experts.engagementId, eng.id) });
if (already) {
  console.log(`${eng.title} already has experts; nothing to do.`);
  process.exit(0);
}
await seedSampleExperts(db, eng.id);
console.log(`Added a sample Experts pipeline to ${eng.clientName} · ${eng.title}.`);
