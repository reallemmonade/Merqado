import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { gmailLinks } from "@/db/schema";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { DRIVE_CALLBACK, googleOAuthClient } from "@/lib/storage/providers/gdrive";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
/** Headers only: sender, subject, labels. Merqado never reads message bodies. */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.metadata";
/** Linking reuses the Drive redirect address, so the Google app needs no new settings. */
export const GMAIL_CALLBACK = DRIVE_CALLBACK;
export const GMAIL_COOKIE = "mq_gmail_link";
export const GMAIL_STATE_PREFIX = "mail.";
const LINK_TTL_SECONDS = 10 * 60;

type LinkFlow = { state: string; userId: string; returnTo: string; exp: number };

/** Google's consent page for Gmail headers, and the cookie that proves the reply is ours. */
export function beginGmailLink(opts: { base: string; userId: string; email: string; returnTo: string }): { url: string; cookie: string; maxAge: number } {
  const { clientId } = googleOAuthClient();
  const flow: LinkFlow = { state: `${GMAIL_STATE_PREFIX}${randomBytes(18).toString("base64url")}`, userId: opts.userId, returnTo: opts.returnTo, exp: Date.now() + LINK_TTL_SECONDS * 1000 };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${opts.base}${GMAIL_CALLBACK}`,
    response_type: "code",
    scope: `openid email ${GMAIL_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    login_hint: opts.email,
    state: flow.state,
  }).toString();
  return { url: url.toString(), cookie: encryptJson(flow), maxAge: LINK_TTL_SECONDS };
}

export const isGmailState = (state: string | null) => !!state?.startsWith(GMAIL_STATE_PREFIX);

export type GmailLinkResult = { returnTo: string; error?: "denied" | "state" | "scope" | "failed" };

/** Completes a link: checks the state, trades the code and keeps the refresh token. */
export async function finishGmailLink(
  db: DB,
  opts: { cookie: string | undefined; params: URLSearchParams; base: string; user: { id: string; firmId: string } | null },
): Promise<GmailLinkResult> {
  let flow: LinkFlow;
  try {
    flow = decryptJson<LinkFlow>(opts.cookie ?? "");
  } catch {
    return { returnTo: "/settings", error: "state" };
  }
  const back = (error?: GmailLinkResult["error"]): GmailLinkResult => ({ returnTo: flow.returnTo, ...(error && { error }) });
  if (flow.exp < Date.now() || opts.params.get("state") !== flow.state || !opts.user || opts.user.id !== flow.userId) return back("state");
  if (opts.params.get("error")) return back("denied");
  const code = opts.params.get("code");
  if (!code) return back("state");
  try {
    const { clientId, clientSecret } = googleOAuthClient();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${opts.base}${GMAIL_CALLBACK}` }),
    });
    const tok = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; id_token?: string };
    if (!res.ok || !tok.access_token || !tok.refresh_token) return back("failed");
    if (!tok.scope?.includes(GMAIL_SCOPE)) return back("scope");
    const profile = await gmailCall<{ emailAddress?: string; historyId?: string }>(tok.access_token, "/profile");
    const values = {
      firmId: opts.user.firmId,
      account: (profile.emailAddress ?? "").toLowerCase(),
      encryptedToken: encryptJson({ refreshToken: tok.refresh_token }),
      // Start from now: only mail that arrives after linking is new.
      historyId: profile.historyId ?? null,
      checkedAt: new Date(),
      lastError: null,
    };
    await db.insert(gmailLinks).values({ userId: opts.user.id, ...values }).onConflictDoUpdate({ target: gmailLinks.userId, set: values });
    return back();
  } catch (e) {
    console.error("Gmail link failed", e instanceof Error ? e.message : e);
    return back("failed");
  }
}

export class GmailError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function gmailCall<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GmailError(res.status, `Gmail ${res.status}: ${body.error?.message ?? res.statusText}`.slice(0, 300));
  }
  return (await res.json()) as T;
}

/** A fresh Gmail token, or null when the link is gone or Google refused (the error is kept). */
export async function gmailAccess(db: DB, userId: string): Promise<string | null> {
  const link = await db.query.gmailLinks.findFirst({ where: eq(gmailLinks.userId, userId) });
  if (!link) return null;
  try {
    const { refreshToken } = decryptJson<{ refreshToken: string }>(link.encryptedToken);
    const { clientId, clientSecret } = googleOAuthClient();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
    if (!res.ok || !data.access_token) throw new Error(`Gmail sign-in expired (${data.error ?? res.status})`);
    return data.access_token;
  } catch (e) {
    await db
      .update(gmailLinks)
      .set({ lastError: e instanceof Error ? e.message.slice(0, 300) : "Link expired" })
      .where(eq(gmailLinks.userId, userId));
    return null;
  }
}

/** The person's Gmail link, for Settings. */
export async function gmailStatus(db: DB, userId: string): Promise<{ account: string; broken: boolean } | null> {
  const link = await db.query.gmailLinks.findFirst({ where: eq(gmailLinks.userId, userId), columns: { account: true, lastError: true } });
  return link ? { account: link.account, broken: !!link.lastError } : null;
}
