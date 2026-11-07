import { notFound } from "next/navigation";
import { and, asc, eq, or } from "drizzle-orm";
import { CaseShell } from "@/components/case/CaseShell";
import { GptChat, type GptLine, type GptSource } from "@/components/case/GptChat";
import { GptList } from "@/components/case/GptList";
import { gptChats, gptMessages } from "@/db/schema";
import { loadGptList } from "@/lib/case/gpt";
import { loadCase } from "@/lib/case/page";

export const dynamic = "force-dynamic";

function parseSources(json: string): GptSource[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default async function GptChatPage({ params, searchParams }: { params: Promise<{ id: string; chatId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id, chatId } = await params;
  const sp = await searchParams;
  const ctx = await loadCase(id, `/gpt/${chatId}`);
  const { db, user } = ctx;
  const chat = await db.query.gptChats.findFirst({
    where: and(eq(gptChats.id, chatId), eq(gptChats.engagementId, id), or(eq(gptChats.userId, user.id), eq(gptChats.shared, true))),
  });
  if (!chat) notFound();
  const [chats, msgs] = await Promise.all([
    loadGptList(db, id, user.id),
    db.select().from(gptMessages).where(eq(gptMessages.chatId, chatId)).orderBy(asc(gptMessages.createdAt)),
  ]);
  const mine = chat.userId === user.id;
  const lines: GptLine[] = msgs.map((m) => ({ id: m.id, role: m.role, body: m.body, sources: parseSources(m.sources) }));
  const folders = [...new Set(chats.filter((c) => c.mine && c.folder).map((c) => c.folder))];
  return (
    <CaseShell ctx={ctx} section="gpt" hideGptBar>
      <div className="gpt-layout">
        <GptList engagementId={id} chats={chats} team={sp.tab === "team" || (!mine && sp.tab !== "mine")} activeId={chatId} />
        <GptChat
          key={chat.id}
          engagementId={id}
          name={ctx.gpt}
          chat={{ id: chat.id, title: chat.title, folder: chat.folder, shared: chat.shared, pinned: chat.pinned, mine }}
          lines={lines}
        />
        <datalist id="gpt-folders">
          {folders.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>
    </CaseShell>
  );
}
