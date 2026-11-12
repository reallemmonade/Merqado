import { CaseShell } from "@/components/case/CaseShell";
import { RoomSetup } from "@/components/case/Channel";
import { TeamChat, type ChatTab } from "@/components/case/TeamChat";
import { chatRooms, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { loadChatList, loadMarked, loadMessages, loadPeople, loadSharedFiles } from "@/lib/case/chat";
import { loadCaseFolders } from "@/lib/files/folders";
import { loadCase } from "@/lib/case/page";

export const dynamic = "force-dynamic";

const TABS: ChatTab[] = ["chat", "files", "pinned", "meetings"];

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ room?: string; thread?: string; tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await loadCase(id, "/channel");
  const { db, user } = ctx;
  // Opening the channel counts as being around, for the presence dot.
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
  const people = await loadPeople(db, ctx.members);
  const chats = await loadChatList(db, id, user, people);
  // Any room on the case, including ones this person can't see, so setup isn't offered twice.
  const hasRooms = !!(await db.query.chatRooms.findFirst({ where: and(eq(chatRooms.engagementId, id), eq(chatRooms.kind, "room")) }));
  // With no rooms yet, an editor lands on setup rather than on a 1:1.
  const showSetup = !hasRooms && ctx.canEdit;
  const active = chats.find((c) => c.id === sp.room) ?? (sp.room || showSetup ? undefined : (chats.find((c) => c.kind === "room") ?? chats[0]));
  const tab: ChatTab = TABS.includes(sp.tab as ChatTab) ? (sp.tab as ChatTab) : "chat";

  const [messages, thread, files, marked, folders, me] = active
    ? await Promise.all([
        loadMessages(db, id, active.id, user, people),
        sp.thread
          ? Promise.all([loadMessages(db, id, active.id, user, people, { ids: [sp.thread] }), loadMessages(db, id, active.id, user, people, { parentId: sp.thread })])
          : Promise.resolve(null),
        tab === "files" ? loadSharedFiles(db, id, active.id, people) : Promise.resolve([]),
        loadMarked(db, active.id),
        loadCaseFolders(db, id),
        db.query.users.findFirst({ where: eq(users.id, user.id), columns: { presence: true } }),
      ])
    : [[], null, [], { pinned: [], meetings: [] }, [], await db.query.users.findFirst({ where: eq(users.id, user.id), columns: { presence: true } })];

  const extra = active && (tab === "pinned" || tab === "meetings") ? await loadMessages(db, id, active.id, user, people, { ids: tab === "pinned" ? marked.pinned : marked.meetings }) : [];
  const parent = thread?.[0]?.[0] ?? null;

  return (
    <CaseShell ctx={ctx} section="channel">
      <TeamChat
        engagementId={id}
        me={{ id: user.id, name: user.name, status: me?.presence ?? "auto" }}
        people={people}
        chats={chats}
        active={active ?? null}
        tab={tab}
        messages={messages}
        tabItems={extra}
        files={files}
        pinnedCount={marked.pinned.length}
        meetingCount={marked.meetings.length}
        thread={parent ? { parent, replies: thread![1] } : null}
        folders={folders}
        canEdit={ctx.canEdit}
        setup={showSetup ? <RoomSetup engagementId={id} /> : null}
      />
    </CaseShell>
  );
}
