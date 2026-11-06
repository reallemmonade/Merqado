import { KtaView } from "@/components/experts/KtaView";
import { loadExpertsPage } from "@/lib/experts/page";

export default async function ExpertsKtaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, canEdit } = await loadExpertsPage(id);
  return <KtaView engagementId={id} data={data} canEdit={canEdit} />;
}
