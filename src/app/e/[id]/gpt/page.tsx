import { CaseShell } from "@/components/case/CaseShell";
import { GptStart } from "@/components/case/GptChat";
import { GptList } from "@/components/case/GptList";
import { loadGptList } from "@/lib/case/gpt";
import { loadCase } from "@/lib/case/page";

export const dynamic = "force-dynamic";

export default async function GptHome({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await loadCase(id, "/gpt");
  const chats = await loadGptList(ctx.db, id, ctx.user.id);
  return (
    <CaseShell ctx={ctx} section="gpt" hideGptBar>
      <div className="gpt-layout">
        <GptList engagementId={id} chats={chats} team={sp.tab === "team"} />
        <GptStart engagementId={id} name={ctx.gpt} />
      </div>
    </CaseShell>
  );
}
