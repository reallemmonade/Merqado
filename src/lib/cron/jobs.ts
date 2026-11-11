import { lt } from "drizzle-orm";
import type { DB } from "@/db/client";
import { jobRuns } from "@/db/schema";

export type JobContext = { db: DB; now: Date; slot: string };

export type Job = {
  /** Stable name; it's the key in job_runs, so don't rename a live job. */
  name: string;
  /** Runs at most once per slot of this many minutes (UTC-aligned). 15 = every scheduler tick, 1440 = daily. */
  everyMinutes: number;
  run: (ctx: JobContext) => Promise<unknown>;
};

const KEEP_RUNS_DAYS = 30;

/** Every scheduled job. Add new ones here. */
export const JOBS: Job[] = [
  {
    name: "prune-job-runs",
    everyMinutes: 1440,
    run: async ({ db, now }) => {
      const cutoff = new Date(now.getTime() - KEEP_RUNS_DAYS * 24 * 60 * 60 * 1000);
      const gone = await db.delete(jobRuns).where(lt(jobRuns.startedAt, cutoff)).returning({ id: jobRuns.id });
      return { deleted: gone.length };
    },
  },
];
