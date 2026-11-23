import { NextResponse } from "next/server";
import { authorize } from "@/lib/experts/api";
import { caseVersion } from "@/lib/live/hub";

export const dynamic = "force-dynamic";

/** The case's live version; the phone polls it while a case screen is open and reloads on change. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, "read");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ v: caseVersion(id) }, { headers: { "cache-control": "no-store" } });
}
