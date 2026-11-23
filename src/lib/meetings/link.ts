import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { microsoftLinks } from "@/db/schema";
import { MICROSOFT_CONSUMER_TENANT } from "@/lib/auth/platform";
import { CALLBACK_PATH } from "@/lib/auth/url";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { BASE_SCOPES, exchangeCode, microsoftApp, refreshAccess, scopeString, TRANSCRIPT_SCOPES } from "./graph";

/**
 * Linking a Microsoft account for meetings reuses the sign-in redirect address, so the app
 * registration needs no new settings. This cookie tells the callback it's a link, not a sign-in.
 */
export const LINK_COOKIE = "mq_ms_link";
const LINK_TTL_SECONDS = 10 * 60;
const AUTHORIZE = "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize";

interface LinkFlow {
  state: string;
  verifier: string;
  userId: string;
  returnTo: string;
  full: boolean;
  exp: number;
}

export const linkScopes = (full: boolean) => (full ? [...BASE_SCOPES, ...TRANSCRIPT_SCOPES] : BASE_SCOPES);

/** The consent page address and the cookie that proves the reply is ours. */
export function beginLink(opts: { base: string; userId: string; email: string; returnTo: string; full: boolean }): { url: string; cookie: string; maxAge: number } {
  const { clientId } = microsoftApp();
  const verifier = randomBytes(32).toString("base64url");
  const flow: LinkFlow = {
    state: `link.${randomBytes(18).toString("base64url")}`,
    verifier,
    userId: opts.userId,
    returnTo: opts.returnTo,
    full: opts.full,
    exp: Date.now() + LINK_TTL_SECONDS * 1000,
  };
  const url = new URL(AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${opts.base}${CALLBACK_PATH}`,
    response_mode: "query",
    scope: scopeString(linkScopes(opts.full)),
    state: flow.state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    login_hint: opts.email,
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie: encryptJson(flow), maxAge: LINK_TTL_SECONDS };
}

/** True when the callback carries a meetings link rather than a sign-in. */
export const isLinkState = (state: string | null) => !!state?.startsWith("link.");

/** Where to send someone whose IT admin must approve transcript access for their organization. */
export function adminConsentUrl(base: string): string {
  const { clientId } = microsoftApp();
  const url = new URL("https://login.microsoftonline.com/organizations/v2.0/adminconsent");
  url.search = new URLSearchParams({ client_id: clientId, scope: scopeString(TRANSCRIPT_SCOPES), redirect_uri: `${base}${CALLBACK_PATH}`, state: "link.admin" }).toString();
  return url.toString();
}

export type LinkResult = { returnTo: string; error?: "denied" | "consent" | "state" | "personal" | "failed" };

/** Completes a link: checks the state, trades the code and keeps the refresh token. */
export async function finishLink(db: DB, opts: { cookie: string | undefined; params: URLSearchParams; base: string; user: { id: string; firmId: string } | null }): Promise<LinkResult> {
  let flow: LinkFlow;
  try {
    flow = decryptJson<LinkFlow>(opts.cookie ?? "");
  } catch {
    return { returnTo: "/", error: "state" };
  }
  const back = (error?: LinkResult["error"]): LinkResult => ({ returnTo: flow.returnTo, ...(error && { error }) });
  if (flow.exp < Date.now() || opts.params.get("state") !== flow.state || !opts.user || opts.user.id !== flow.userId) return back("state");
  const err = opts.params.get("error");
  if (err) {
    // AADSTS65001 / 90094: the organization requires an admin to approve these permissions.
    const desc = opts.params.get("error_description") ?? "";
    return back(flow.full && /65001|90094|admin/i.test(desc) ? "consent" : "denied");
  }
  const code = opts.params.get("code");
  if (!code) return back("state");
  try {
    const tok = await exchangeCode(code, `${opts.base}${CALLBACK_PATH}`, flow.verifier, linkScopes(flow.full));
    const claims = parseJwt(tok.idToken);
    const tid = typeof claims.tid === "string" ? claims.tid : "";
    if (!tid || tid === MICROSOFT_CONSUMER_TENANT) return back("personal");
    const account = String(claims.preferred_username ?? claims.email ?? "").toLowerCase();
    const transcripts = /OnlineMeetingTranscript\.Read\.All/i.test(tok.scope);
    const values = {
      firmId: opts.user.firmId,
      account,
      tenantId: tid,
      encryptedToken: encryptJson({ refreshToken: tok.refreshToken, full: transcripts }),
      transcripts,
      lastError: null,
    };
    await db.insert(microsoftLinks).values({ userId: opts.user.id, ...values }).onConflictDoUpdate({ target: microsoftLinks.userId, set: values });
    return back();
  } catch (e) {
    console.error("Microsoft link failed", e instanceof Error ? e.message : e);
    return back("failed");
  }
}

function parseJwt(token: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/** A fresh Graph token for this person, or null when they haven't linked or the link expired. */
export async function graphAccess(db: DB, userId: string): Promise<{ token: string; transcripts: boolean } | null> {
  const link = await db.query.microsoftLinks.findFirst({ where: eq(microsoftLinks.userId, userId) });
  if (!link) return null;
  try {
    const saved = decryptJson<{ refreshToken: string; full: boolean }>(link.encryptedToken);
    const fresh = await refreshAccess(saved.refreshToken, linkScopes(saved.full));
    if (fresh.refreshToken !== saved.refreshToken || link.lastError) {
      await db
        .update(microsoftLinks)
        .set({ encryptedToken: encryptJson({ ...saved, refreshToken: fresh.refreshToken }), lastError: null })
        .where(eq(microsoftLinks.userId, userId));
    }
    return { token: fresh.accessToken, transcripts: saved.full };
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "Link expired";
    await db.update(microsoftLinks).set({ lastError: message }).where(eq(microsoftLinks.userId, userId));
    return null;
  }
}
