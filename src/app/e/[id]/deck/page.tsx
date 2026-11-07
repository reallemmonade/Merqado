import { DeckSlides } from "@/components/case/Deck";
import { loadDeck, loadWorkplan } from "@/lib/case/data";
import { slideRows } from "@/lib/case/deck";
import { loadCase } from "@/lib/case/page";

export const dynamic = "force-dynamic";

export default async function DeckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ slide?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await loadCase(id, "/deck");
  const [deck, wp] = await Promise.all([loadDeck(ctx.db, id), loadWorkplan(ctx.db, id)]);
  return (
    <DeckSlides
      engagementId={id}
      slides={slideRows(deck)}
      modules={wp.modules.map((m) => ({ id: m.id, name: m.name }))}
      selected={sp.slide}
      canEdit={ctx.canEdit}
    />
  );
}
