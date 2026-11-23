import { NextResponse } from "next/server";
import type { z } from "zod";
import { authorize, type Authorized } from "@/lib/experts/api";
import type { Action } from "@/lib/roles";
import { completeAndMeter, resolveProvider, type CompletionRequest, type CompletionResult } from "@/lib/ai";

export { aiError, badRequest, extractJson } from "@/lib/experts/api";

/** Authorizes the caller and parses a JSON body against a schema of operations. */
export async function parseOp<T extends z.ZodTypeAny>(
  req: Request,
  engagementId: string,
  action: Action,
  schema: T,
): Promise<{ auth: Authorized; op: z.infer<T> } | NextResponse> {
  const auth = await authorize(engagementId, action);
  if (auth instanceof NextResponse) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form and try again." }, { status: 400 });
  return { auth, op: parsed.data };
}

export const ok = (data: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...data });
export const notFoundJson = () => NextResponse.json({ error: "Not found." }, { status: 404 });

/** One model call for a case feature, metered to the case. */
export async function runAi(auth: Authorized, feature: string, req: CompletionRequest & { system: string }): Promise<string> {
  return (await runAiResult(auth, feature, req)).text;
}

/** Like runAi, but returns the whole result (e.g. the web pages an answer cites). */
export async function runAiResult(auth: Authorized, feature: string, req: CompletionRequest & { system: string }): Promise<CompletionResult> {
  const { db, user, engagement } = auth;
  const resolved = await resolveProvider(db, user.firmId, engagement.aiProviderId);
  const result = await completeAndMeter(db, resolved, req, { firmId: user.firmId, engagementId: engagement.id, userId: user.id, feature });
  if (result.refused) throw new Error("The model declined this request.");
  return result;
}
