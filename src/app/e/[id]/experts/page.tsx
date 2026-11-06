import { PipelineView } from "@/components/experts/PipelineView";
import { loadExpertsPage } from "@/lib/experts/page";

export default async function ExpertsPipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ expert?: string; tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { data, canEdit, canApprove } = await loadExpertsPage(id);
  const tab = sp.tab === "guide" || sp.tab === "takeaways" ? sp.tab : undefined;
  return (
    <PipelineView
      engagementId={id}
      data={data}
      canEdit={canEdit}
      canApprove={canApprove}
      initialExpert={data.experts.some((e) => e.id === sp.expert) ? sp.expert : undefined}
      initialTab={tab}
    />
  );
}
