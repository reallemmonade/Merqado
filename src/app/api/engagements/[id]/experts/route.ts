import { NextResponse } from "next/server";
import { experts } from "@/db/schema";
import { loadMembers } from "@/lib/case/page";
import { authorize, badRequest } from "@/lib/experts/api";
import { isApproved, signoffFor } from "@/lib/experts/approval";
import { guessRequester } from "@/lib/experts/requester";
import { expertCreate } from "@/lib/experts/schemas";

/** Propose (or directly add) an expert to the pipeline. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, "edit_experts");
  if (auth instanceof NextResponse) return auth;
  const parsed = expertCreate.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Add at least a first name.");
  const { topicIds, status, requestedBy: asked, ...rest } = parsed.data;
  const members = await loadMembers(id, auth.engagement.firmId);
  // Left out means "work it out": whoever asked the proposer for an expert.
  const requestedBy = asked === undefined ? await guessRequester(auth.db, id, auth.user.id) : asked;
  if (requestedBy && !members.some((m) => m.id === requestedBy)) return badRequest("Pick someone on this case.");

  // Adding straight past "proposed" counts as the adder's sign-off, and only sticks if no one else is needed.
  const state = { requestedBy, approvals: [] as string[] };
  let finalStatus = status ?? "proposed";
  if (finalStatus !== "proposed" && finalStatus !== "declined") {
    if (signoffFor(state, auth.user.id, members)) state.approvals.push(auth.user.id);
    if (!isApproved(state, members)) finalStatus = "proposed";
  }
  const [row] = await auth.db
    .insert(experts)
    .values({
      ...rest,
      engagementId: id,
      status: finalStatus,
      topicIds: JSON.stringify(topicIds ?? []),
      proposedBy: auth.user.id,
      requestedBy,
      approvals: JSON.stringify(state.approvals),
      approvedBy: finalStatus !== "proposed" && finalStatus !== "declined" ? auth.user.id : null,
    })
    .returning({ id: experts.id });
  return NextResponse.json({ id: row!.id, status: finalStatus });
}
