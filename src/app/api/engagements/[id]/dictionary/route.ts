import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { glossaryTerms } from "@/db/schema";
import { aiError, extractJson, notFoundJson, ok, parseOp, runAi } from "@/lib/case/api";
import { loadCorpus } from "@/lib/case/corpus";
import { topSnippets } from "@/lib/case/search";

const ref = z.string().min(1).max(64);
const term = z.string().trim().min(1, "Add a term.").max(120);
const category = z.string().trim().max(60);
const definition = z.string().trim().max(2000);

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), term, category: category.optional(), definition: definition.optional() }),
  z.object({ op: z.literal("update"), id: ref, term: term.optional(), category: category.optional(), definition: definition.optional() }),
  z.object({ op: z.literal("accept"), id: ref }),
  z.object({ op: z.literal("delete"), id: ref }),
  z.object({ op: z.literal("suggest") }),
]);

const Suggested = z.object({
  terms: z.array(z.object({ term: z.string().min(1).max(120), category: z.string().max(60).default("Industry"), definition: z.string().max(2000).default("") })).max(20),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await parseOp(req, id, "edit_findings", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const { db, user } = auth;
  const where = (rowId: string) => and(eq(glossaryTerms.id, rowId), eq(glossaryTerms.engagementId, id));

  switch (op.op) {
    case "add": {
      const [row] = await db.insert(glossaryTerms).values({ engagementId: id, term: op.term, category: op.category || "Industry", definition: op.definition ?? "" }).returning();
      return ok({ id: row!.id });
    }
    case "update": {
      const res = await db
        .update(glossaryTerms)
        .set({
          ...(op.term !== undefined && { term: op.term }),
          ...(op.category !== undefined && { category: op.category || "Industry" }),
          ...(op.definition !== undefined && { definition: op.definition }),
        })
        .where(where(op.id))
        .returning({ id: glossaryTerms.id });
      return res.length ? ok() : notFoundJson();
    }
    case "accept": {
      const res = await db.update(glossaryTerms).set({ status: "active" }).where(where(op.id)).returning({ id: glossaryTerms.id });
      return res.length ? ok() : notFoundJson();
    }
    case "delete":
      await db.delete(glossaryTerms).where(where(op.id));
      return ok();
    case "suggest": {
      const [existing, corpus] = await Promise.all([db.select({ term: glossaryTerms.term }).from(glossaryTerms).where(eq(glossaryTerms.engagementId, id)), loadCorpus(db, id, user)]);
      const material = topSnippets(
        corpus.filter((s) => s.kind === "transcript" || s.kind === "slide" || s.kind === "takeaway" || s.kind === "note"),
        "",
        40,
        30000,
      );
      if (material.length === 0) return NextResponse.json({ error: "Add transcripts or slides first." }, { status: 400 });
      const have = new Set(existing.map((e) => e.term.toLowerCase()));
      let parsed: z.infer<typeof Suggested>;
      try {
        const text = await runAi(auth, "dictionary_suggest", {
          system:
            "You build a case dictionary for a consulting team. From the case material, pick up to 12 industry terms, acronyms or company-specific words a new team member would need explained. " +
            'Skip the terms already listed. Reply with JSON only: {"terms":[{"term":"","category":"Industry|Acronym|Company|Product|Finance","definition":"one plain sentence"}]}.\n\n' +
            `Already listed: ${[...have].join(", ") || "none"}`,
          messages: [{ role: "user", content: material.map((s) => `(${s.label})\n${s.text}`).join("\n\n").slice(0, 30000) }],
          maxTokens: 1500,
        });
        parsed = Suggested.parse(extractJson(text));
      } catch (err) {
        return aiError(err);
      }
      const fresh = parsed.terms.filter((t) => !have.has(t.term.trim().toLowerCase()));
      if (fresh.length)
        await db.insert(glossaryTerms).values(fresh.map((t) => ({ engagementId: id, term: t.term.trim(), category: t.category || "Industry", definition: t.definition, status: "suggested" as const })));
      return ok({ added: fresh.length });
    }
  }
}
