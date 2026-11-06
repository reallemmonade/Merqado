import { z } from "zod";
import { EXPENSE_CATEGORIES, EXPERT_STATUSES, TAKEAWAY_VERDICTS } from "@/db/schema";

const minutes = z.coerce.number().int().min(0).max(100000);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .or(z.literal("").transform(() => null));

export const expertFields = z.object({
  typeId: z.string().nullable(),
  status: z.enum(EXPERT_STATUSES),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100),
  company: z.string().trim().max(200),
  title: z.string().trim().max(300),
  anonTitle: z.string().trim().max(300).nullable(),
  isFormer: z.boolean(),
  interviewDate: isoDate,
  network: z.string().trim().max(100),
  callMinutes: minutes,
  followupMinutes: minutes,
  surveyMinutes: minutes,
  hourlyRate: z.coerce.number().int().min(0).max(1000000),
  topicIds: z.array(z.string()).max(100),
  notes: z.string().max(20000),
  guide: z.string().max(100000).nullable(),
});

export const expertCreate = expertFields.partial().extend({ firstName: z.string().trim().min(1).max(100) });
export const expertPatch = expertFields.partial();

export const takeawayFields = z.object({
  body: z.string().trim().min(1).max(5000),
  verdict: z.enum(TAKEAWAY_VERDICTS),
  hypothesisId: z.string().nullable(),
  locator: z.string().trim().max(40),
  included: z.boolean(),
});

export const setupOp = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("type"), id: z.string().optional(), name: z.string().trim().min(1).max(100), target: z.coerce.number().int().min(0).max(1000) }),
  z.object({ kind: z.literal("topic"), id: z.string().optional(), name: z.string().trim().min(1).max(100), target: z.coerce.number().int().min(0).max(1000) }),
  z.object({ kind: z.literal("hypothesis"), id: z.string().optional(), statement: z.string().trim().min(1).max(1000), slideRef: z.string().trim().max(40) }),
  z.object({ kind: z.literal("budget"), total: z.coerce.number().int().min(0), plannedInterviews: z.coerce.number().int().min(0).max(10000) }),
  z.object({
    kind: z.literal("expense"),
    category: z.enum(EXPENSE_CATEGORIES),
    description: z.string().trim().max(300),
    amount: z.coerce.number().int().min(0).max(10000000),
    spentOn: isoDate,
  }),
  z.object({ kind: z.literal("guide"), typeId: z.string().nullable(), body: z.string().max(100000) }),
  z.object({ kind: z.literal("dates"), startsOn: isoDate, endsOn: isoDate }),
  z.object({ kind: z.literal("delete"), what: z.enum(["type", "topic", "hypothesis", "expense"]), id: z.string() }),
]);
export type SetupOp = z.infer<typeof setupOp>;
