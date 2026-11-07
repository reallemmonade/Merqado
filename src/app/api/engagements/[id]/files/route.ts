import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { sources } from "@/db/schema";
import { notFoundJson, ok, parseOp } from "@/lib/case/api";

const Op = z.object({ op: z.literal("move"), sourceId: z.string().min(1).max(64), folder: z.string().trim().max(60) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await parseOp(req, id, "upload", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const res = await auth.db
    .update(sources)
    .set({ folder: op.folder })
    .where(and(eq(sources.id, op.sourceId), eq(sources.engagementId, id)))
    .returning({ id: sources.id });
  return res.length ? ok() : notFoundJson();
}
