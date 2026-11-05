import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { destroySession, SESSION_COOKIE } from "@/lib/auth/session";
import { appBaseUrl } from "@/lib/auth/url";

export async function POST(req: Request) {
  const jar = await cookies();
  await destroySession(getDb(), jar.get(SESSION_COOKIE)?.value);
  const res = NextResponse.redirect(`${appBaseUrl(req)}/login`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
