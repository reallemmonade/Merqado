import { and, eq } from "drizzle-orm";
import { CaseShell } from "@/components/case/CaseShell";
import { DeckTabs } from "@/components/case/DeckTabs";
import { deckIssues } from "@/db/schema";
import { loadCase } from "@/lib/case/page";

export const dynamic = "force-dynamic";

export default async function DeckLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadCase(id, "/deck");
  const open = await ctx.db.select({ kind: deckIssues.kind }).from(deckIssues).where(and(eq(deckIssues.engagementId, id), eq(deckIssues.status, "open")));
  return (
    <CaseShell ctx={ctx} section="deck" title="Deck">
      <DeckTabs engagementId={id} qc={open.filter((i) => i.kind === "qc").length} contradictions={open.filter((i) => i.kind === "contradiction").length} />
      {children}
    </CaseShell>
  );
}
