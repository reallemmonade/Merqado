import { Contradictions } from "@/components/case/Deck";
import { loadDeck } from "@/lib/case/data";
import { issueRows } from "@/lib/case/deck";
import { loadCase } from "@/lib/case/page";
import { shortDate } from "@/lib/case/progress";

export const dynamic = "force-dynamic";

export default async function ContradictionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadCase(id, "/deck/contradictions");
  const deck = await loadDeck(ctx.db, id);
  const latest = deck.issues
    .filter((i) => i.kind === "contradiction" && i.createdAt)
    .reduce<Date | null>((a, i) => (!a || i.createdAt! > a ? i.createdAt! : a), null);
  return (
    <Contradictions
      engagementId={id}
      issues={issueRows(deck, "contradiction")}
      hasSlides={deck.slides.length > 0}
      canEdit={ctx.canEdit}
      lastScan={latest ? shortDate(latest.toISOString().slice(0, 10)) : ""}
    />
  );
}
