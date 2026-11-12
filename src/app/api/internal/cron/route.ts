import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { cronAuthorized } from "@/lib/cron/auth";
import { JOBS } from "@/lib/cron/jobs";
import { runDueJobs } from "@/lib/cron/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Called every 15 minutes by .github/workflows/cron.yml, signed with the workflow's GitHub
 * OIDC token (or the optional CRON_SECRET in the x-cron-secret header). Runs each job that hasn't run in its current slot.
 */
export async function POST(req: Request) {
  if (!(await cronAuthorized(req.headers))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const outcomes = await runDueJobs(getDb(), JOBS);
  const failed = outcomes.some((o) => o.status === "failed");
  return NextResponse.json({ ok: !failed, jobs: outcomes }, { status: failed ? 500 : 200 });
}
