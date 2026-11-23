import { CaseShell } from "@/components/case/CaseShell";
import { Onboarding } from "@/components/case/Onboarding";
import { loadCase } from "@/lib/case/page";
import { allows } from "@/lib/roles";
import { loadOnboarding } from "@/lib/onboarding/data";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadCase(id, "/onboarding");
  const state = await loadOnboarding(ctx.db, ctx.engagement, ctx.members);
  const canEdit = allows(ctx.membership, "edit_experts");
  return (
    <CaseShell ctx={ctx} section="onboarding" title="Onboarding">
      <Onboarding
        engagementId={id}
        codeName={ctx.engagement.clientName}
        initialCode={state.caseCode}
        initial={state.data}
        firmStandard={state.firmStandard}
        canEdit={canEdit}
        canSetStandard={canEdit && (ctx.role === "manager" || ctx.role === "partner")}
      />
    </CaseShell>
  );
}
