import { KtaView } from "@/components/experts/KtaView";
import { loadExpertsPage } from "@/lib/experts/page";

export default async function ExpertsKtaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ h?: string; v?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { data, canEdit } = await loadExpertsPage(id);
  const h = data.hypotheses.some((x) => x.id === sp.h) ? sp.h : undefined;
  const v = h && (sp.v === "supports" || sp.v === "challenges") ? sp.v : undefined;
  return <KtaView engagementId={id} data={data} canEdit={canEdit} focusHyp={h} focusVerdict={v} />;
}
