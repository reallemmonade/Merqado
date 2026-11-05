/**
 * Runs before the server starts on Render: applies database migrations, then, if the
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SSO_ADMIN_EMAIL environment variables are set,
 * sets up Google sign-in for that admin's firm. Safe to run on every deploy.
 *
 * Optional: SSO_FIRM_NAME (defaults to the email domain), SSO_DOMAINS (defaults to the
 * admin's email domain), SSO_ADMIN_NAME.
 */
import { mkdirSync } from "node:fs";
import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb } from "../src/db/client";
import { setupSso, slugify } from "../src/lib/auth/setup-sso";

if ((process.env.TURSO_DATABASE_URL ?? "file:.data/local.db").startsWith("file:")) {
  mkdirSync(".data", { recursive: true });
}
const db = getDb();
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SSO_ADMIN_EMAIL } = process.env;
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && SSO_ADMIN_EMAIL) {
  const domain = SSO_ADMIN_EMAIL.trim().toLowerCase().split("@")[1] ?? "";
  const firmName = process.env.SSO_FIRM_NAME?.trim() || domain;
  try {
    console.log(
      await setupSso(db, {
        firmName,
        slug: slugify(firmName),
        issuer: "https://accounts.google.com",
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        domains: process.env.SSO_DOMAINS || domain,
        adminEmail: SSO_ADMIN_EMAIL,
        adminName: process.env.SSO_ADMIN_NAME,
      }),
    );
  } catch (err) {
    // Don't keep the app from starting over a sign-in setup problem; log it for Render's logs.
    console.error("Google sign-in setup skipped:", err instanceof Error ? err.message : err);
  }
}
