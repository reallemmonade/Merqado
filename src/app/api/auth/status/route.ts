import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Whether this browser is signed in, so other open tabs can follow a sign-in or sign-out. */
export async function GET() {
  const signedIn = !!(await getSessionUser(getDb()));
  return NextResponse.json({ signedIn }, { status: signedIn ? 200 : 401, headers: { "cache-control": "no-store" } });
}
