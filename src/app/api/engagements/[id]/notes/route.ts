import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { caseNotes, NOTE_KINDS, workplanModules } from "@/db/schema";
import { notFoundJson, ok, parseOp } from "@/lib/case/api";
import { allows } from "@/lib/roles";
import { getEngagementAccess } from "@/lib/session";

const ref = z.string().min(1).max(64);
const body = z.string().trim().min(1, "Write a note.").max(8000);

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), kind: z.enum(NOTE_KINDS), body, moduleId: ref.nullable().optional(), isPrivate: z.boolean().optional() }),
  z.object({ op: z.literal("update"), id: ref, body: body.optional(), kind: z.enum(NOTE_KINDS).optional(), moduleId: ref.nullable().optional(), resolved: z.boolean().optional() }),
  z.object({ op: z.literal("delete"), id: ref }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await parseOp(req, id, "read", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const { db, user } = auth;

  async function moduleOk(moduleId: string | null | undefined) {
    if (!moduleId) return true;
    return !!(await db.query.workplanModules.findFirst({ where: and(eq(workplanModules.id, moduleId), eq(workplanModules.engagementId, id)) }));
  }

  if (op.op === "add") {
    if (!(await moduleOk(op.moduleId))) return notFoundJson();
    const [row] = await db
      .insert(caseNotes)
      .values({ engagementId: id, kind: op.kind, body: op.body, moduleId: op.moduleId ?? null, isPrivate: op.isPrivate ?? false, origin: "Notes", createdBy: user.id })
      .returning();
    return ok({ id: row!.id });
  }

  const note = await db.query.caseNotes.findFirst({ where: and(eq(caseNotes.id, op.id), eq(caseNotes.engagementId, id)) });
  if (!note || (note.isPrivate && note.createdBy !== user.id)) return notFoundJson();
  if (note.createdBy !== user.id) {
    const access = await getEngagementAccess(db, user, id);
    if (!allows(access, "edit_findings")) return NextResponse.json({ error: "You can only change your own notes." }, { status: 403 });
  }

  if (op.op === "delete") {
    await db.delete(caseNotes).where(eq(caseNotes.id, op.id));
    return ok();
  }
  if (!(await moduleOk(op.moduleId))) return notFoundJson();
  await db
    .update(caseNotes)
    .set({
      ...(op.body !== undefined && { body: op.body }),
      ...(op.kind !== undefined && { kind: op.kind }),
      ...(op.moduleId !== undefined && { moduleId: op.moduleId }),
      ...(op.resolved !== undefined && { resolved: op.resolved }),
    })
    .where(eq(caseNotes.id, op.id));
  return ok();
}
