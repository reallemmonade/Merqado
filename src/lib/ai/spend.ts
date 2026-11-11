import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { firms, usageEvents } from "@/db/schema";
import { costUsd } from "./pricing";

/** Thrown before a model call when the firm has used its monthly AI budget. */
export class SpendCapError extends Error {
  constructor(
    readonly spentUsd: number,
    readonly capUsd: number,
  ) {
    super(`Monthly AI budget reached ($${spentUsd.toFixed(2)} of $${capUsd.toFixed(2)}).`);
    this.name = "SpendCapError";
  }
}

export function monthStartUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** The firm's AI spend so far this calendar month (UTC), priced from usage_events. */
export async function monthlySpendUsd(db: DB, firmId: string, now = new Date()): Promise<number> {
  const rows = await db
    .select({
      model: usageEvents.model,
      input: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)`,
      output: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.firmId, firmId), gte(usageEvents.createdAt, monthStartUtc(now))))
    .groupBy(usageEvents.model);
  return rows.reduce((sum, r) => sum + costUsd(r.model, Number(r.input), Number(r.output)), 0);
}

/**
 * The cap that applies: the firm's own setting, else (managed billing only) MANAGED_AI_MONTHLY_CAP_USD.
 * Null means no cap.
 */
export function effectiveCapUsd(firm: { aiMonthlyCapUsd: number | null; aiBillingMode: string }): number | null {
  if (firm.aiMonthlyCapUsd != null) return firm.aiMonthlyCapUsd;
  if (firm.aiBillingMode !== "managed") return null;
  const env = Number(process.env.MANAGED_AI_MONTHLY_CAP_USD);
  return Number.isFinite(env) && env > 0 ? env : null;
}

/** Throws SpendCapError when the firm is at or over its monthly cap. */
export async function assertUnderSpendCap(db: DB, firmId: string, now = new Date()): Promise<void> {
  const firm = await db.query.firms.findFirst({ where: eq(firms.id, firmId) });
  if (!firm) throw new Error(`Firm ${firmId} not found`);
  const cap = effectiveCapUsd(firm);
  if (cap == null) return;
  const spent = await monthlySpendUsd(db, firmId, now);
  if (spent >= cap) throw new SpendCapError(spent, cap);
}
