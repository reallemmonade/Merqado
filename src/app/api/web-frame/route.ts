import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getDb } from "@/db/client";
import { getSessionUser } from "@/lib/session";

/**
 * Whether a page's site lets itself be shown inside another page (Tiles web tiles).
 * Signed-in users only. Only https pages on public addresses are fetched, and the final address after
 * redirects is checked too, so this cannot reach this server's own network.
 */

function privateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (v === 6) {
    const l = ip.toLowerCase();
    return l === "::" || l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:");
  }
  return true;
}

async function publicHost(hostname: string): Promise<boolean> {
  const addrs = await lookup(hostname, { all: true }).catch(() => null);
  return !!addrs && addrs.length > 0 && !addrs.some((a) => privateAddress(a.address));
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const user = await getSessionUser(getDb());
  if (!user) return json({ error: "Sign in to continue." }, 401);
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return json({ error: "Not an address." }, 400);
  }
  if (url.protocol !== "https:" || !(await publicHost(url.hostname))) return json({ ok: false, blocked: false });
  const r = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(6000),
    headers: { "User-Agent": "Mozilla/5.0 Merqado" },
  }).catch(() => null);
  if (!r) return json({ ok: false, blocked: false });
  r.body?.cancel().catch(() => {});
  if (!(await publicHost(new URL(r.url).hostname))) return json({ ok: false, blocked: false });
  const xfo = (r.headers.get("x-frame-options") ?? "").toLowerCase();
  const csp = (r.headers.get("content-security-policy") ?? "").toLowerCase();
  const fa = csp.match(/frame-ancestors([^;]*)/)?.[1];
  // A site that names who may frame it, without a wildcard, is treated as blocking us.
  const blocked = /deny|sameorigin/.test(xfo) || (fa !== undefined && !fa.includes("*"));
  return json({ ok: true, blocked });
}
