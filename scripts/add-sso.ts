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
import { getDb } from "../src/db/client";
import { setupSso } from "../src/lib/auth/setup-sso";

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
console.log(
  await setupSso(getDb(), {
    firmName: a.firm!,
    slug: a.slug!,
    issuer: a.issuer!,
    clientId: a["client-id"]!,
    clientSecret: a["client-secret"]!,
    domains: a.domains!,
    adminEmail: a["admin-email"]!,
    adminName: a["admin-name"],
    defaultTitle: a["no-auto-provision"] ? null : a["default-title"]!,
  }),
);
