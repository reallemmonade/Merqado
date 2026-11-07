import * as oidc from "openid-client";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { engagementMembers, engagements, firmDomains, firmMembers, firmRoles, ssoConnections, users } from "@/db/schema";
import { decryptJson, encryptJson } from "@/lib/crypto";
import {
  PLATFORM_PROVIDERS,
  platformCredentials,
  verifiedGoogleEmail,
  workEmailFromClaims,
  type PlatformProvider,
} from "@/lib/auth/platform";
import { findTestAccount, testAccountFirmDomain, type TestAccount } from "@/lib/auth/test-accounts";

export const FLOW_COOKIE = "mq_sso_flow";
export const FLOW_TTL_SECONDS = 10 * 60;

type Connection = typeof ssoConnections.$inferSelect;

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

export function parseDomains(list: string): string[] {
  return list
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** The enabled connection whose domains include this email's domain. */
export async function findConnectionForEmail(db: DB, email: string): Promise<Connection | null> {
  const domain = emailDomain(email);
  if (!domain) return null;
  const rows = await db.query.ssoConnections.findMany({ where: eq(ssoConnections.enabled, true) });
  return rows.find((c) => parseDomains(c.emailDomains).includes(domain)) ?? null;
}

/** The claimed domain row for this email's domain, if any firm has claimed it. */
export async function findClaimedDomain(db: DB, email: string) {
  const domain = emailDomain(email);
  if (!domain) return null;
  return (await db.query.firmDomains.findFirst({ where: eq(firmDomains.domain, domain) })) ?? null;
}

const configCache = new Map<string, { config: oidc.Configuration; at: number }>();
const CONFIG_TTL_MS = 60 * 60 * 1000;

/** Where to send someone: a firm's own identity provider, or Merqado's Google/Microsoft app. */
export type SignInTarget = { connection: Connection } | { provider: PlatformProvider };

async function discover(cacheKey: string, issuerUrl: string, clientId: string, secret: string) {
  const hit = configCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.config;
  const issuer = new URL(issuerUrl);
  // Plain-http issuers are only allowed for a local test IdP during development.
  const insecureOk = process.env.NODE_ENV !== "production" && issuer.protocol === "http:" && issuer.hostname === "localhost";
  const config = await oidc.discovery(issuer, clientId, secret, undefined, {
    execute: insecureOk ? [oidc.allowInsecureRequests] : [],
  });
  configCache.set(cacheKey, { config, at: Date.now() });
  return config;
}

async function getConfig(target: SignInTarget): Promise<oidc.Configuration> {
  if ("connection" in target) {
    const conn = target.connection;
    return discover(`conn:${conn.id}`, conn.issuer, conn.clientId, decryptJson<string>(conn.encryptedClientSecret));
  }
  const creds = platformCredentials(target.provider);
  if (!creds) throw new SignInError("no_connection", `${PLATFORM_PROVIDERS[target.provider].label} sign-in is not set up.`);
  return discover(`platform:${target.provider}`, PLATFORM_PROVIDERS[target.provider].issuer, creds.clientId, creds.clientSecret);
}

interface FlowState {
  connectionId?: string;
  provider?: PlatformProvider;
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  loginHint: string;
  exp: number;
}

/** Builds the IdP redirect plus an encrypted cookie holding the PKCE verifier, state and nonce. */
export async function beginSignIn(
  target: SignInTarget,
  opts: { redirectUri: string; returnTo: string; loginHint: string },
): Promise<{ url: URL; flowCookie: string }> {
  const config = await getConfig(target);
  const verifier = oidc.randomPKCECodeVerifier();
  const flow: FlowState = {
    ...("connection" in target ? { connectionId: target.connection.id } : { provider: target.provider }),
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    verifier,
    returnTo: opts.returnTo,
    loginHint: opts.loginHint,
    exp: Date.now() + FLOW_TTL_SECONDS * 1000,
  };
  const params: Record<string, string> = {
    redirect_uri: opts.redirectUri,
    scope: "openid email profile",
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    state: flow.state,
    nonce: flow.nonce,
  };
  if (opts.loginHint) params.login_hint = opts.loginHint;
  // Always show Google's account chooser so people can pick their work account.
  if ("provider" in target && target.provider === "google") params.prompt = "select_account";
  const url = oidc.buildAuthorizationUrl(config, params);
  return { url, flowCookie: encryptJson(flow) };
}

export class SignInError extends Error {
  constructor(
    readonly code:
      | "expired"
      | "no_connection"
      | "no_email"
      | "wrong_domain"
      | "not_provisioned"
      | "personal_account"
      | "firm_not_found",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Completes the code exchange, verifies the ID token, and maps the person to a Merqado user
 * in the connection's firm, creating them on first sign-in when the firm allows it.
 */
export async function completeSignIn(
  db: DB,
  opts: { flowCookie: string | undefined; callbackUrl: URL },
): Promise<{ userId: string; firmId: string; connectionId: string | undefined; returnTo: string }> {
  if (!opts.flowCookie) throw new SignInError("expired", "Sign-in took too long. Try again.");
  let flow: FlowState;
  try {
    flow = decryptJson<FlowState>(opts.flowCookie);
  } catch {
    throw new SignInError("expired", "Sign-in took too long. Try again.");
  }
  if (flow.exp < Date.now()) throw new SignInError("expired", "Sign-in took too long. Try again.");

  if (flow.provider) return completePlatformSignIn(db, flow, flow.provider, opts.callbackUrl);

  const conn = await db.query.ssoConnections.findFirst({
    where: and(eq(ssoConnections.id, flow.connectionId ?? ""), eq(ssoConnections.enabled, true)),
  });
  if (!conn) throw new SignInError("no_connection", "Single sign-on is no longer set up for this firm.");

  const claims = await exchangeCode({ connection: conn }, flow, opts.callbackUrl);
  const rawEmail = [claims.email, claims.preferred_username, claims.upn].find(
    (v): v is string => typeof v === "string" && v.includes("@"),
  );
  if (!rawEmail || claims.email_verified === false) {
    throw new SignInError("no_email", "Your account has no verified work email.");
  }
  const email = rawEmail.trim().toLowerCase();
  const domain = emailDomain(email);
  if (!domain || !parseDomains(conn.emailDomains).includes(domain)) {
    throw new SignInError("wrong_domain", `${email} is not allowed to sign in through this firm's connection.`);
  }

  const userId = await provisionUser(db, conn.firmId, conn.defaultFirmRoleId, email, displayName(claims, email));
  return { userId, firmId: conn.firmId, connectionId: conn.id, returnTo: flow.returnTo };
}

async function exchangeCode(target: SignInTarget, flow: FlowState, callbackUrl: URL) {
  const config = await getConfig(target);
  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: flow.verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims) throw new SignInError("no_email", "Your identity provider did not return an ID token.");
  return claims as Record<string, unknown>;
}

function displayName(claims: Record<string, unknown>, email: string): string {
  return typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : email;
}

async function completePlatformSignIn(db: DB, flow: FlowState, provider: PlatformProvider, callbackUrl: URL) {
  const claims = await exchangeCode({ provider }, flow, callbackUrl);
  const result = workEmailFromClaims(provider, claims);
  if ("error" in result && result.error === "personal_account" && provider === "google") {
    const email = verifiedGoogleEmail(claims);
    const testAccount = email ? findTestAccount(email) : null;
    if (testAccount) {
      const { userId, firmId } = await provisionTestAccount(db, testAccount, displayName(claims, testAccount.email));
      return { userId, firmId, connectionId: undefined, returnTo: flow.returnTo };
    }
  }
  if ("error" in result) {
    throw result.error === "personal_account"
      ? new SignInError("personal_account", "Use your work account, not a personal one.")
      : new SignInError("no_email", "Your account has no verified work email.");
  }
  const claimed = await findClaimedDomain(db, result.email);
  if (!claimed) throw new SignInError("firm_not_found", `${emailDomain(result.email)} isn't on Merqado yet.`);
  const userId = await provisionUser(db, claimed.firmId, claimed.defaultFirmRoleId, result.email, displayName(claims, result.email));
  return { userId, firmId: claimed.firmId, connectionId: undefined, returnTo: flow.returnTo };
}

async function provisionUser(
  db: DB,
  firmId: string,
  defaultFirmRoleId: string | null,
  email: string,
  name: string,
): Promise<string> {
  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  const membership = user
    ? await db.query.firmMembers.findFirst({
        where: and(eq(firmMembers.firmId, firmId), eq(firmMembers.userId, user.id)),
      })
    : undefined;
  if (membership && user) return user.id;

  if (!defaultFirmRoleId) {
    throw new SignInError("not_provisioned", "Ask your firm's Merqado admin to add you before signing in.");
  }
  const role = await db.query.firmRoles.findFirst({
    where: and(eq(firmRoles.id, defaultFirmRoleId), eq(firmRoles.firmId, firmId)),
  });
  if (!role) throw new SignInError("not_provisioned", "Ask your firm's Merqado admin to add you before signing in.");

  if (!user) {
    [user] = await db.insert(users).values({ email, name }).returning();
  }
  await db.insert(firmMembers).values({ firmId, userId: user!.id, firmRoleId: role.id });
  return user!.id;
}

/**
 * Lets a named personal test account (TEST_ACCOUNT_EMAILS) into its firm as a regular,
 * non-admin member with the configured title, and onto every engagement as an editor so
 * there is something to look at.
 */
async function provisionTestAccount(db: DB, account: TestAccount, name: string) {
  const domain = testAccountFirmDomain();
  const claimed = domain
    ? await db.query.firmDomains.findFirst({ where: eq(firmDomains.domain, domain) })
    : undefined;
  if (!claimed) throw new SignInError("firm_not_found", "Test accounts aren't set up on this Merqado.");
  const firmId = claimed.firmId;

  const roles = await db.query.firmRoles.findMany({ where: eq(firmRoles.firmId, firmId) });
  const role =
    (account.title && roles.find((r) => r.title.toLowerCase() === account.title!.toLowerCase())) ||
    roles.find((r) => r.id === claimed.defaultFirmRoleId) ||
    [...roles].sort((a, b) => a.rank - b.rank)[0];
  if (!role) throw new SignInError("not_provisioned", "Ask your firm's Merqado admin to add you before signing in.");

  let user = await db.query.users.findFirst({ where: eq(users.email, account.email) });
  if (!user) [user] = await db.insert(users).values({ email: account.email, name }).returning();
  const userId = user!.id;

  const member = await db.query.firmMembers.findFirst({
    where: and(eq(firmMembers.firmId, firmId), eq(firmMembers.userId, userId)),
  });
  if (member) {
    await db
      .update(firmMembers)
      .set({ firmRoleId: role.id, isAdmin: false })
      .where(and(eq(firmMembers.firmId, firmId), eq(firmMembers.userId, userId)));
  } else {
    await db.insert(firmMembers).values({ firmId, userId, firmRoleId: role.id, isAdmin: false });
  }

  const firmEngagements = await db.query.engagements.findMany({ where: eq(engagements.firmId, firmId) });
  if (firmEngagements.length) {
    await db
      .insert(engagementMembers)
      .values(firmEngagements.map((e) => ({ engagementId: e.id, userId, access: "editor" as const })))
      .onConflictDoNothing();
  }
  return { userId, firmId };
}
