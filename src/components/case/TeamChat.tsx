"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ARCHETYPES, type Archetype } from "@/db/schema";
import { useApi } from "@/components/experts/useApi";
import type { ChatListItem, ChatMsg, ChatPerson, SharedFile } from "@/lib/case/chat";
import { ARCHETYPE_LABEL, PRESENCE_LABEL, QUICK_REACTIONS, type Presence } from "@/lib/case/rooms";
import { ChatFileCard } from "./Channel";
import { Icon, type IconName } from "./icons";

export type ChatTab = "chat" | "files" | "pinned" | "meetings";

interface Props {
  engagementId: string;
  me: { id: string; name: string; status: string };
  people: ChatPerson[];
  chats: ChatListItem[];
  active: ChatListItem | null;
  tab: ChatTab;
  messages: ChatMsg[];
  tabItems: ChatMsg[];
  files: SharedFile[];
  pinnedCount: number;
  meetingCount: number;
  thread: { parent: ChatMsg; replies: ChatMsg[] } | null;
  folders: string[];
  canEdit: boolean;
  setup: ReactNode;
}

const EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🎉", "🔥", "👀", "✅", "🙏", "👏", "💯", "🤔", "🚀", "📈", "📉", "⚠️", "☕", "🙌", "😅"];

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Times are shown in the viewer's own time zone, so they render after the page loads. */
function When({ iso, mode = "time" }: { iso: string | null; mode?: "time" | "list" | "full" }) {
  const mounted = useMounted();
  if (!mounted || !iso) return <time />;
  const d = new Date(iso);
  const now = new Date();
  let text: string;
  if (mode === "time") text = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  else if (mode === "full") text = d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  else if (sameDay(d, now)) text = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  else if (now.getTime() - d.getTime() < 6 * 86400000) text = d.toLocaleDateString(undefined, { weekday: "short" });
  else text = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <time dateTime={iso} title={d.toLocaleString()}>
      {text}
    </time>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, new Date(now.getTime() - 86400000))) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

const AV_COLORS = ["c1", "c2", "c3", "c4", "c5", "c6"];
function colorOf(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

function Avatar({ id, initials, presence, size = "m" }: { id: string; initials: string; presence?: Presence; size?: "s" | "m" | "xs" }) {
  return (
    <span className={`tc-av ${size} ${colorOf(id)}${presence ? ` p-${presence}` : ""}`} title={presence ? PRESENCE_LABEL[presence] : undefined} aria-hidden="true">
      {initials}
    </span>
  );
}

function RoomBadge({ name }: { name: string }) {
  const parts = name.replace(/[^\p{L}\p{N}+ ]/gu, "").trim().split(/\s+/);
  const text = ((parts[0]?.[0] ?? "#") + (parts.length > 1 ? (parts[1]?.[0] ?? "") : (parts[0]?.[1] ?? ""))).toUpperCase();
  return (
    <span className="tc-room" aria-hidden="true">
      {text}
    </span>
  );
}

function ChatIcon({ chat, people }: { chat: ChatListItem; people: Map<string, ChatPerson> }) {
  if (chat.kind === "room") return <RoomBadge name={chat.name} />;
  if (chat.kind === "dm" && chat.otherId) {
    const p = people.get(chat.otherId);
    return <Avatar id={chat.otherId} initials={p?.initials ?? "?"} presence={p?.presence} />;
  }
  const others = chat.memberIds.slice(0, 2);
  return (
    <span className="tc-stack pair" aria-hidden="true">
      {others.map((m) => (
        <Avatar key={m} id={m} initials={people.get(m)?.initials ?? "?"} size="xs" />
      ))}
    </span>
  );
}

function IconButton({ icon, label, onClick, active, disabled, className }: { icon: IconName; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button type="button" className={`tc-ib${active ? " on" : ""}${className ? ` ${className}` : ""}`} aria-label={label} title={label} aria-pressed={active} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={16} />
    </button>
  );
}

/** A small panel that opens under its button and closes on outside click or Escape. */
function Pop({ button, children, align = "left", open, setOpen }: { button: ReactNode; children: ReactNode; align?: "left" | "right"; open: boolean; setOpen: (v: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open, setOpen]);
  return (
    <div className="tc-pop-host" ref={ref}>
      {button}
      {open && <div className={`tc-pop ${align}`}>{children}</div>}
    </div>
  );
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Message text with @mentions and links picked out. */
function Body({ text, names, meNames }: { text: string; names: string[]; meNames: Set<string> }) {
  const parts = useMemo(() => {
    const alts = names.map(escapeRe).join("|");
    const re = new RegExp(`(https?://[^\\s<]+)${alts ? `|@(${alts})(?![\\p{L}\\p{N}])` : ""}`, "giu");
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0;
      if (at > last) out.push(text.slice(last, at));
      if (m[1]) {
        out.push(
          <a key={at} href={m[1]} target="_blank" rel="noreferrer">
            {m[1]}
          </a>,
        );
      } else {
        const name = m[2] ?? "";
        out.push(
          <span key={at} className={`tc-at${meNames.has(name.toLowerCase()) ? " me" : ""}`}>
            @{name}
          </span>,
        );
      }
      last = at + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text, names, meNames]);
  return <div className="tc-text">{parts}</div>;
}

// ---------------------------------------------------------------------------
// Live updates, read state and presence
// ---------------------------------------------------------------------------

function useLive(engagementId: string, roomId: string | null, newest: string) {
  const router = useRouter();
  const url = `/api/engagements/${engagementId}/channel`;
  useEffect(() => {
    const post = (json: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) }).catch(() => null);
    const refresh = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    const ping = setInterval(() => {
      if (document.visibilityState === "visible") post({ op: "ping" });
    }, 60000);
    return () => {
      clearInterval(refresh);
      clearInterval(ping);
    };
  }, [router, url]);
  useEffect(() => {
    if (!roomId) return;
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "read", roomId }) }).catch(() => null);
  }, [url, roomId, newest]);
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function TeamChat(p: Props) {
  const { engagementId, active, people, me } = p;
  const peopleMap = useMemo(() => new Map(p.people.map((x) => [x.id, x])), [p.people]);
  const newest = p.messages[p.messages.length - 1]?.at ?? "";
  useLive(engagementId, active?.id ?? null, `${newest}|${p.thread?.replies.length ?? 0}`);

  const base = `/e/${engagementId}/channel`;
  const href = (q: { room?: string | null; tab?: ChatTab; thread?: string | null }) => {
    const sp = new URLSearchParams();
    const room = q.room === undefined ? active?.id : q.room;
    if (room) sp.set("room", room);
    const tab = q.tab ?? p.tab;
    if (tab !== "chat") sp.set("tab", tab);
    if (q.thread) sp.set("thread", q.thread);
    const s = sp.toString();
    return s ? `${base}?${s}` : base;
  };

  // Everyone who can read the open chat: who @ can reach.
  const audience = useMemo(() => (active ? active.memberIds.map((m) => peopleMap.get(m)).filter((x): x is ChatPerson => !!x) : []), [active, peopleMap]);
  const names = useMemo(() => {
    const all = people.flatMap((x) => [x.name, x.name.split(/\s+/)[0] ?? ""]).filter(Boolean);
    return [...new Set(all)].sort((a, b) => b.length - a.length);
  }, [people]);
  const meNames = useMemo(() => new Set([me.name.toLowerCase(), (me.name.split(/\s+/)[0] ?? "").toLowerCase()]), [me.name]);
  const ctx: MsgCtx = { engagementId, names, meNames, folders: p.folders, peopleMap, href, meId: me.id };

  return (
    <div className={`tc${p.thread ? " has-thread" : ""}`}>
      <ChatList {...p} peopleMap={peopleMap} href={href} />
      <section className="tc-convo" aria-label="Conversation">
        {active ? (
          <Conversation {...p} active={active} audience={audience} ctx={ctx} href={href} />
        ) : (
          <div className="tc-empty">{p.setup ?? <span className="muted">No chats</span>}</div>
        )}
      </section>
      {p.thread && active && (
        <aside className="tc-thread" aria-label="Thread">
          <div className="tc-side-head">
            <h3>Thread</h3>
            <span className="muted">{active.name}</span>
            <Link href={href({ thread: null })} className="tc-ib" aria-label="Close thread" title="Close">
              <Icon name="close" size={16} />
            </Link>
          </div>
          <ThreadLog parent={p.thread.parent} replies={p.thread.replies} ctx={ctx} />
          <Composer engagementId={engagementId} roomId={active.id} parentId={p.thread.parent.id} audience={audience} meId={me.id} placeholder="Reply" />
        </aside>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left: chat list
// ---------------------------------------------------------------------------

function ChatList(p: Props & { peopleMap: Map<string, ChatPerson>; href: (q: { room?: string | null; tab?: ChatTab; thread?: string | null }) => string }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "mentions">("all");
  const meP = p.peopleMap.get(p.me.id);
  const show = (c: ChatListItem) => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
    const unread = c.id === p.active?.id ? 0 : c.unread;
    if (filter === "unread") return unread > 0;
    if (filter === "mentions") return c.id !== p.active?.id && c.mentioned > 0;
    return true;
  };
  const byRecent = (a: ChatListItem, b: ChatListItem) => (b.lastAt ?? "").localeCompare(a.lastAt ?? "");
  const rooms = p.chats.filter((c) => c.kind === "room" && show(c));
  const chats = p.chats.filter((c) => c.kind !== "room" && show(c)).sort(byRecent);

  const item = (c: ChatListItem) => {
    const isActive = c.id === p.active?.id;
    const unread = isActive ? 0 : c.unread;
    const mentioned = isActive ? 0 : c.mentioned;
    return (
      <Link key={c.id} href={p.href({ room: c.id, tab: "chat", thread: null })} className={`tc-item${unread ? " unread" : ""}`} aria-current={isActive ? "page" : undefined}>
        <ChatIcon chat={c} people={p.peopleMap} />
        <span className="t">
          <span className="n">
            <b>{c.name}</b>
            <When iso={c.lastAt} mode="list" />
          </span>
          <span className="pv">{c.last ? `${c.kind === "dm" && c.last.author !== "You" ? "" : `${c.last.author}: `}${c.last.text}` : c.kind === "room" ? c.sub : ""}</span>
        </span>
        {mentioned > 0 ? (
          <span className="tc-badge at" aria-label={`${mentioned} mentions`}>
            @
          </span>
        ) : unread > 0 ? (
          <span className="tc-badge" aria-label={`${unread} unread`}>
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <nav className="tc-list" aria-label="Chats">
      <div className="tc-list-head">
        <div className="tc-row">
          <h2>Team channel</h2>
          <span className="tc-row" style={{ gap: 4 }}>
            <MyStatus engagementId={p.engagementId} me={p.me} presence={meP?.presence ?? "available"} />
            <NewChat engagementId={p.engagementId} people={p.people.filter((x) => x.id !== p.me.id)} href={p.href} />
          </span>
        </div>
        <input type="text" className="tc-search" placeholder="Search" aria-label="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips" role="group" aria-label="Show">
          {(["all", "unread", "mentions"] as const).map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "unread" ? "Unread" : "@ Mentions"}
            </button>
          ))}
        </div>
      </div>
      <div className="tc-scroll">
        <div className="tc-group">
          <span>Rooms</span>
          {p.canEdit && <NewRoomButton engagementId={p.engagementId} href={p.href} />}
        </div>
        {rooms.map(item)}
        <div className="tc-group">
          <span>Chats</span>
        </div>
        {chats.map(item)}
        {rooms.length + chats.length === 0 && <p className="muted tc-pad">No chats</p>}
      </div>
    </nav>
  );
}

function MyStatus({ engagementId, me, presence }: { engagementId: string; me: { id: string; name: string; status: string }; presence: Presence }) {
  const { call } = useApi();
  const [open, setOpen] = useState(false);
  const options: { status: string; label: string; dot: Presence }[] = [
    { status: "auto", label: "Available", dot: "available" },
    { status: "busy", label: "Busy", dot: "busy" },
    { status: "dnd", label: "Do not disturb", dot: "dnd" },
    { status: "away", label: "Away", dot: "away" },
  ];
  const initials = me.name
    .split(/\s+/)
    .map((x) => x[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Pop
      open={open}
      setOpen={setOpen}
      align="right"
      button={
        <button type="button" className="tc-me" aria-label="Status" title={PRESENCE_LABEL[presence]} onClick={() => setOpen(!open)}>
          <Avatar id={me.id} initials={initials} presence={presence} size="s" />
        </button>
      }
    >
      <div className="tc-menu">
        {options.map((o) => (
          <button
            key={o.status}
            type="button"
            aria-pressed={me.status === o.status}
            onClick={() => {
              setOpen(false);
              call("status", `/api/engagements/${engagementId}/channel`, { json: { op: "presence.set", status: o.status } });
            }}
          >
            <i className={`tc-dot p-${o.dot}`} />
            {o.label}
            {me.status === o.status && <Icon name="check" size={14} />}
          </button>
        ))}
      </div>
    </Pop>
  );
}

function PeoplePicker({ people, picked, setPicked }: { people: ChatPerson[]; picked: string[]; setPicked: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const shown = people.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <input type="text" placeholder="Name" aria-label="Find people" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="tc-people">
        {shown.map((x) => (
          <label key={x.id} className="tc-person">
            <input type="checkbox" checked={picked.includes(x.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, x.id] : picked.filter((y) => y !== x.id))} />
            <Avatar id={x.id} initials={x.initials} presence={x.presence} size="s" />
            <span className="t">
              {x.name}
              <span>{x.title}</span>
            </span>
          </label>
        ))}
        {shown.length === 0 && <span className="muted">No people</span>}
      </div>
    </>
  );
}

function NewChat({ engagementId, people, href }: { engagementId: string; people: ChatPerson[]; href: (q: { room?: string | null; tab?: ChatTab; thread?: string | null }) => string }) {
  const { call, busy, error } = useApi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  return (
    <Pop open={open} setOpen={setOpen} align="right" button={<IconButton icon="compose" label="New chat" onClick={() => setOpen(!open)} />}>
      <form
        className="tc-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await call("open", `/api/engagements/${engagementId}/channel`, { json: { op: "chat.open", userIds: picked, name: picked.length > 1 && name.trim() ? name.trim() : undefined } });
          if (res?.id) {
            setOpen(false);
            setPicked([]);
            setName("");
            router.push(href({ room: res.id, tab: "chat", thread: null }));
          }
        }}
      >
        <PeoplePicker people={people} picked={picked} setPicked={setPicked} />
        {picked.length > 1 && <input type="text" placeholder="Group name" aria-label="Group name" value={name} onChange={(e) => setName(e.target.value)} />}
        <button type="submit" className="small" disabled={busy !== null || picked.length === 0}>
          Start chat
        </button>
        {error && <span className="error">{error}</span>}
      </form>
    </Pop>
  );
}

function NewRoomButton({ engagementId, href }: { engagementId: string; href: (q: { room?: string | null; tab?: ChatTab; thread?: string | null }) => string }) {
  const { call, busy, error } = useApi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [who, setWho] = useState<Archetype[]>([]);
  return (
    <Pop open={open} setOpen={setOpen} align="right" button={<IconButton icon="plus" label="New room" onClick={() => setOpen(!open)} className="sm" />}>
      <form
        className="tc-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await call("room", `/api/engagements/${engagementId}/channel`, { json: { op: "room.add", name, archetypes: who } });
          if (res?.id) {
            setOpen(false);
            setName("");
            setWho([]);
            router.push(href({ room: res.id, tab: "chat", thread: null }));
          }
        }}
      >
        <input type="text" placeholder="Room name" aria-label="Room name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        {[...ARCHETYPES].reverse().map((a) => (
          <label key={a} className="check">
            <input type="checkbox" checked={who.includes(a)} onChange={(e) => setWho(e.target.checked ? [...who, a] : who.filter((x) => x !== a))} />
            {ARCHETYPE_LABEL[a]}
          </label>
        ))}
        <button type="submit" className="small" disabled={busy !== null || !name.trim() || who.length === 0}>
          Create room
        </button>
        {error && <span className="error">{error}</span>}
      </form>
    </Pop>
  );
}

// ---------------------------------------------------------------------------
// Middle: conversation
// ---------------------------------------------------------------------------

interface MsgCtx {
  engagementId: string;
  names: string[];
  meNames: Set<string>;
  folders: string[];
  peopleMap: Map<string, ChatPerson>;
  href: (q: { room?: string | null; tab?: ChatTab; thread?: string | null }) => string;
  meId: string;
}

function Conversation(p: Props & { active: ChatListItem; audience: ChatPerson[]; ctx: MsgCtx; href: MsgCtx["href"] }) {
  const { active, tab } = p;
  const [find, setFind] = useState<string | null>(null);
  const shown = find ? p.messages.filter((m) => m.body.toLowerCase().includes(find.toLowerCase()) || m.files.some((f) => f.filename.toLowerCase().includes(find.toLowerCase()))) : p.messages;
  const lastPinned = [...p.messages].reverse().find((m) => m.pinned);
  const tabs: { key: ChatTab; label: string; count?: number }[] = [
    { key: "chat", label: "Chat" },
    { key: "files", label: "Files" },
    { key: "pinned", label: "Pinned", count: p.pinnedCount },
    { key: "meetings", label: "Meetings", count: p.meetingCount },
  ];
  return (
    <>
      <header className="tc-head">
        <div className="tc-title">
          <ChatIcon chat={active} people={p.ctx.peopleMap} />
          <h2>{active.name}</h2>
          {active.kind === "room" && (
            <span className="tc-lock" title={active.sub}>
              <Icon name="lock" size={14} />
            </span>
          )}
          {active.kind !== "dm" && (
            <span className="tc-stack" title={p.audience.map((x) => x.name).join(", ")}>
              {p.audience.slice(0, 5).map((x) => (
                <Avatar key={x.id} id={x.id} initials={x.initials} size="xs" />
              ))}
              {p.audience.length > 5 && <span className="tc-more">+{p.audience.length - 5}</span>}
            </span>
          )}
          <span className="grow" />
          <IconButton icon="search" label="Find in chat" active={find !== null} onClick={() => setFind(find === null ? "" : null)} />
          {active.kind !== "room" && <AddPeople engagementId={p.engagementId} chat={active} people={p.people} meId={p.me.id} href={p.href} />}
          <CallButton engagementId={p.engagementId} roomId={active.id} video={false} />
          <CallButton engagementId={p.engagementId} roomId={active.id} video />
          {active.kind === "group" && <GroupMenu engagementId={p.engagementId} chat={active} />}
        </div>
        <nav className="tc-tabs" aria-label="Chat views">
          {tabs.map((t) => (
            <Link key={t.key} href={p.href({ tab: t.key, thread: null })} aria-current={tab === t.key ? "page" : undefined}>
              {t.label}
              {t.count ? <i>{t.count}</i> : null}
            </Link>
          ))}
        </nav>
      </header>
      {find !== null && (
        <div className="tc-find">
          <input type="text" placeholder="Find" aria-label="Find in chat" value={find} onChange={(e) => setFind(e.target.value)} autoFocus />
          <span className="muted">{find ? shown.length : ""}</span>
        </div>
      )}
      {tab === "chat" && lastPinned && find === null && (
        <div className="tc-pinbar">
          <Icon name="pin" size={14} />
          <a href={`#m-${lastPinned.id}`} className="tc-pin-text">
            {lastPinned.kind === "meeting" ? lastPinned.meta.title : lastPinned.body || lastPinned.files[0]?.filename}
          </a>
          {p.pinnedCount > 1 && <Link href={p.href({ tab: "pinned", thread: null })}>{p.pinnedCount} pinned</Link>}
        </div>
      )}
      {tab === "chat" && <MessageLog messages={shown} ctx={p.ctx} threadId={p.thread?.parent.id ?? null} />}
      {tab === "files" && <FilesTab engagementId={p.engagementId} files={p.files} />}
      {(tab === "pinned" || tab === "meetings") && (
        <div className="tc-scroll tc-log">
          {tab === "meetings" && (
            <div className="tc-row" style={{ justifyContent: "flex-start", paddingBottom: 8 }}>
              <ScheduleMeeting engagementId={p.engagementId} roomId={active.id} />
            </div>
          )}
          {(tab === "meetings" ? [...p.tabItems].sort((a, b) => (b.meta.startsAt ?? "").localeCompare(a.meta.startsAt ?? "")) : p.tabItems).map((m) => (
            <Message key={m.id} m={m} ctx={p.ctx} cont={false} showReplies={false} />
          ))}
          {p.tabItems.length === 0 && <p className="muted">{tab === "pinned" ? "No pinned messages" : "No meetings"}</p>}
        </div>
      )}
      {tab === "chat" && <Composer engagementId={p.engagementId} roomId={active.id} audience={p.audience} meId={p.me.id} placeholder={`Message ${active.name}`} withMeeting />}
    </>
  );
}

function MessageLog({ messages, ctx, threadId }: { messages: ChatMsg[]; ctx: MsgCtx; threadId: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const mounted = useMounted();
  const last = messages[messages.length - 1]?.id;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (location.hash.startsWith("#m-") && !stick.current) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [last, mounted]);
  useEffect(() => {
    if (location.hash.startsWith("#m-")) {
      stick.current = false;
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "center" });
    }
  }, []);
  return (
    <div
      className="tc-scroll tc-log"
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = mounted && (!prev || !sameDay(new Date(prev.at), new Date(m.at)));
        const cont = !!prev && !newDay && prev.authorId === m.authorId && prev.kind === "text" && m.kind === "text" && new Date(m.at).getTime() - new Date(prev.at).getTime() < 5 * 60000;
        return (
          <div key={m.id}>
            {newDay && <div className="tc-day">{dayLabel(m.at)}</div>}
            <Message m={m} ctx={ctx} cont={cont} showReplies selected={m.id === threadId} />
          </div>
        );
      })}
      {messages.length === 0 && <p className="muted tc-pad">No messages</p>}
    </div>
  );
}

function Message({ m, ctx, cont, showReplies, selected }: { m: ChatMsg; ctx: MsgCtx; cont: boolean; showReplies: boolean; selected?: boolean }) {
  const { call, busy, error } = useApi();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [picker, setPicker] = useState(false);
  const url = `/api/engagements/${ctx.engagementId}/channel`;
  const react = (emoji: string) => call(`r-${emoji}`, url, { json: { op: "reaction.toggle", id: m.id, emoji } });
  const author = m.authorId ? ctx.peopleMap.get(m.authorId) : undefined;
  return (
    <div id={`m-${m.id}`} className={`tc-msg${cont ? " cont" : ""}${m.mentionsMe ? " hl" : ""}${selected ? " sel" : ""}`}>
      {cont ? <span className="tc-gutter" /> : <Avatar id={m.authorId ?? m.id} initials={m.initials} presence={author?.presence} />}
      <div className="tc-mb">
        {!cont && (
          <div className="tc-mh">
            <b>{m.author}</b>
            <When iso={m.at} />
            {m.edited && <span className="muted">Edited</span>}
            {m.pinned && (
              <span className="tc-pinned" title="Pinned">
                <Icon name="pin" size={12} />
              </span>
            )}
          </div>
        )}
        {m.kind === "meeting" && <MeetingCard m={m} />}
        {m.kind === "call" && <CallCard m={m} engagementId={ctx.engagementId} />}
        {m.kind === "text" &&
          (editing ? (
            <form
              className="tc-edit"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await call("edit", url, { json: { op: "message.edit", id: m.id, body: draft } })) setEditing(false);
              }}
            >
              <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus aria-label="Edit message" />
              <div className="toolbar">
                <button type="submit" className="small" disabled={busy !== null || !draft.trim()}>
                  Save
                </button>
                <button type="button" className="secondary small" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            m.body && <Body text={m.body} names={ctx.names} meNames={ctx.meNames} />
          ))}
        {m.files.length > 0 && (
          <div className="chat-files">
            {m.files.map((f) => (
              <ChatFileCard key={f.id} engagementId={ctx.engagementId} file={f} folders={ctx.folders} />
            ))}
          </div>
        )}
        {m.reactions.length > 0 && (
          <div className="tc-reacts">
            {m.reactions.map((r) => (
              <button key={r.emoji} type="button" className={`tc-re${r.mine ? " mine" : ""}`} title={r.names.join(", ")} onClick={() => react(r.emoji)} disabled={busy !== null}>
                {r.emoji} <b>{r.count}</b>
              </button>
            ))}
          </div>
        )}
        {showReplies && m.replies.count > 0 && (
          <Link href={ctx.href({ thread: m.id })} className="tc-replies" scroll={false}>
            <span className="tc-stack">
              {m.replies.authors.map((a, i) => (
                <span key={i} className={`tc-av xs ${AV_COLORS[i % AV_COLORS.length]}`}>
                  {a}
                </span>
              ))}
            </span>
            {m.replies.count} {m.replies.count === 1 ? "reply" : "replies"}
            <When iso={m.replies.lastAt} mode="list" />
          </Link>
        )}
        {error && <span className="error">{error}</span>}
      </div>
      <div className={`tc-hover${picker ? " open" : ""}`}>
        {QUICK_REACTIONS.slice(0, 4).map((e) => (
          <button key={e} type="button" className="tc-ib" aria-label={`React ${e}`} onClick={() => react(e)} disabled={busy !== null}>
            {e}
          </button>
        ))}
        <Pop
          open={picker}
          setOpen={setPicker}
          align="right"
          button={<IconButton icon="smile" label="More reactions" onClick={() => setPicker(!picker)} />}
        >
          <div className="tc-emoji">
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setPicker(false);
                  react(e);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </Pop>
        {showReplies && (
          <Link href={ctx.href({ thread: m.id })} className="tc-ib" aria-label="Reply in thread" title="Reply in thread" scroll={false}>
            <Icon name="reply" size={16} />
          </Link>
        )}
        <IconButton icon="pin" label={m.pinned ? "Unpin" : "Pin"} active={m.pinned} onClick={() => call("pin", url, { json: { op: "message.pin", id: m.id, pinned: !m.pinned } })} />
        {m.mine && m.kind === "text" && (
          <IconButton
            icon="compose"
            label="Edit"
            onClick={() => {
              setDraft(m.body);
              setEditing(true);
            }}
          />
        )}
        {m.mine && <IconButton icon="trash" label="Delete" onClick={() => call("del", url, { json: { op: "message.delete", id: m.id } })} />}
      </div>
    </div>
  );
}

function ThreadLog({ parent, replies, ctx }: { parent: ChatMsg; replies: ChatMsg[]; ctx: MsgCtx }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = replies[replies.length - 1]?.id;
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [last, parent.id]);
  return (
    <div className="tc-scroll tc-log" ref={ref}>
      <div className="tc-parent">
        <Message m={parent} ctx={ctx} cont={false} showReplies={false} />
      </div>
      <div className="tc-count">{replies.length === 1 ? "1 reply" : `${replies.length} replies`}</div>
      {replies.map((m, i) => {
        const prev = replies[i - 1];
        const cont = !!prev && prev.authorId === m.authorId && new Date(m.at).getTime() - new Date(prev.at).getTime() < 5 * 60000;
        return <Message key={m.id} m={m} ctx={ctx} cont={cont} showReplies={false} />;
      })}
    </div>
  );
}

function MeetingCard({ m }: { m: ChatMsg }) {
  const mounted = useMounted();
  const start = m.meta.startsAt ? new Date(m.meta.startsAt) : null;
  const end = start ? new Date(start.getTime() + (m.meta.minutes ?? 30) * 60000) : null;
  const now = Date.now();
  const live = mounted && start && end && start.getTime() - 10 * 60000 <= now && now <= end.getTime();
  const past = mounted && end && now > end.getTime();
  return (
    <div className={`tc-card${live ? " live" : ""}${past ? " past" : ""}`}>
      <Icon name="calendar" size={18} />
      <span className="t">
        <b>
          {live && <i className="tc-live" />}
          {m.meta.title}
        </b>
        <span>
          <When iso={m.meta.startsAt ?? null} mode="full" />
          {mounted && end ? ` – ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}
        </span>
      </span>
      {m.meta.link && !past && (
        <a className={`button small${live ? "" : " secondary"}`} href={m.meta.link} target="_blank" rel="noreferrer">
          Join
        </a>
      )}
    </div>
  );
}

function CallCard({ m, engagementId }: { m: ChatMsg; engagementId: string }) {
  const { call, busy } = useApi();
  const mounted = useMounted();
  const started = new Date(m.at).getTime();
  const ended = m.meta.endedAt ? new Date(m.meta.endedAt).getTime() : null;
  // A call nobody ended is treated as over after four hours.
  const live = mounted && !ended && Date.now() - started < 4 * 3600000;
  const mins = ended ? Math.max(1, Math.round((ended - started) / 60000)) : null;
  return (
    <div className={`tc-card${live ? " live" : " past"}`}>
      <Icon name={m.meta.video ? "video" : "phone"} size={18} />
      <span className="t">
        <b>
          {live && <i className="tc-live" />}
          {m.meta.video ? "Meeting" : "Call"}
        </b>
        <span>{mins ? `${mins} min` : <When iso={m.at} />}</span>
      </span>
      {live && m.meta.link && (
        <a className="button small" href={m.meta.link} target="_blank" rel="noreferrer">
          Join
        </a>
      )}
      {live && (
        <button type="button" className="secondary small" disabled={busy !== null} onClick={() => call("end", `/api/engagements/${engagementId}/channel`, { json: { op: "call.end", id: m.id } })}>
          End
        </button>
      )}
    </div>
  );
}

function CallButton({ engagementId, roomId, video }: { engagementId: string; roomId: string; video: boolean }) {
  const { call, busy, error } = useApi();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [later, setLater] = useState(false);
  return (
    <Pop
      open={open}
      setOpen={(v) => {
        setOpen(v);
        if (!v) setLater(false);
      }}
      align="right"
      button={
        <button type="button" className={video ? "small" : "secondary small"} onClick={() => setOpen(!open)}>
          <Icon name={video ? "video" : "phone"} size={15} />
          {video ? "Meet" : "Call"}
        </button>
      }
    >
      <form
        className="tc-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call("call", `/api/engagements/${engagementId}/channel`, { json: { op: "call.start", roomId, video, link } })) {
            setOpen(false);
            setLink("");
          }
        }}
      >
        {!later && (
          <>
            <input type="text" placeholder="Link" aria-label="Call link" value={link} onChange={(e) => setLink(e.target.value)} autoFocus />
            <button type="submit" className="small" disabled={busy !== null}>
              {video ? "Meet now" : "Start call"}
            </button>
          </>
        )}
        {video && (
          <ScheduleMeeting
            engagementId={engagementId}
            roomId={roomId}
            inline
            onOpen={() => setLater(true)}
            onDone={() => {
              setOpen(false);
              setLater(false);
            }}
          />
        )}
        {error && <span className="error">{error}</span>}
      </form>
    </Pop>
  );
}

function localInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ScheduleMeeting({ engagementId, roomId, inline, onOpen, onDone }: { engagementId: string; roomId: string; inline?: boolean; onOpen?: () => void; onDone?: () => void }) {
  const { call, busy, error } = useApi();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [link, setLink] = useState("");
  const start = () => {
    const d = new Date(Date.now() + 60 * 60000);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
    setWhen(localInput(d));
    setOpen(true);
    onOpen?.();
  };
  const form = (
    <div className="tc-form">
      <input type="text" placeholder="Title" aria-label="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <input type="datetime-local" aria-label="Start" value={when} onChange={(e) => setWhen(e.target.value)} />
      <select aria-label="Length" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
        {[15, 30, 45, 60, 90, 120].map((n) => (
          <option key={n} value={n}>
            {n} min
          </option>
        ))}
      </select>
      <input type="text" placeholder="Link" aria-label="Meeting link" value={link} onChange={(e) => setLink(e.target.value)} />
      <button
        type="button"
        className="small"
        disabled={busy !== null || !title.trim() || !when}
        onClick={async () => {
          const res = await call("meet", `/api/engagements/${engagementId}/channel`, { json: { op: "meeting.add", roomId, title, startsAt: new Date(when).toISOString(), minutes, link } });
          if (res) {
            setOpen(false);
            setTitle("");
            setLink("");
            onDone?.();
          }
        }}
      >
        Schedule
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  );
  if (inline)
    return open ? (
      form
    ) : (
      <button type="button" className="secondary small" onClick={start}>
        <Icon name="calendar" size={15} />
        Schedule
      </button>
    );
  return (
    <Pop
      open={open}
      setOpen={setOpen}
      button={
        <button type="button" className="secondary small" onClick={() => (open ? setOpen(false) : start())}>
          <Icon name="calendar" size={15} />
          Schedule
        </button>
      }
    >
      {form}
    </Pop>
  );
}

function AddPeople({ engagementId, chat, people, meId, href }: { engagementId: string; chat: ChatListItem; people: ChatPerson[]; meId: string; href: MsgCtx["href"] }) {
  const { call, busy, error } = useApi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const others = people.filter((x) => x.id !== meId && !chat.memberIds.includes(x.id));
  return (
    <Pop open={open} setOpen={setOpen} align="right" button={<IconButton icon="addPerson" label="Add people" onClick={() => setOpen(!open)} />}>
      <form
        className="tc-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await call("add", `/api/engagements/${engagementId}/channel`, { json: { op: "chat.add", id: chat.id, userIds: picked } });
          if (res?.id) {
            setOpen(false);
            setPicked([]);
            if (res.id !== chat.id) router.push(href({ room: res.id, tab: "chat", thread: null }));
          }
        }}
      >
        <PeoplePicker people={others} picked={picked} setPicked={setPicked} />
        <button type="submit" className="small" disabled={busy !== null || picked.length === 0}>
          Add
        </button>
        {error && <span className="error">{error}</span>}
      </form>
    </Pop>
  );
}

function GroupMenu({ engagementId, chat }: { engagementId: string; chat: ChatListItem }) {
  const { call, busy, error } = useApi();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(chat.name);
  const url = `/api/engagements/${engagementId}/channel`;
  return (
    <Pop open={open} setOpen={setOpen} align="right" button={<IconButton icon="more" label="Chat options" onClick={() => setOpen(!open)} />}>
      <form
        className="tc-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await call("rename", url, { json: { op: "chat.rename", id: chat.id, name } })) setOpen(false);
        }}
      >
        <input type="text" placeholder="Group name" aria-label="Group name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="small" disabled={busy !== null}>
          Rename
        </button>
        <button
          type="button"
          className="secondary small"
          disabled={busy !== null}
          onClick={async () => {
            if (await call("leave", url, { json: { op: "chat.leave", id: chat.id } })) router.push(`/e/${engagementId}/channel`);
          }}
        >
          Leave chat
        </button>
        {error && <span className="error">{error}</span>}
      </form>
    </Pop>
  );
}

function FilesTab({ engagementId, files }: { engagementId: string; files: SharedFile[] }) {
  return (
    <div className="tc-scroll">
      <table className="grid tc-files">
        <thead>
          <tr>
            <th>Name</th>
            <th>Folder</th>
            <th>Shared by</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id}>
              <td>
                <a href={`/api/engagements/${engagementId}/sources/${f.id}`} target="_blank" rel="noreferrer">
                  {f.filename}
                </a>
              </td>
              <td>{f.pending ? <span className="tag">Unfiled</span> : <Link href={`/e/${engagementId}/files`}>{f.folder || "Files"}</Link>}</td>
              <td>{f.by}</td>
              <td className="mono">
                <When iso={f.at} mode="list" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {files.length === 0 && <p className="muted tc-pad">No files</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composer: @mentions, emoji, files
// ---------------------------------------------------------------------------

function Composer({
  engagementId,
  roomId,
  parentId,
  audience,
  meId,
  placeholder,
  withMeeting,
}: {
  engagementId: string;
  roomId: string;
  parentId?: string;
  audience: ChatPerson[];
  meId: string;
  placeholder: string;
  withMeeting?: boolean;
}) {
  const { call, busy, error, setError } = useApi();
  const [body, setBody] = useState("");
  const [attached, setAttached] = useState<{ id: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [mention, setMention] = useState<{ q: string; at: number } | null>(null);
  const [pick, setPick] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const draftKey = `chat-draft:${roomId}:${parentId ?? ""}`;

  // Unsent drafts survive the live refresh and switching chats.
  useEffect(() => {
    try {
      setBody(sessionStorage.getItem(draftKey) ?? "");
    } catch {
      setBody("");
    }
    setAttached([]);
  }, [draftKey]);
  useEffect(() => {
    try {
      if (body) sessionStorage.setItem(draftKey, body);
      else sessionStorage.removeItem(draftKey);
    } catch {}
  }, [body, draftKey]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [body]);

  const matches = mention ? audience.filter((x) => x.id !== meId && x.name.toLowerCase().includes(mention.q.toLowerCase())).slice(0, 6) : [];

  function track(value: string, caret: number) {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([\p{L}\p{N}]*(?: [\p{L}\p{N}]*)?)$/u.exec(before);
    if (m) {
      setMention({ q: m[2] ?? "", at: caret - (m[2]?.length ?? 0) - 1 });
      setPick(0);
    } else setMention(null);
  }
  function insertMention(x: ChatPerson) {
    if (!mention) return;
    const end = box.current?.selectionStart ?? body.length;
    const next = `${body.slice(0, mention.at)}@${x.name} ${body.slice(end)}`;
    caret.current = mention.at + x.name.length + 2;
    setBody(next);
    setMention(null);
  }
  function insertText(t: string) {
    const el = box.current;
    const s = el?.selectionStart ?? body.length;
    const e = el?.selectionEnd ?? body.length;
    caret.current = s + t.length;
    setBody(body.slice(0, s) + t + body.slice(e));
  }
  // Put the caret after inserted text in the same paint, so fast typing lands in the right place.
  useLayoutEffect(() => {
    if (caret.current === null || !box.current) return;
    box.current.focus();
    box.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [body]);

  async function attach(files: File[]) {
    setUploading((n) => n + files.length);
    for (const file of files) {
      const form = new FormData();
      form.set("file", file);
      form.set("roomId", roomId);
      const res = await fetch(`/api/engagements/${engagementId}/sources`, { method: "POST", body: form }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (res?.ok && data.duplicate) setError(`${file.name} is already in Files.`);
      else if (res?.ok && data.source?.id) setAttached((a) => (a.some((x) => x.id === data.source.id) ? a : [...a, { id: data.source.id, filename: data.source.filename }]));
      else setError(data.error ?? `Couldn't attach ${file.name}.`);
      setUploading((n) => n - 1);
    }
  }

  async function send() {
    if ((!body.trim() && !attached.length) || uploading || busy) return;
    // Clear right away so typing can go on; put the text back if sending fails.
    const sent = body;
    const files = attached;
    setBody("");
    setAttached([]);
    setMention(null);
    const res = await call("post", `/api/engagements/${engagementId}/channel`, { json: { op: "message.post", roomId, parentId, body: sent, sourceIds: files.map((a) => a.id) } });
    if (!res) {
      setBody((now) => (now ? `${sent}\n${now}` : sent));
      setAttached((now) => [...files, ...now]);
    }
  }

  return (
    <form
      className={`tc-composer${over ? " is-over" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        attach([...e.dataTransfer.files]);
      }}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {matches.length > 0 && (
        <div className="tc-mentions" role="listbox" aria-label="Mention">
          {matches.map((x, i) => (
            <button
              key={x.id}
              type="button"
              role="option"
              aria-selected={i === pick}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(x);
              }}
            >
              <Avatar id={x.id} initials={x.initials} presence={x.presence} size="s" />
              {x.name}
              <span className="muted">{x.title}</span>
            </button>
          ))}
        </div>
      )}
      {(attached.length > 0 || uploading > 0) && (
        <div className="composer-files">
          {attached.map((a) => (
            <span key={a.id} className="tag">
              {a.filename}{" "}
              <button type="button" className="x" aria-label={`Remove ${a.filename}`} onClick={() => setAttached(attached.filter((x) => x.id !== a.id))}>
                ×
              </button>
            </span>
          ))}
          {uploading > 0 && <span className="muted">…</span>}
        </div>
      )}
      <textarea
        ref={box}
        rows={1}
        value={body}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          setBody(e.target.value);
          track(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setPick((pick + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              insertMention(matches[pick]!);
              return;
            }
            if (e.key === "Escape") {
              setMention(null);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="tc-tools">
        <IconButton icon="clip" label="Attach" onClick={() => picker.current?.click()} />
        <input
          ref={picker}
          type="file"
          hidden
          multiple
          onChange={(e) => {
            attach([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <IconButton icon="at" label="Mention" onClick={() => insertText(body && !/\s$/.test(body) ? " @" : "@")} />
        <Pop open={emoji} setOpen={setEmoji} button={<IconButton icon="smile" label="Emoji" onClick={() => setEmoji(!emoji)} />}>
          <div className="tc-emoji up">
            {EMOJI.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => {
                  setEmoji(false);
                  insertText(x);
                }}
              >
                {x}
              </button>
            ))}
          </div>
        </Pop>
        {withMeeting && <ScheduleIcon engagementId={engagementId} roomId={roomId} />}
        <span className="grow" />
        {error && <span className="error">{error}</span>}
        <button type="submit" className="tc-send" aria-label="Send" disabled={busy !== null || uploading > 0 || (!body.trim() && !attached.length)}>
          <Icon name="send" size={16} />
        </button>
      </div>
    </form>
  );
}

function ScheduleIcon({ engagementId, roomId }: { engagementId: string; roomId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pop open={open} setOpen={setOpen} button={<IconButton icon="calendar" label="Schedule meeting" onClick={() => setOpen(!open)} />}>
      <div className="tc-up">
        <ScheduleMeeting engagementId={engagementId} roomId={roomId} inline onDone={() => setOpen(false)} />
      </div>
    </Pop>
  );
}
