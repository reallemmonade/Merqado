import { CaseShell } from "@/components/case/CaseShell";
import { WorkplanGrid } from "@/components/case/WorkplanGrid";
import { loadWorkplan } from "@/lib/case/data";
import { loadCase } from "@/lib/case/page";

export const dynamic = "force-dynamic";

export default async function WorkplanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadCase(id, "/workplan");
  const wp = await loadWorkplan(ctx.db, id);
  return (
    <CaseShell ctx={ctx} section="workplan" title="Workplan">
      <WorkplanGrid engagementId={id} wp={wp} members={ctx.members} canEdit={ctx.canEdit} />
    </CaseShell>
  );
}
