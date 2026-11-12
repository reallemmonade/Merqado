import { NextResponse } from "next/server";
import { and, asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { caseNotes, deckIssues, deckLearnings, deckSlides, hypotheses, keyTakeaways, workplanModules } from "@/db/schema";
import { aiError, extractJson, notFoundJson, ok, parseOp, runAi } from "@/lib/case/api";
import type { Authorized } from "@/lib/experts/api";

const ref = z.string().min(1).max(64);
const text = (n: number) => z.string().trim().max(n);
const SEVERITY = ["high", "medium", "low"] as const;

const SlideFields = {
  section: text(120).optional(),
  headline: text(400).min(1, "Add a headline.").optional(),
  body: text(4000).optional(),
  sourceNote: text(400).optional(),
  moduleId: ref.nullable().optional(),
  status: z.enum(["draft", "final"]).optional(),
};

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("slide.add"), ...SlideFields, headline: text(400).min(1, "Add a headline.") }),
  z.object({ op: z.literal("slide.update"), id: ref, ...SlideFields }),
  z.object({ op: z.literal("slide.delete"), id: ref }),
  z.object({ op: z.literal("slide.move"), id: ref, dir: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ op: z.literal("generate"), brief: text(4000), replace: z.boolean().optional() }),
  z.object({ op: z.literal("redo"), id: ref, instruction: text(1000) }),
  z.object({ op: z.literal("learning.add"), rule: text(500).min(1, "Write the rule.") }),
  z.object({ op: z.literal("learning.delete"), id: ref }),
  z.object({ op: z.literal("qc.run") }),
  z.object({ op: z.literal("contradictions.scan") }),
  z.object({ op: z.literal("issue.update"), id: ref, status: z.enum(["open", "resolved", "dismissed"]) }),
]);

const GenSlide = z.object({
  section: z.string().max(120).default(""),
  headline: z.string().min(1).max(400),
  points: z.array(z.string().max(600)).max(8).default([]),
  source: z.string().max(400).default(""),
  module: z.string().max(200).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await parseOp(req, id, "edit_findings", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const { db } = auth;
  const slideWhere = (sid: string) => and(eq(deckSlides.id, sid), eq(deckSlides.engagementId, id));

  async function moduleOk(moduleId: string | null | undefined) {
    if (!moduleId) return true;
    return !!(await db.query.workplanModules.findFirst({ where: and(eq(workplanModules.id, moduleId), eq(workplanModules.engagementId, id)) }));
  }

  try {
    switch (op.op) {
      case "slide.add": {
        if (!(await moduleOk(op.moduleId))) return notFoundJson();
        const [m] = await db.select({ n: max(deckSlides.sort) }).from(deckSlides).where(eq(deckSlides.engagementId, id));
        const { op: _op, ...fields } = op;
        const [row] = await db.insert(deckSlides).values({ engagementId: id, ...fields, sort: (m?.n ?? 0) + 1 }).returning();
        return ok({ id: row!.id });
      }
      case "slide.update": {
        if (!(await moduleOk(op.moduleId))) return notFoundJson();
        const { op: _op, id: sid, ...fields } = op;
        const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
        if (Object.keys(set).length === 0) return ok();
        const res = await db.update(deckSlides).set(set).where(slideWhere(sid)).returning({ id: deckSlides.id });
        return res.length ? ok() : notFoundJson();
      }
      case "slide.delete":
        await db.delete(deckSlides).where(slideWhere(op.id));
        return ok();
      case "slide.move": {
        const slides = await db.select({ id: deckSlides.id }).from(deckSlides).where(eq(deckSlides.engagementId, id)).orderBy(asc(deckSlides.sort), asc(deckSlides.createdAt));
        const i = slides.findIndex((s) => s.id === op.id);
        const j = i + op.dir;
        if (i < 0) return notFoundJson();
        if (j < 0 || j >= slides.length) return ok();
        [slides[i], slides[j]] = [slides[j]!, slides[i]!];
        await Promise.all(slides.map((s, n) => db.update(deckSlides).set({ sort: n + 1 }).where(eq(deckSlides.id, s.id))));
        return ok();
      }
      case "generate":
        return await generate(auth, op.brief, op.replace ?? false);
      case "redo":
        return await redo(auth, op.id, op.instruction);
      case "learning.add": {
        const [row] = await db.insert(deckLearnings).values({ engagementId: id, rule: op.rule, origin: auth.user.name }).returning();
        return ok({ id: row!.id });
      }
      case "learning.delete":
        await db.delete(deckLearnings).where(and(eq(deckLearnings.id, op.id), eq(deckLearnings.engagementId, id)));
        return ok();
      case "qc.run":
        return await qualityCheck(auth);
      case "contradictions.scan":
        return await scanContradictions(auth);
      case "issue.update": {
        const res = await db
          .update(deckIssues)
          .set({ status: op.status })
          .where(and(eq(deckIssues.id, op.id), eq(deckIssues.engagementId, id)))
          .returning({ id: deckIssues.id });
        return res.length ? ok() : notFoundJson();
      }
    }
  } catch (err) {
    return aiError(err);
  }
}

/** What the deck is built from: hypotheses, the takeaways the team kept, learnings, modules. */
async function caseMaterial(auth: Authorized) {
  const { db, engagement } = auth;
  const id = engagement.id;
  const [hyps, ktas, learnings, modules, slides, notes] = await Promise.all([
    db.select().from(hypotheses).where(eq(hypotheses.engagementId, id)).orderBy(asc(hypotheses.sort)),
    db.select().from(keyTakeaways).where(and(eq(keyTakeaways.engagementId, id), eq(keyTakeaways.included, true))),
    db.select().from(deckLearnings).where(eq(deckLearnings.engagementId, id)),
    db.select().from(workplanModules).where(eq(workplanModules.engagementId, id)).orderBy(asc(workplanModules.sort)),
    db.select().from(deckSlides).where(eq(deckSlides.engagementId, id)).orderBy(asc(deckSlides.sort), asc(deckSlides.createdAt)),
    db.select().from(caseNotes).where(and(eq(caseNotes.engagementId, id), eq(caseNotes.isPrivate, false))),
  ]);
  return { hyps, ktas, learnings, modules, slides, notes };
}

const DECK_RULES = [
  "Headlines are full-sentence so-whats, not topics.",
  "Experts are never named; refer to them by role.",
  "Every number has a source line.",
];

function slideText(s: { headline: string; body: string; sourceNote: string; section: string }, n: number) {
  return `S${n} [${s.section}] ${s.headline}\n${s.body
    .split("\n")
    .filter(Boolean)
    .map((p) => `  - ${p}`)
    .join("\n")}${s.sourceNote ? `\n  Source: ${s.sourceNote}` : ""}`;
}

async function generate(auth: Authorized, brief: string, replace: boolean) {
  const { db, engagement } = auth;
  const m = await caseMaterial(auth);
  const textOut = await runAi(auth, "deck_generate", {
    system: [
      `You draft the storyline for a consulting deck for the case ${engagement.clientName} (${engagement.title}).`,
      "Build it from the hypotheses and the expert takeaways the team kept. Group slides into sections that follow the workplan modules.",
      "Rules:",
      ...[...DECK_RULES, ...m.learnings.map((l) => l.rule)].map((r) => `- ${r}`),
      'Reply with JSON only: {"slides":[{"section":"","headline":"","points":["",""],"source":"","module":"<module name or empty>"}]}. 6 to 14 slides.',
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          `Brief: ${brief || "Full storyline for the next client update."}`,
          `Modules: ${m.modules.map((x) => x.name).join("; ") || "none"}`,
          "Hypotheses:",
          ...m.hyps.map((h) => `- ${h.statement}`),
          "Takeaways:",
          ...m.ktas.map((k) => `- (${k.verdict}) ${k.body}`),
          ...(replace ? [] : ["Existing slides (keep them, add what is missing):", ...m.slides.map((s, i) => slideText(s, i + 1))]),
        ].join("\n"),
      },
    ],
    maxTokens: 4000,
  });
  const parsed = z.object({ slides: z.array(GenSlide).max(20) }).parse(extractJson(textOut));
  if (replace) await db.delete(deckSlides).where(and(eq(deckSlides.engagementId, engagement.id), eq(deckSlides.status, "draft")));
  const kept = replace ? m.slides.filter((s) => s.status === "final").length : m.slides.length;
  const moduleId = (name?: string) => m.modules.find((x) => name && x.name.toLowerCase() === name.toLowerCase())?.id ?? null;
  if (parsed.slides.length)
    await db.insert(deckSlides).values(
      parsed.slides.map((s, i) => ({
        engagementId: engagement.id,
        section: s.section,
        headline: s.headline,
        body: s.points.join("\n"),
        sourceNote: s.source,
        moduleId: moduleId(s.module),
        sort: kept + i + 1,
      })),
    );
  return ok({ added: parsed.slides.length });
}

async function redo(auth: Authorized, slideId: string, instruction: string) {
  const { db, engagement } = auth;
  const slide = await db.query.deckSlides.findFirst({ where: and(eq(deckSlides.id, slideId), eq(deckSlides.engagementId, engagement.id)) });
  if (!slide) return notFoundJson();
  const m = await caseMaterial(auth);
  const textOut = await runAi(auth, "deck_redo", {
    system: [
      "You rewrite one slide of a consulting deck.",
      "Rules:",
      ...[...DECK_RULES, ...m.learnings.map((l) => l.rule)].map((r) => `- ${r}`),
      'Reply with JSON only: {"section":"","headline":"","points":[""],"source":""}.',
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          `Slide:\n${slideText(slide, 1)}`,
          `Change: ${instruction || "Make the headline a sharper so-what and tighten the points."}`,
          "Takeaways you can use:",
          ...m.ktas.map((k) => `- (${k.verdict}) ${k.body}`),
        ].join("\n"),
      },
    ],
    maxTokens: 1500,
  });
  const s = GenSlide.parse(extractJson(textOut));
  await db
    .update(deckSlides)
    .set({ section: s.section || slide.section, headline: s.headline, body: s.points.join("\n"), sourceNote: s.source || slide.sourceNote })
    .where(eq(deckSlides.id, slide.id));
  return ok();
}

async function qualityCheck(auth: Authorized) {
  const { db, engagement } = auth;
  const m = await caseMaterial(auth);
  if (m.slides.length === 0) return NextResponse.json({ error: "Add slides first." }, { status: 400 });
  const textOut = await runAi(auth, "deck_qc", {
    system: [
      "You are the quality check for a consulting deck. Check every slide against these rules and flag each break.",
      ...[...DECK_RULES, ...m.learnings.map((l) => l.rule)].map((r) => `- ${r}`),
      "Also flag typos, numbers that do not add up, and vague headlines.",
      'Reply with JSON only: {"issues":[{"slide":"S3","severity":"high|medium|low","detail":"what is wrong, one sentence","fix":"the fix, one sentence"}]}. Return an empty list if the deck is clean.',
    ].join("\n"),
    messages: [{ role: "user", content: m.slides.map((s, i) => slideText(s, i + 1)).join("\n\n") }],
    maxTokens: 3000,
  });
  const parsed = z
    .object({ issues: z.array(z.object({ slide: z.string(), severity: z.enum(SEVERITY).catch("medium"), detail: z.string().max(1000), fix: z.string().max(1000).default("") })).max(40) })
    .parse(extractJson(textOut));
  const slideOf = (ref: string) => m.slides[Number(ref.replace(/\D/g, "")) - 1];
  await db.delete(deckIssues).where(and(eq(deckIssues.engagementId, engagement.id), eq(deckIssues.kind, "qc"), eq(deckIssues.status, "open")));
  const rows = parsed.issues
    .map((x) => ({ x, s: slideOf(x.slide) }))
    .filter(({ s }) => !!s)
    .map(({ x, s }) => ({ engagementId: engagement.id, kind: "qc" as const, severity: x.severity, slideId: s!.id, claim: s!.headline, detail: x.detail, fix: x.fix }));
  if (rows.length) await db.insert(deckIssues).values(rows);
  return ok({ found: rows.length });
}

/**
 * Reads the whole deck next to the takeaways, decisions and notes, and records every pair of
 * claims that cannot both be true. Pairs the team already dismissed are not raised again.
 */
async function scanContradictions(auth: Authorized) {
  const { db, engagement } = auth;
  const m = await caseMaterial(auth);
  if (m.slides.length === 0) return NextResponse.json({ error: "Add slides first." }, { status: 400 });
  const others = [
    ...m.ktas.map((k, i) => ({ ref: `K${i + 1}`, label: "Takeaway", text: k.body })),
    ...m.notes.filter((n) => n.kind !== "open").map((n, i) => ({ ref: `N${i + 1}`, label: n.kind === "decision" ? "Decision" : "Note", text: n.body })),
    ...m.hyps.map((h, i) => ({ ref: `H${i + 1}`, label: "Hypothesis", text: h.statement })),
  ];
  const textOut = await runAi(auth, "deck_contradictions", {
    system: [
      "You check a consulting deck for contradictions: two statements that cannot both be true, or numbers that disagree.",
      "Compare every slide with every other slide, and each slide with the takeaways, decisions and notes listed after it.",
      "Only flag real conflicts, not differences in emphasis. A hypothesis contradicted by evidence is worth flagging only if a slide states it as fact.",
      'Reply with JSON only: {"contradictions":[{"slide":"S2","claim":"the exact words on that slide","other":"S5 or K3 or N1 or H2","otherClaim":"the exact conflicting words","severity":"high|medium|low","detail":"why they conflict and which looks right, one or two sentences"}]}.',
      "High: the storyline's answer changes. Medium: a number or fact a client would notice. Low: wording.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: ["Deck:", ...m.slides.map((s, i) => slideText(s, i + 1)), "", "Other case material:", ...others.map((o) => `${o.ref} (${o.label}) ${o.text}`)].join("\n"),
      },
    ],
    maxTokens: 3000,
  });
  const parsed = z
    .object({
      contradictions: z
        .array(
          z.object({
            slide: z.string(),
            claim: z.string().max(1000),
            other: z.string().max(20),
            otherClaim: z.string().max(1000),
            severity: z.enum(SEVERITY).catch("medium"),
            detail: z.string().max(1500).default(""),
          }),
        )
        .max(40),
    })
    .parse(extractJson(textOut));

  const slideAt = (ref: string) => (/^S\d+$/i.test(ref.trim()) ? m.slides[Number(ref.replace(/\D/g, "")) - 1] : undefined);
  const otherRef = (ref: string) => {
    const r = ref.trim().toUpperCase();
    const s = slideAt(r);
    if (s) return `Slide ${m.slides.indexOf(s) + 1}`;
    const o = others.find((x) => x.ref === r);
    return o ? o.label : ref;
  };

  const prior = await db.select().from(deckIssues).where(and(eq(deckIssues.engagementId, engagement.id), eq(deckIssues.kind, "contradiction")));
  const key = (a: string, b: string) => [a, b].map((x) => x.toLowerCase().replace(/\W+/g, " ").trim()).sort().join("|");
  const settled = new Set(prior.filter((p) => p.status !== "open").map((p) => key(p.claim, p.otherClaim)));
  await db.delete(deckIssues).where(and(eq(deckIssues.engagementId, engagement.id), eq(deckIssues.kind, "contradiction"), eq(deckIssues.status, "open")));

  const rows = parsed.contradictions
    .map((c) => ({ c, s: slideAt(c.slide) }))
    .filter(({ c, s }) => !!s && !settled.has(key(c.claim, c.otherClaim)))
    .map(({ c, s }) => ({
      engagementId: engagement.id,
      kind: "contradiction" as const,
      severity: c.severity,
      slideId: s!.id,
      claim: c.claim,
      otherRef: otherRef(c.other),
      otherClaim: c.otherClaim,
      detail: c.detail,
    }));
  if (rows.length) await db.insert(deckIssues).values(rows);
  return ok({ found: rows.length });
}
