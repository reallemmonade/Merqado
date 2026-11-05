import * as oidc from "openid-client";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { firmMembers, firmRoles, ssoConnections, users } from "@/db/schema";
import { decryptJson, encryptJson } from "@/lib/crypto";

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

const configCache = new Map<string, { config: oidc.Configuration; at: number }>();
const CONFIG_TTL_MS = 60 * 60 * 1000;

async function getConfig(conn: Connection): Promise<oidc.Configuration> {
  const hit = configCache.get(conn.id);
  if (hit && Date.now() - hit.at < CONFIG_TTL_MS) return hit.config;
  const secret = decryptJson<string>(conn.encryptedClientSecret);
  const issuer = new URL(conn.issuer);
  // Plain-http issuers are only allowed for a local test IdP during development.
  const insecureOk = process.env.NODE_ENV !== "production" && issuer.protocol === "http:" && issuer.hostname === "localhost";
  const config = await oidc.discovery(issuer, conn.clientId, secret, undefined, {
    execute: insecureOk ? [oidc.allowInsecureRequests] : [],
  });
  configCache.set(conn.id, { config, at: Date.now() });
  return config;
}

interface FlowState {
  connectionId: string;
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  loginHint: string;
  exp: number;
}

/** Builds the IdP redirect plus an encrypted cookie holding the PKCE verifier, state and nonce. */
export async function beginSignIn(
  conn: Connection,
  opts: { redirectUri: string; returnTo: string; loginHint: string },
): Promise<{ url: URL; flowCookie: string }> {
  const config = await getConfig(conn);
  const verifier = oidc.randomPKCECodeVerifier();
  const flow: FlowState = {
    connectionId: conn.id,
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    verifier,
    returnTo: opts.returnTo,
    loginHint: opts.loginHint,
    exp: Date.now() + FLOW_TTL_SECONDS * 1000,
  };
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: opts.redirectUri,
    scope: "openid email profile",
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    state: flow.state,
    nonce: flow.nonce,
    login_hint: opts.loginHint,
  });
  return { url, flowCookie: encryptJson(flow) };
}

export class SignInError extends Error {
  constructor(
    readonly code: "expired" | "no_connection" | "no_email" | "wrong_domain" | "not_provisioned",
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
): Promise<{ userId: string; firmId: string; connectionId: string; returnTo: string }> {
  if (!opts.flowCookie) throw new SignInError("expired", "Sign-in took too long. Try again.");
  let flow: FlowState;
  try {
    flow = decryptJson<FlowState>(opts.flowCookie);
  } catch {
    throw new SignInError("expired", "Sign-in took too long. Try again.");
  }
  if (flow.exp < Date.now()) throw new SignInError("expired", "Sign-in took too long. Try again.");

  const conn = await db.query.ssoConnections.findFirst({
    where: and(eq(ssoConnections.id, flow.connectionId), eq(ssoConnections.enabled, true)),
  });
  if (!conn) throw new SignInError("no_connection", "Single sign-on is no longer set up for this firm.");

  const config = await getConfig(conn);
  const tokens = await oidc.authorizationCodeGrant(config, opts.callbackUrl, {
    pkceCodeVerifier: flow.verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims) throw new SignInError("no_email", "Your identity provider did not return an ID token.");

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

  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : email;
  const userId = await provisionUser(db, conn, email, name);
  return { userId, firmId: conn.firmId, connectionId: conn.id, returnTo: flow.returnTo };
}

async function provisionUser(db: DB, conn: Connection, email: string, name: string): Promise<string> {
  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  const membership = user
    ? await db.query.firmMembers.findFirst({
        where: and(eq(firmMembers.firmId, conn.firmId), eq(firmMembers.userId, user.id)),
      })
    : undefined;
  if (membership && user) return user.id;

  if (!conn.defaultFirmRoleId) {
    throw new SignInError("not_provisioned", "Ask your firm's Merqado admin to add you before signing in.");
  }
  const role = await db.query.firmRoles.findFirst({
    where: and(eq(firmRoles.id, conn.defaultFirmRoleId), eq(firmRoles.firmId, conn.firmId)),
  });
  if (!role) throw new SignInError("not_provisioned", "Ask your firm's Merqado admin to add you before signing in.");

  if (!user) {
    [user] = await db.insert(users).values({ email, name }).returning();
  }
  await db.insert(firmMembers).values({ firmId: conn.firmId, userId: user!.id, firmRoleId: role.id });
  return user!.id;
}
