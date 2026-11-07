/**
 * Personal test accounts. Normally only work accounts on a firm's claimed domain can sign in;
 * TEST_ACCOUNT_EMAILS lets a few named personal Google accounts (e.g. a Gmail address) in as
 * well, so the team can see Merqado the way a regular, non-admin user does.
 *
 *   TEST_ACCOUNT_EMAILS="someone@gmail.com, other@gmail.com:Manager"
 *
 * Each entry is an email, optionally followed by ":Title" for the starting title (one of the
 * firm's titles; the firm's default title otherwise). After that, the title is switched in the app. Accounts join the firm of SSO_ADMIN_EMAIL, or of
 * TEST_ACCOUNT_FIRM_DOMAIN when set. They are never firm admins.
 */
type Env = Record<string, string | undefined>;

export interface TestAccount {
  email: string;
  title: string | null;
}

export function parseTestAccounts(raw: string | undefined): TestAccount[] {
  return (raw ?? "")
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [email, ...title] = entry.split(":");
      return { email: email!.trim().toLowerCase(), title: title.join(":").trim() || null };
    })
    .filter((a) => a.email.includes("@"));
}

export function findTestAccount(email: string, env: Env = process.env): TestAccount | null {
  const wanted = email.trim().toLowerCase();
  return parseTestAccounts(env.TEST_ACCOUNT_EMAILS).find((a) => a.email === wanted) ?? null;
}

/** The domain whose firm test accounts join. */
export function testAccountFirmDomain(env: Env = process.env): string | null {
  const explicit = env.TEST_ACCOUNT_FIRM_DOMAIN?.trim().toLowerCase();
  if (explicit) return explicit;
  const admin = env.SSO_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  return admin.split("@")[1] || null;
}
