import { CaseShell, caseSections } from "@/components/case/CaseShell";
import { TilesBoard } from "@/components/case/TilesBoard";
import { loadCase } from "@/lib/case/page";

export const dynamic = "force-dynamic";

export default async function TilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadCase(id, "/tiles");
  const sections = caseSections(ctx.gpt).filter((s) => s.key !== "tiles");
  return (
    <CaseShell ctx={ctx} section="tiles" hideGptBar>
      <TilesBoard engagementId={id} sections={sections} />
    </CaseShell>
  );
}
