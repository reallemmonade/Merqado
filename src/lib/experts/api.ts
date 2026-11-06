import { NextResponse } from "next/server";
import { getDb, type DB } from "@/db/client";
import { can, type Action } from "@/lib/roles";
import { getEngagementAccess, getSessionUser, type SessionUser } from "@/lib/session";

export interface Authorized {
  db: DB;
  user: SessionUser;
  engagement: NonNullable<Awaited<ReturnType<typeof getEngagementAccess>>>["engagement"];
}

/** Signs the caller in and checks engagement access; returns an error response otherwise. */
export async function authorize(engagementId: string, action: Action): Promise<Authorized | NextResponse> {
  const db = getDb();
  const user = await getSessionUser(db);
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const membership = await getEngagementAccess(db, user, engagementId);
  if (!membership || !can(membership.access, action)) {
    return NextResponse.json({ error: "You don't have access to do that on this engagement." }, { status: 403 });
  }
  return { db, user, engagement: membership.engagement };
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function aiError(err: unknown) {
  console.error("experts AI call failed", err);
  const message =
    process.env.NODE_ENV !== "production" && err instanceof Error
      ? err.message
      : "The model could not be reached. Check this firm's AI connection.";
  return NextResponse.json({ error: message }, { status: 502 });
}

/** Pulls the first JSON object out of a model reply (models sometimes wrap it in prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}
