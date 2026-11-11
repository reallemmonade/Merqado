import { and, eq, lt, or } from "drizzle-orm";
import type { DB } from "@/db/client";
import { jobRuns } from "@/db/schema";
import type { Job } from "./jobs";
import { slotKey } from "./slot";

/** A run still marked "running" after this long is treated as crashed and may be retried. */
const STALE_MS = 15 * 60_000;

export type JobOutcome =
  | { job: string; slot: string; status: "done"; result: unknown }
  | { job: string; slot: string; status: "failed"; error: string }
  | { job: string; slot: string; status: "skipped" };

/**
 * Takes this slot for the job. True when we got it: a fresh slot, a failed run, or a run that
 * crashed. False when another call already ran it (or is running it) in this slot.
 */
async function claim(db: DB, job: string, slot: string, now: Date): Promise<boolean> {
  const inserted = await db
    .insert(jobRuns)
    .values({ job, slot, status: "running", startedAt: now })
    .onConflictDoNothing()
    .returning({ id: jobRuns.id });
  if (inserted.length) return true;
  const retaken = await db
    .update(jobRuns)
    .set({ status: "running", startedAt: now, finishedAt: null, result: null })
    .where(
      and(
        eq(jobRuns.job, job),
        eq(jobRuns.slot, slot),
        or(
          eq(jobRuns.status, "failed"),
          and(eq(jobRuns.status, "running"), lt(jobRuns.startedAt, new Date(now.getTime() - STALE_MS))),
        ),
      ),
    )
    .returning({ id: jobRuns.id });
  return retaken.length > 0;
}

function summary(value: unknown): string | null {
  if (value === undefined) return null;
  const text = JSON.stringify(value) ?? null;
  return text && text.length > 2000 ? text.slice(0, 2000) : text;
}

/** Runs every job whose slot hasn't been run yet, one after another. Never throws for a job's error. */
export async function runDueJobs(db: DB, jobs: Job[], now = new Date()): Promise<JobOutcome[]> {
  const outcomes: JobOutcome[] = [];
  for (const job of jobs) {
    const slot = slotKey(now, job.everyMinutes);
    if (!(await claim(db, job.name, slot, now))) {
      outcomes.push({ job: job.name, slot, status: "skipped" });
      continue;
    }
    const where = and(eq(jobRuns.job, job.name), eq(jobRuns.slot, slot));
    try {
      const result = await job.run({ db, now, slot });
      await db.update(jobRuns).set({ status: "done", finishedAt: new Date(), result: summary(result) }).where(where);
      outcomes.push({ job: job.name, slot, status: "done", result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`Job ${job.name} failed:`, err);
      await db.update(jobRuns).set({ status: "failed", finishedAt: new Date(), result: error.slice(0, 2000) }).where(where);
      outcomes.push({ job: job.name, slot, status: "failed", error });
    }
  }
  return outcomes;
}
