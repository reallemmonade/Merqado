import Link from "next/link";

export interface GptChatRow {
  id: string;
  title: string;
  folder: string;
  shared: boolean;
  mine: boolean;
  owner: string;
  updated: string;
}

/** My chats / Team chats, grouped by folder. */
export function GptList({ engagementId, chats, team, activeId }: { engagementId: string; chats: GptChatRow[]; team: boolean; activeId?: string }) {
  const base = `/e/${engagementId}/gpt`;
  const list = chats.filter((c) => (team ? c.shared : c.mine));
  const folders = [...new Set(list.map((c) => c.folder))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  const q = team ? "?tab=team" : "";
  return (
    <nav className="panel gpt-list" aria-label="Chats">
      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        <Link href={base} className="button-link">
          + New chat
        </Link>
        <div className="seg" style={{ display: "flex" }}>
          <Link href={activeId ? `${base}/${activeId}` : base} className="seg-link" style={{ flex: 1, justifyContent: "center" }} aria-current={!team ? "page" : undefined}>
            My chats
          </Link>
          <Link href={activeId ? `${base}/${activeId}?tab=team` : `${base}?tab=team`} className="seg-link" style={{ flex: 1, justifyContent: "center" }} aria-current={team ? "page" : undefined}>
            Team chats
          </Link>
        </div>
      </div>
      {folders.map((f) => (
        <div key={f || "none"} className="gpt-folder">
          {f && <div className="gpt-folder-name">{f}</div>}
          {list
            .filter((c) => c.folder === f)
            .map((c) => (
              <Link key={c.id} href={`${base}/${c.id}${q}`} aria-current={c.id === activeId ? "page" : undefined}>
                <span className="gpt-title">{c.title}</span>
                <span className="muted" style={{ fontSize: 11 }}>
                  {team ? `${c.owner} · ` : ""}
                  {c.updated}
                </span>
              </Link>
            ))}
        </div>
      ))}
      {list.length === 0 && <p className="muted" style={{ padding: "0 16px 12px" }}>No chats</p>}
    </nav>
  );
}
