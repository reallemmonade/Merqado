import { NextResponse } from "next/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { caseFolders, sources } from "@/db/schema";
import { notFoundJson, ok, parseOp } from "@/lib/case/api";
import { sourceVisibility } from "@/lib/files/access";
import { addCaseFolders, cleanPath, insideFolder } from "@/lib/files/folders";
import { caseFolderName, fileSources } from "@/lib/files/intake";
import { deleteSourceBytes, placeSourceFile, sourceMeta } from "@/lib/storage/files";

const ref = z.string().min(1).max(64);
const folder = z.string().trim().max(250);

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("file"), items: z.array(z.object({ sourceId: ref, folder: folder.min(1, "Pick a folder."), asVersion: z.boolean().optional() })).min(1).max(500) }),
  z.object({ op: z.literal("move"), sourceId: ref, folder }),
  z.object({ op: z.literal("discard"), sourceIds: z.array(ref).min(1).max(500) }),
  z.object({ op: z.literal("folder.add"), path: folder.min(1, "Name the folder.") }),
  z.object({ op: z.literal("folder.delete"), path: folder.min(1) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await parseOp(req, id, "upload", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const { db, user, engagement } = auth;
  // Files shared in a chat stay private to that chat's members, here too.
  const canSee = await sourceVisibility(db, id, user);

  switch (op.op) {
    case "file": {
      const ids = op.items.map((i) => i.sourceId);
      const seen = await db.select({ id: sources.id, roomId: sources.roomId }).from(sources).where(and(eq(sources.engagementId, id), inArray(sources.id, ids)));
      const allowed = new Set(seen.filter(canSee).map((s) => s.id));
      try {
        return ok({ filed: await fileSources(auth, op.items.filter((i) => allowed.has(i.sourceId))) });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Filing failed." }, { status: 502 });
      }
    }
    case "move": {
      const src = await db.query.sources.findFirst({ where: and(eq(sources.id, op.sourceId), eq(sources.engagementId, id)) });
      if (!src || !canSee(src)) return notFoundJson();
      const path = cleanPath(op.folder);
      await addCaseFolders(db, id, [path]);
      let objectKey = src.objectKey;
      if (src.filing === "filed") {
        try {
          objectKey = await placeSourceFile(db, user.firmId, src, [caseFolderName(engagement), ...path.split("/").filter(Boolean)]);
        } catch (err) {
          console.error("move in storage failed", err);
          return NextResponse.json({ error: "Couldn't move the file in the firm's storage." }, { status: 502 });
        }
      }
      await db.update(sources).set({ folder: path, objectKey }).where(eq(sources.id, src.id));
      return ok();
    }
    case "discard": {
      const rows = await db
        .select(sourceMeta)
        .from(sources)
        .where(and(eq(sources.engagementId, id), eq(sources.filing, "pending"), inArray(sources.id, op.sourceIds)));
      for (const s of rows.filter(canSee)) {
        await deleteSourceBytes(db, user.firmId, s).catch((err) => console.warn("discard: storage delete failed", s.id, err));
        await db.delete(sources).where(eq(sources.id, s.id));
      }
      return ok({ discarded: rows.filter(canSee).length });
    }
    case "folder.add": {
      const path = cleanPath(op.path);
      if (!path) return NextResponse.json({ error: "Name the folder." }, { status: 400 });
      await addCaseFolders(db, id, [path]);
      return ok({ path });
    }
    case "folder.delete": {
      const path = cleanPath(op.path);
      const inUse = await db.query.sources.findFirst({
        where: and(eq(sources.engagementId, id), or(eq(sources.folder, path), sql`${sources.folder} like ${insideFolder(path)} escape '\\'`)),
      });
      if (inUse) return NextResponse.json({ error: "Move its files out first." }, { status: 400 });
      await db.delete(caseFolders).where(and(eq(caseFolders.engagementId, id), or(eq(caseFolders.path, path), sql`${caseFolders.path} like ${insideFolder(path)} escape '\\'`)));
      return ok();
    }
  }
}
