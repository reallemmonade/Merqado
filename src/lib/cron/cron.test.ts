import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { DB } from "@/db/client";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { CRON_AUDIENCE, CRON_SECRET_HEADER, GITHUB_OIDC_ISSUER, githubWorkflowAuthorized, secretAuthorized } from "./auth";
import type { Job } from "./jobs";
import { runDueJobs } from "./run";
import { slotKey } from "./slot";
import { isValidTimeZone, localTime } from "./time-zone";

describe("slots", () => {
  it("aligns to 15-minute and daily UTC slots", () => {
    const at = new Date("2026-11-11T20:29:59Z");
    expect(slotKey(at, 15)).toBe("2026-11-11T20:15:00.000Z");
    expect(slotKey(new Date("2026-11-11T20:30:00Z"), 15)).toBe("2026-11-11T20:30:00.000Z");
    expect(slotKey(at, 1440)).toBe("2026-11-11T00:00:00.000Z");
    expect(() => slotKey(at, 0)).toThrow();
  });
});

describe("time zones", () => {
  it("reads the local wall clock and falls back to UTC", () => {
    const at = new Date("2026-11-11T14:05:00Z");
    expect(localTime(at, "America/New_York")).toEqual({ date: "2026-11-11", hour: 9, minute: 5, weekday: 3 });
    expect(localTime(at, "Asia/Tokyo")).toMatchObject({ date: "2026-11-11", hour: 23 });
    expect(localTime(at, null)).toMatchObject({ hour: 14 });
    expect(localTime(at, "Not/AZone")).toMatchObject({ hour: 14 });
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("nope")).toBe(false);
    expect(isValidTimeZone(5)).toBe(false);
  });
});

describe("cron auth", () => {
  const h = (v?: string) => new Headers(v ? { [CRON_SECRET_HEADER]: v } : {});
  it("needs the exact secret, and a secret to be set", () => {
    const secret = "s".repeat(32);
    expect(secretAuthorized(h(secret), secret)).toBe(true);
    expect(secretAuthorized(h("wrong"), secret)).toBe(false);
    expect(secretAuthorized(h(), secret)).toBe(false);
    expect(secretAuthorized(h(""), "")).toBe(false);
    expect(secretAuthorized(h("short"), "short")).toBe(false);
  });

  it("accepts only this repo's Scheduler workflow token on main", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const other = await generateKeyPair("RS256");
    const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
    const good = {
      repository: "reallemmonade/Merqado",
      workflow_ref: "reallemmonade/Merqado/.github/workflows/cron.yml@refs/heads/main",
      ref: "refs/heads/main",
    };
    const sign = (claims: Record<string, unknown>, opts: { aud?: string; iss?: string; key?: CryptoKey } = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(opts.iss ?? GITHUB_OIDC_ISSUER)
        .setAudience(opts.aud ?? CRON_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(opts.key ?? privateKey);
    const bearer = async (t: Promise<string>) => new Headers({ authorization: `Bearer ${await t}` });
    expect(await githubWorkflowAuthorized(await bearer(sign(good)), keys)).toBe(true);
    expect(await githubWorkflowAuthorized(await bearer(sign({ ...good, repository: "someone/Merqado" })), keys)).toBe(false);
    expect(
      await githubWorkflowAuthorized(
        await bearer(sign({ ...good, workflow_ref: "reallemmonade/Merqado/.github/workflows/other.yml@refs/heads/main" })),
        keys,
      ),
    ).toBe(false);
    expect(await githubWorkflowAuthorized(await bearer(sign({ ...good, ref: "refs/heads/feature" })), keys)).toBe(false);
    expect(await githubWorkflowAuthorized(await bearer(sign(good, { aud: "other" })), keys)).toBe(false);
    expect(await githubWorkflowAuthorized(await bearer(sign(good, { iss: "https://evil.example" })), keys)).toBe(false);
    expect(await githubWorkflowAuthorized(await bearer(sign(good, { key: other.privateKey })), keys)).toBe(false);
    expect(await githubWorkflowAuthorized(new Headers(), keys)).toBe(false);
  });
});

describe("runDueJobs", () => {
  let db: DB;
  beforeEach(async () => {
    const dir = mkdtempSync(join(tmpdir(), "mq-cron-"));
    db = drizzle(createClient({ url: `file:${join(dir, "t.db")}` }), { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  const counter = (name: string, everyMinutes = 15, fail = false) => {
    const job: Job & { calls: number } = {
      name,
      everyMinutes,
      calls: 0,
      run: async () => {
        job.calls++;
        if (fail) throw new Error("boom");
        return { n: job.calls };
      },
    };
    return job;
  };

  it("runs each job once per slot", async () => {
    const quick = counter("quick");
    const daily = counter("daily", 1440);
    const t0 = new Date("2026-11-11T20:01:00Z");
    expect((await runDueJobs(db, [quick, daily], t0)).map((o) => o.status)).toEqual(["done", "done"]);
    expect((await runDueJobs(db, [quick, daily], new Date("2026-11-11T20:14:00Z"))).map((o) => o.status)).toEqual([
      "skipped",
      "skipped",
    ]);
    expect((await runDueJobs(db, [quick, daily], new Date("2026-11-11T20:16:00Z"))).map((o) => o.status)).toEqual([
      "done",
      "skipped",
    ]);
    expect(quick.calls).toBe(2);
    expect(daily.calls).toBe(1);
    const rows = await db.select().from(schema.jobRuns).where(eq(schema.jobRuns.job, "quick"));
    expect(rows.map((r) => [r.status, r.result])).toEqual([
      ["done", '{"n":1}'],
      ["done", '{"n":2}'],
    ]);
  });

  it("runs once when two calls race for a slot", async () => {
    const job = counter("race");
    const t = new Date("2026-11-11T20:01:00Z");
    await Promise.all([runDueJobs(db, [job], t), runDueJobs(db, [job], t)]);
    expect(job.calls).toBe(1);
  });

  it("records a failure, keeps going, and retries in the same slot", async () => {
    const bad = counter("bad", 15, true);
    const good = counter("good");
    const t = new Date("2026-11-11T20:01:00Z");
    const out = await runDueJobs(db, [bad, good], t);
    expect(out.map((o) => o.status)).toEqual(["failed", "done"]);
    const [row] = await db.select().from(schema.jobRuns).where(eq(schema.jobRuns.job, "bad"));
    expect(row).toMatchObject({ status: "failed", result: "boom" });
    await runDueJobs(db, [bad, good], new Date("2026-11-11T20:05:00Z"));
    expect(bad.calls).toBe(2);
    expect(good.calls).toBe(1);
  });

  it("retakes a run that crashed while running", async () => {
    const job = counter("crashy");
    await db.insert(schema.jobRuns).values({
      job: "crashy",
      slot: "2026-11-11T00:00:00.000Z",
      status: "running",
      startedAt: new Date("2026-11-11T00:01:00Z"),
    });
    const daily = { ...job, everyMinutes: 1440 };
    expect((await runDueJobs(db, [daily], new Date("2026-11-11T00:10:00Z")))[0]!.status).toBe("skipped");
    expect((await runDueJobs(db, [daily], new Date("2026-11-11T00:30:00Z")))[0]!.status).toBe("done");
  });
});
