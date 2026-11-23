import { eq, lt } from "drizzle-orm";
import type { DB } from "@/db/client";
import { engagements, jobRuns } from "@/db/schema";
import { sweepNewFiles } from "@/lib/case/dictionary";
import { purgeDeleted } from "@/lib/files/trash";
import { runNudges } from "@/lib/inbox/nudge";
import { runGmailCheck } from "@/lib/mail/check";
import { runMeetingSync } from "@/lib/meetings/sync";

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
    name: "needs-you-nudges",
    everyMinutes: 15,
    run: ({ db, now }) => runNudges(db, now),
  },
  {
    name: "dictionary-from-files",
    everyMinutes: 15,
    run: ({ db, now }) => sweepNewFiles(db, now),
  },
  {
    name: "meetings-from-microsoft",
    everyMinutes: 15,
    run: ({ db, now }) => runMeetingSync(db, now),
  },
  {
    name: "gmail-new-mail",
    everyMinutes: 15,
    run: ({ db, now }) => runGmailCheck(db, now),
  },
  {
    name: "purge-deleted-files",
    everyMinutes: 1440,
    run: ({ db, now }) => {
      const firms = new Map<string, string | null>();
      return purgeDeleted(db, now, async (engagementId) => {
        if (!firms.has(engagementId)) {
          const e = await db.query.engagements.findFirst({ where: eq(engagements.id, engagementId), columns: { firmId: true } });
          firms.set(engagementId, e?.firmId ?? null);
        }
        return firms.get(engagementId)!;
      });
    },
  },
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
