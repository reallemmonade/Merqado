import { NextResponse } from "next/server";
import { z } from "zod";
import { aiError, ok, parseOp, runAi } from "@/lib/case/api";
import { sourceVisibility } from "@/lib/files/access";
import { allows } from "@/lib/roles";
import { docTexts, saveFirmStandard, saveOnboarding } from "@/lib/onboarding/data";
import { FILL_SYSTEM, fillPrompt, parseFill } from "@/lib/onboarding/fill";
import { onboardingSchema, standardSchema } from "@/lib/onboarding/model";

const Op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("save"), caseCode: z.string().trim().max(40), data: onboardingSchema }),
  z.object({ op: z.literal("fill"), sourceIds: z.array(z.string().min(1).max(64)).min(1).max(30) }),
  z.object({ op: z.literal("standard"), standard: standardSchema }),
]);

/** Case onboarding: save the form, fill it from dropped documents, or save the firm's standard text. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await parseOp(req, id, "edit_experts", Op);
  if (r instanceof NextResponse) return r;
  const { auth, op } = r;
  const { db, user, engagement, membership } = auth;

  switch (op.op) {
    case "save":
      await saveOnboarding(db, id, user.id, op.caseCode, op.data);
      return ok();
    case "fill": {
      const canSee = await sourceVisibility(db, id, user);
      const docs = (await docTexts(db, id, op.sourceIds)).filter(canSee).map((d) => ({ filename: d.filename, text: d.text ?? "" }));
      const prompt = fillPrompt(docs);
      if (!prompt) return ok({ fill: {}, read: 0 });
      try {
        const reply = await runAi(auth, "onboarding_fill", {
          system: FILL_SYSTEM,
          messages: [{ role: "user", content: prompt }],
          maxTokens: 2500,
        });
        return ok({ fill: parseFill(reply, [engagement.clientName]), read: docs.filter((d) => d.text.trim()).length });
      } catch (err) {
        return aiError(err);
      }
    }
    case "standard":
      // The same text goes on every case in the firm, so only managers and partners change it.
      if (!allows(membership, "edit_plan") || (user.archetype !== "manager" && user.archetype !== "partner")) {
        return NextResponse.json({ error: "Only managers and partners can change the standard text." }, { status: 403 });
      }
      await saveFirmStandard(db, user.firmId, op.standard);
      return ok();
  }
}
