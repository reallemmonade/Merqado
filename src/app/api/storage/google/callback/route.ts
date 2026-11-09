import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { appBaseUrl } from "@/lib/auth/url";
import { getSessionUser } from "@/lib/session";
import { firmStorage, setFirmStorage } from "@/lib/storage/connections";
import { createRootFolder, DRIVE_CALLBACK, DRIVE_STATE_COOKIE, googleOAuthClient } from "@/lib/storage/providers/gdrive";

/** Google sends the admin back here; we keep a refresh token and a "Merqado" folder for cases. */
export async function GET(req: Request) {
  const base = appBaseUrl(req);
  const back = (q: string) => NextResponse.redirect(`${base}/settings/storage${q}`, 303);
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user?.isAdmin) return back("?error=admin");

  const params = new URL(req.url).searchParams;
  const jar = await cookies();
  const expected = jar.get(DRIVE_STATE_COOKIE)?.value;
  jar.delete({ name: DRIVE_STATE_COOKIE, path: "/api/storage" });
  if (params.get("error")) return back("?error=denied");
  const code = params.get("code");
  if (!code || !expected || params.get("state") !== expected) return back("?error=state");

  try {
    const { clientId, clientSecret } = googleOAuthClient();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: `${base}${DRIVE_CALLBACK}` }),
    });
    const tok = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; id_token?: string };
    if (!res.ok || !tok.access_token || !tok.refresh_token) return back("?error=token");
    if (!tok.scope?.includes("auth/drive")) return back("?error=scope");
    const account = emailFromIdToken(tok.id_token) ?? user.email;

    // Reconnecting keeps the folder the firm already uses.
    const current = await firmStorage(db, user.firmId);
    const keep = current?.config.kind === "gdrive" ? current.config : null;
    const rootFolderId = keep?.rootFolderId ?? (await createRootFolder(tok.access_token));
    await setFirmStorage(db, user.firmId, "Google Drive", {
      kind: "gdrive",
      refreshToken: tok.refresh_token,
      rootFolderId,
      rootName: keep?.rootName ?? "Merqado",
      account,
    });
    return back("");
  } catch (err) {
    console.error("Drive connect failed", err);
    return back("?error=drive");
  }
}

function emailFromIdToken(idToken?: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split(".")[1]!, "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
