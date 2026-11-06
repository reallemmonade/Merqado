import { NextResponse } from "next/server";
import { experts } from "@/db/schema";
import { authorize, badRequest } from "@/lib/experts/api";
import { expertCreate } from "@/lib/experts/schemas";

/** Propose (or directly add) an expert to the pipeline. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id, "edit_experts");
  if (auth instanceof NextResponse) return auth;
  const parsed = expertCreate.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Add at least a first name.");
  const { topicIds, status, ...rest } = parsed.data;
  // Anything past "proposed" needs approval rights; everyone else proposes.
  const [row] = await auth.db
    .insert(experts)
    .values({
      ...rest,
      engagementId: id,
      status: status ?? "proposed",
      topicIds: JSON.stringify(topicIds ?? []),
      proposedBy: auth.user.id,
      approvedBy: status && status !== "proposed" ? auth.user.id : null,
    })
    .returning({ id: experts.id });
  return NextResponse.json({ id: row!.id });
}
