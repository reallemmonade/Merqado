import { and, asc, desc, eq, or } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  caseNotes,
  chatMessages,
  chatRooms,
  deckIssues,
  deckLearnings,
  deckSlides,
  glossaryTerms,
  gptChats,
  workplanMilestones,
  workplanModules,
  workplanTasks,
  type Archetype,
} from "@/db/schema";
import { canSeeRoom } from "./rooms";

export async function loadWorkplan(db: DB, engagementId: string) {
  const [modules, milestones, tasks] = await Promise.all([
    db.select().from(workplanModules).where(eq(workplanModules.engagementId, engagementId)).orderBy(asc(workplanModules.sort), asc(workplanModules.createdAt)),
    db.select().from(workplanMilestones).where(eq(workplanMilestones.engagementId, engagementId)).orderBy(asc(workplanMilestones.date)),
    db.select().from(workplanTasks).where(eq(workplanTasks.engagementId, engagementId)).orderBy(asc(workplanTasks.sort), asc(workplanTasks.createdAt)),
  ]);
  return { modules, milestones, tasks };
}
export type Workplan = Awaited<ReturnType<typeof loadWorkplan>>;

/** The chats this person's role can see. */
export async function visibleRooms(db: DB, engagementId: string, archetype: Archetype) {
  const rooms = await db.select().from(chatRooms).where(eq(chatRooms.engagementId, engagementId)).orderBy(asc(chatRooms.sort), asc(chatRooms.createdAt));
  return rooms.filter((r) => canSeeRoom(r.archetypes, archetype));
}

export async function loadRoomMessages(db: DB, roomId: string) {
  return db.select().from(chatMessages).where(eq(chatMessages.roomId, roomId)).orderBy(asc(chatMessages.createdAt)).limit(500);
}

/** Notes the person can see: everything shared plus their own private ones. */
export async function loadNotes(db: DB, engagementId: string, userId: string) {
  return db
    .select()
    .from(caseNotes)
    .where(and(eq(caseNotes.engagementId, engagementId), or(eq(caseNotes.isPrivate, false), eq(caseNotes.createdBy, userId))))
    .orderBy(desc(caseNotes.createdAt));
}

export async function loadGlossary(db: DB, engagementId: string) {
  return db.select().from(glossaryTerms).where(eq(glossaryTerms.engagementId, engagementId)).orderBy(asc(glossaryTerms.term));
}

export async function loadDeck(db: DB, engagementId: string) {
  const [slides, learnings, issues] = await Promise.all([
    db.select().from(deckSlides).where(eq(deckSlides.engagementId, engagementId)).orderBy(asc(deckSlides.sort), asc(deckSlides.createdAt)),
    db.select().from(deckLearnings).where(eq(deckLearnings.engagementId, engagementId)).orderBy(asc(deckLearnings.createdAt)),
    db.select().from(deckIssues).where(eq(deckIssues.engagementId, engagementId)).orderBy(asc(deckIssues.createdAt)),
  ]);
  return { slides, learnings, issues };
}
export type Deck = Awaited<ReturnType<typeof loadDeck>>;

/** My chats, and chats others shared with the team. */
export async function loadGptChats(db: DB, engagementId: string, userId: string) {
  return db
    .select()
    .from(gptChats)
    .where(and(eq(gptChats.engagementId, engagementId), or(eq(gptChats.userId, userId), eq(gptChats.shared, true))))
    .orderBy(desc(gptChats.updatedAt));
}

