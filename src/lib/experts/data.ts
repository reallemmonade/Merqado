import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  caseBudgets,
  caseExpenses,
  experts,
  expertTopics,
  expertTranscripts,
  expertTypes,
  hypotheses,
  keyTakeaways,
  runningGuides,
  users,
} from "@/db/schema";
import { parseApprovals } from "./approval";
import { anonymizeTitle, honorarium, isBilled, parseIdList, totalMinutes, type Status } from "./calc";

export type ExpertRow = {
  id: string;
  typeId: string | null;
  status: Status;
  firstName: string;
  lastName: string;
  name: string;
  company: string;
  title: string;
  anonTitle: string;
  anonOverride: string | null;
  isFormer: boolean;
  interviewDate: string | null;
  network: string;
  callMinutes: number;
  followupMinutes: number;
  surveyMinutes: number;
  hourlyRate: number;
  minutes: number;
  honorarium: number;
  billed: boolean;
  topicIds: string[];
  notes: string;
  guide: string | null;
  proposedByName: string | null;
  requestedBy: string | null;
  requestedByName: string | null;
  approvals: string[];
  transcriptCount: number;
  takeawayCount: number;
};

/** Everything the Experts screens show for one engagement, in one round of queries. */
export async function loadExperts(db: DB, engagementId: string) {
  const [types, topics, rows, transcripts, takeaways, hyps, guides, budget, expenses, people] = await Promise.all([
    db.select().from(expertTypes).where(eq(expertTypes.engagementId, engagementId)).orderBy(asc(expertTypes.sort), asc(expertTypes.name)),
    db.select().from(expertTopics).where(eq(expertTopics.engagementId, engagementId)).orderBy(asc(expertTopics.sort), asc(expertTopics.name)),
    db.select().from(experts).where(eq(experts.engagementId, engagementId)).orderBy(asc(experts.createdAt)),
    db
      .select({
        id: expertTranscripts.id,
        expertId: expertTranscripts.expertId,
        kind: expertTranscripts.kind,
        filename: expertTranscripts.filename,
        discussedTopicIds: expertTranscripts.discussedTopicIds,
        cleanStatus: expertTranscripts.cleanStatus,
        createdAt: expertTranscripts.createdAt,
      })
      .from(expertTranscripts)
      .where(eq(expertTranscripts.engagementId, engagementId))
      .orderBy(asc(expertTranscripts.createdAt)),
    db.select().from(keyTakeaways).where(eq(keyTakeaways.engagementId, engagementId)).orderBy(asc(keyTakeaways.sort), asc(keyTakeaways.createdAt)),
    db.select().from(hypotheses).where(eq(hypotheses.engagementId, engagementId)).orderBy(asc(hypotheses.sort), asc(hypotheses.createdAt)),
    db.select().from(runningGuides).where(eq(runningGuides.engagementId, engagementId)),
    db.query.caseBudgets.findFirst({ where: eq(caseBudgets.engagementId, engagementId) }),
    db.select().from(caseExpenses).where(eq(caseExpenses.engagementId, engagementId)).orderBy(asc(caseExpenses.createdAt)),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));

  const expertRows: ExpertRow[] = rows.map((e) => ({
    id: e.id,
    typeId: e.typeId,
    status: e.status,
    firstName: e.firstName,
    lastName: e.lastName,
    name: [e.firstName, e.lastName].filter(Boolean).join(" "),
    company: e.company,
    title: e.title,
    anonTitle: e.anonTitle || anonymizeTitle(e.company, e.title, e.isFormer),
    anonOverride: e.anonTitle,
    isFormer: e.isFormer,
    interviewDate: e.interviewDate,
    network: e.network,
    callMinutes: e.callMinutes,
    followupMinutes: e.followupMinutes,
    surveyMinutes: e.surveyMinutes,
    hourlyRate: e.hourlyRate,
    minutes: totalMinutes(e),
    honorarium: honorarium(e),
    billed: isBilled(e),
    topicIds: parseIdList(e.topicIds),
    notes: e.notes,
    guide: e.guide,
    proposedByName: e.proposedBy ? (nameOf.get(e.proposedBy) ?? null) : null,
    requestedBy: e.requestedBy,
    requestedByName: e.requestedBy ? (nameOf.get(e.requestedBy) ?? null) : null,
    approvals: parseApprovals(e.approvals),
    transcriptCount: transcripts.filter((t) => t.expertId === e.id).length,
    takeawayCount: takeaways.filter((k) => k.expertId === e.id).length,
  }));

  return {
    types,
    topics,
    experts: expertRows,
    transcripts: transcripts.map((t) => ({ ...t, discussedTopicIds: parseIdList(t.discussedTopicIds) })),
    takeaways,
    hypotheses: hyps,
    guides,
    budget: budget ?? { engagementId, total: 0, plannedInterviews: 0 },
    expenses,
  };
}

export type ExpertsData = Awaited<ReturnType<typeof loadExperts>>;

/** An expert, only if it belongs to this engagement. */
export async function findExpert(db: DB, engagementId: string, expertId: string) {
  return db.query.experts.findFirst({ where: and(eq(experts.id, expertId), eq(experts.engagementId, engagementId)) });
}
