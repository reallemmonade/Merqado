import { and, asc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db/client";
import type { Archetype } from "@/db/schema";
import { deckSlides, experts, expertTranscripts, glossaryTerms, hypotheses, keyTakeaways, sources, workplanTasks, chatMessages } from "@/db/schema";
import { anonymizeTitle } from "@/lib/experts/calc";
import { loadNotes, visibleRooms } from "./data";
import type { Snippet } from "./search";

/**
 * Everything in a case that this person may read, as plain-text documents: transcripts,
 * takeaways, notes, chats in rooms they can see, slides, dictionary, hypotheses, tasks, file names.
 */
export async function loadCorpus(db: DB, engagementId: string, viewer: { id: string; archetype: Archetype }): Promise<Snippet[]> {
  const base = `/e/${engagementId}`;
  const rooms = await visibleRooms(db, engagementId, viewer.archetype);
  const roomIds = rooms.map((r) => r.id);
  const [people, transcripts, takeaways, notes, messages, slides, terms, hyps, tasks, files] = await Promise.all([
    db.select({ id: experts.id, company: experts.company, title: experts.title, anonTitle: experts.anonTitle, isFormer: experts.isFormer }).from(experts).where(eq(experts.engagementId, engagementId)),
    db
      .select({ id: expertTranscripts.id, expertId: expertTranscripts.expertId, kind: expertTranscripts.kind, body: expertTranscripts.body, cleanedBody: expertTranscripts.cleanedBody })
      .from(expertTranscripts)
      .where(eq(expertTranscripts.engagementId, engagementId)),
    db.select().from(keyTakeaways).where(eq(keyTakeaways.engagementId, engagementId)),
    loadNotes(db, engagementId, viewer.id),
    roomIds.length ? db.select().from(chatMessages).where(and(eq(chatMessages.engagementId, engagementId), inArray(chatMessages.roomId, roomIds))).orderBy(asc(chatMessages.createdAt)) : Promise.resolve([]),
    db.select().from(deckSlides).where(eq(deckSlides.engagementId, engagementId)).orderBy(asc(deckSlides.sort)),
    db.select().from(glossaryTerms).where(and(eq(glossaryTerms.engagementId, engagementId), eq(glossaryTerms.status, "active"))),
    db.select().from(hypotheses).where(eq(hypotheses.engagementId, engagementId)),
    db.select().from(workplanTasks).where(eq(workplanTasks.engagementId, engagementId)),
    db.select({ id: sources.id, filename: sources.filename, folder: sources.folder }).from(sources).where(eq(sources.engagementId, engagementId)),
  ]);
  const who = new Map(people.map((p) => [p.id, p.anonTitle || anonymizeTitle(p.company, p.title, p.isFormer)]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  const out: Snippet[] = [];
  for (const t of transcripts)
    out.push({ kind: "transcript", label: `${who.get(t.expertId) ?? "Expert"}${t.kind === "followup" ? " · follow-up" : ""}`, href: `${base}/experts/transcripts?t=${t.id}`, text: t.cleanedBody ?? t.body });
  for (const k of takeaways) out.push({ kind: "takeaway", label: `KTA · ${who.get(k.expertId) ?? "Expert"}`, href: `${base}/experts/ktas`, text: k.body });
  for (const n of notes) out.push({ kind: "note", label: `Note${n.origin ? " · " + n.origin : ""}`, href: n.link ?? `${base}/notes`, text: n.body });
  for (const m of messages) out.push({ kind: "chat", label: `# ${roomName.get(m.roomId) ?? "Chat"}`, href: `${base}/channel?room=${m.roomId}#m-${m.id}`, text: m.body });
  slides.forEach((s, i) =>
    out.push({ kind: "slide", label: `Slide ${i + 1}`, href: `${base}/deck?slide=${s.id}`, text: [s.headline, s.body, s.sourceNote].filter(Boolean).join("\n") }),
  );
  for (const g of terms) out.push({ kind: "term", label: `Dictionary · ${g.term}`, href: `${base}/dictionary`, text: `${g.term}: ${g.definition}` });
  for (const h of hyps) out.push({ kind: "hypothesis", label: "Hypothesis", href: `${base}/experts/ktas`, text: h.statement });
  for (const t of tasks) out.push({ kind: "task", label: "Workplan", href: `${base}/workplan`, text: t.title });
  for (const f of files) out.push({ kind: "file", label: `File${f.folder ? " · " + f.folder : ""}`, href: `/api/engagements/${engagementId}/sources/${f.id}`, text: f.filename });
  return out;
}
