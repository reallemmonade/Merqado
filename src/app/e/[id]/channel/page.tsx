import Link from "next/link";
import { inArray } from "drizzle-orm";
import { CaseShell } from "@/components/case/CaseShell";
import { NewRoom, RoomSetup, RoomView, type ChatLine } from "@/components/case/Channel";
import { users } from "@/db/schema";
import { loadRoomMessages, loadWorkplan, visibleRooms } from "@/lib/case/data";
import { initials, loadCase } from "@/lib/case/page";
import { shortDate, todayIso } from "@/lib/case/progress";
import { roomMembersLabel } from "@/lib/case/rooms";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ room?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await loadCase(id, "/channel");
  const { db, user } = ctx;
  const [rooms, wp] = await Promise.all([visibleRooms(db, id, user.archetype), loadWorkplan(db, id)]);
  const room = rooms.find((r) => r.id === sp.room) ?? rooms[0];
  const messages = room ? await loadRoomMessages(db, room.id) : [];
  const authorIds = [...new Set(messages.map((m) => m.userId).filter((x): x is string => !!x))];
  const authors = authorIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds)) : [];
  const nameOf = new Map(authors.map((a) => [a.id, a.name]));
  const lines: ChatLine[] = messages.map((m) => {
    const author = (m.userId && nameOf.get(m.userId)) || "Former member";
    return {
      id: m.id,
      body: m.body,
      pinned: m.pinned,
      mine: m.userId === user.id,
      author,
      initials: initials(author),
      time: m.createdAt
        ? m.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })
        : "",
    };
  });
  const today = todayIso();
  const base = `/e/${id}/channel`;

  return (
    <CaseShell ctx={ctx} section="channel" title="Team channel" actions={ctx.canEdit && rooms.length > 0 ? <NewRoom engagementId={id} /> : undefined}>
      {rooms.length === 0 ? (
        ctx.canEdit ? <RoomSetup engagementId={id} /> : <p className="muted">No chats</p>
      ) : (
        <div className="channel">
          <nav className="panel room-list" aria-label="Chats">
            {rooms.map((r) => (
              <Link key={r.id} href={`${base}?room=${r.id}`} aria-current={r.id === room?.id ? "page" : undefined}>
                <span style={{ fontWeight: 600 }}># {r.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{roomMembersLabel(r.archetypes)}</span>
              </Link>
            ))}
          </nav>
          {room && (
            <section className="panel" style={{ flex: 1, minWidth: 0 }}>
              <div className="group-head">
                <h2># {room.name}</h2>
                <span className="muted" style={{ fontSize: 13 }}>{roomMembersLabel(room.archetypes)}</span>
              </div>
              <RoomView engagementId={id} roomId={room.id} lines={lines} />
            </section>
          )}
          {wp.milestones.length > 0 && (
            <aside className="panel dates" aria-label="Dates">
              <div className="group-head">
                <h2>Dates</h2>
              </div>
              <ol className="date-rail">
                {wp.milestones.map((m) => (
                  <li key={m.id} className={m.date < today ? "past" : undefined}>
                    <i />
                    <span style={{ fontWeight: 600 }}>{m.label}</span>
                    <span className="mono">{shortDate(m.date)}</span>
                  </li>
                ))}
              </ol>
            </aside>
          )}
        </div>
      )}
    </CaseShell>
  );
}
