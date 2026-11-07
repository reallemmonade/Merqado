import { QualityCheck } from "@/components/case/Deck";
import { loadDeck } from "@/lib/case/data";
import { issueRows } from "@/lib/case/deck";
import { loadCase } from "@/lib/case/page";

export const dynamic = "force-dynamic";

export default async function QcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadCase(id, "/deck/qc");
  const deck = await loadDeck(ctx.db, id);
  return (
    <QualityCheck
      engagementId={id}
      issues={issueRows(deck, "qc")}
      learnings={deck.learnings.map((l) => ({ id: l.id, rule: l.rule, origin: l.origin }))}
      hasSlides={deck.slides.length > 0}
      canEdit={ctx.canEdit}
    />
  );
}
