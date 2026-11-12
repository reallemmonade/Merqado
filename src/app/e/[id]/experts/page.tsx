import { PipelineView } from "@/components/experts/PipelineView";
import { resolveFocus } from "@/lib/experts/focus";
import { loadExpertsPage } from "@/lib/experts/page";

export default async function ExpertsCallsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ expert?: string; tab?: string; focus?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { data, canEdit, canApprove, members, me, suggestedRequester } = await loadExpertsPage(id);
  const focus = resolveFocus(data, sp.focus);
  const tab = sp.tab === "guide" || sp.tab === "takeaways" ? sp.tab : undefined;
  return (
    <PipelineView
      engagementId={id}
      data={data}
      canEdit={canEdit}
      canApprove={canApprove}
      members={members}
      me={me}
      suggestedRequester={suggestedRequester}
      initialExpert={data.experts.some((e) => e.id === sp.expert) ? sp.expert : focus?.ids[0]}
      focus={focus}
      initialTab={tab}
    />
  );
}
