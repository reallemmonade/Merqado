/**
 * Merqado's own "Continue with Google" and "Continue with Microsoft" sign-in. One app
 * registration each, owned by Merqado and open to any organization, so client firms don't
 * have to configure anything: they only claim their email domain (see `firm_domains`).
 */
export const PLATFORM_PROVIDERS = {
  google: {
    label: "Google",
    issuer: "https://accounts.google.com",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  microsoft: {
    label: "Microsoft",
    // Work and school accounts from any Entra ID tenant; personal Microsoft accounts are excluded.
    issuer: "https://login.microsoftonline.com/organizations/v2.0",
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
  },
} as const;

export type PlatformProvider = keyof typeof PLATFORM_PROVIDERS;

export function isPlatformProvider(v: unknown): v is PlatformProvider {
  return typeof v === "string" && Object.hasOwn(PLATFORM_PROVIDERS, v);
}

export function platformCredentials(p: PlatformProvider): { clientId: string; clientSecret: string } | null {
  const def = PLATFORM_PROVIDERS[p];
  const clientId = process.env[def.clientIdEnv]?.trim();
  const clientSecret = process.env[def.clientSecretEnv]?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Providers with credentials set, in display order. */
export function enabledPlatformProviders(): PlatformProvider[] {
  return (Object.keys(PLATFORM_PROVIDERS) as PlatformProvider[]).filter((p) => platformCredentials(p));
}

/** Personal Microsoft accounts (outlook.com, hotmail.com, ...) all share this tenant id. */
export const MICROSOFT_CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";

/**
 * Picks a trustworthy work email from verified ID token claims, or explains why not.
 *
 * Google: the account must be a Google Workspace account (`hd` set) whose domain matches the
 * email, and the email must be verified. This rules out personal Gmail accounts.
 *
 * Microsoft: the `email` claim is editable by tenant admins and is not proof of domain
 * ownership, so we use the UPN (`preferred_username`), whose suffix must be a domain the
 * tenant has verified. Personal Microsoft accounts are rejected.
 */
export function workEmailFromClaims(
  provider: PlatformProvider,
  claims: Record<string, unknown>,
): { email: string } | { error: "no_email" | "personal_account" } {
  if (provider === "google") {
    const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    if (!email.includes("@") || claims.email_verified !== true) return { error: "no_email" };
    const hd = typeof claims.hd === "string" ? claims.hd.toLowerCase() : "";
    if (!hd) return { error: "personal_account" };
    if (email.split("@")[1] !== hd) return { error: "no_email" };
    return { email };
  }
  if (claims.tid === MICROSOFT_CONSUMER_TENANT || typeof claims.tid !== "string") {
    return { error: "personal_account" };
  }
  const upn = typeof claims.preferred_username === "string" ? claims.preferred_username.trim().toLowerCase() : "";
  if (!upn.includes("@")) return { error: "no_email" };
  return { email: upn };
}
