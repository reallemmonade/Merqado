import { CaseShell } from "@/components/case/CaseShell";
import { SubTabs } from "@/components/experts/SubTabs";
import { loadCase } from "@/lib/case/page";

export const dynamic = "force-dynamic";

export default async function ExpertsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadCase(id, "/experts");
  return (
    <CaseShell ctx={ctx} section="experts" title="Experts">
      <SubTabs engagementId={id} />
      {children}
    </CaseShell>
  );
}
