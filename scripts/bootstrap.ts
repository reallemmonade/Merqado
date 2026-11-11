/**
 * Runs before the server starts on Render: applies database migrations, then, if
 * SSO_ADMIN_EMAIL is set, creates that admin's firm and claims its email domain so its people
 * can use "Continue with Google / Microsoft" (GOOGLE_* / MICROSOFT_* client settings).
 * Safe to run on every deploy.
 *
 * Optional: SSO_FIRM_NAME (defaults to the email domain), SSO_DOMAINS (defaults to the
 * admin's email domain), SSO_ADMIN_NAME.
 */
import { mkdirSync } from "node:fs";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb } from "../src/db/client";
import { setupFirm, slugify } from "../src/lib/auth/setup-sso";
import { syncAllNotifications } from "../src/lib/notifications/sync";

if ((process.env.TURSO_DATABASE_URL ?? "file:.data/local.db").startsWith("file:")) {
  mkdirSync(".data", { recursive: true });
}
const db = getDb();
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");

// Keeps stored notifications filled for everyone (and backfills them the first time).
try {
  console.log(`Notifications synced for ${await syncAllNotifications(db)} people.`);
} catch (err) {
  console.error("Notification sync failed", err);
}

const { SSO_ADMIN_EMAIL } = process.env;
if (SSO_ADMIN_EMAIL) {
  const domain = SSO_ADMIN_EMAIL.trim().toLowerCase().split("@")[1] ?? "";
  const firmName = process.env.SSO_FIRM_NAME?.trim() || domain;
  try {
    console.log(
      await setupFirm(db, {
        firmName,
        slug: slugify(firmName),
        domains: process.env.SSO_DOMAINS || domain,
        adminEmail: SSO_ADMIN_EMAIL,
        adminName: process.env.SSO_ADMIN_NAME,
      }),
    );
  } catch (err) {
    // Don't keep the app from starting over a setup problem; log it for Render's logs.
    console.error("Firm setup skipped:", err instanceof Error ? err.message : err);
  }
}
