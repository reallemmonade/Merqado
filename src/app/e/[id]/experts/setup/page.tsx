import { SetupView } from "@/components/experts/SetupView";
import { loadExpertsPage } from "@/lib/experts/page";

export default async function ExpertsSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, engagement, canEdit } = await loadExpertsPage(id);
  return <SetupView engagementId={id} data={data} startsOn={engagement.startsOn} endsOn={engagement.endsOn} canEdit={canEdit} />;
}
