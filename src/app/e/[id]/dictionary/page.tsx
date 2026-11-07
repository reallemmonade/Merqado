import { CaseShell } from "@/components/case/CaseShell";
import { Dictionary } from "@/components/case/Dictionary";
import { loadGlossary } from "@/lib/case/data";
import { loadCase } from "@/lib/case/page";

export const dynamic = "force-dynamic";

export default async function DictionaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadCase(id, "/dictionary");
  const terms = await loadGlossary(ctx.db, id);
  const categories = [...new Set(terms.filter((t) => t.status === "active").map((t) => t.category))].sort();
  return (
    <CaseShell ctx={ctx} section="dictionary" title="Dictionary">
      <Dictionary
        engagementId={id}
        canEdit={ctx.canEdit}
        categories={categories}
        terms={terms.map((t) => ({ id: t.id, term: t.term, category: t.category, definition: t.definition, status: t.status }))}
      />
    </CaseShell>
  );
}
