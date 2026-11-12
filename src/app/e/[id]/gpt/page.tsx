import { CaseShell } from "@/components/case/CaseShell";
import { GptStart } from "@/components/case/GptChat";
import { GptList } from "@/components/case/GptList";
import { loadGptList } from "@/lib/case/gpt";
import { loadCase } from "@/lib/case/page";

export const dynamic = "force-dynamic";

export default async function GptHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await loadCase(id, "/gpt");
  const chats = await loadGptList(ctx.db, id, ctx.user.id);
  const folders = [...new Set(chats.filter((c) => c.mine && c.folder).map((c) => c.folder))];
  return (
    <CaseShell ctx={ctx} section="gpt" hideGptBar>
      <div className="gpt-layout">
        <GptList engagementId={id} name={ctx.gpt} chats={chats} folders={folders} />
        <GptStart engagementId={id} name={ctx.gpt} first={(ctx.user.name ?? "").trim().split(/\s+/)[0] ?? ""} />
      </div>
    </CaseShell>
  );
}
