import Link from "next/link";
import { inArray } from "drizzle-orm";
import { CaseShell } from "@/components/case/CaseShell";
import { NoteForm, NoteItem, type NoteRow } from "@/components/case/Notes";
import { users } from "@/db/schema";
import { loadNotes, loadWorkplan } from "@/lib/case/data";
import { loadCase } from "@/lib/case/page";
import { shortDate } from "@/lib/case/progress";

export const dynamic = "force-dynamic";

export default async function NotesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const byDay = sp.view === "day";
  const ctx = await loadCase(id, "/notes");
  const { db, user } = ctx;
  const [notes, wp] = await Promise.all([loadNotes(db, id, user.id), loadWorkplan(db, id)]);
  const authorIds = [...new Set(notes.map((n) => n.createdBy).filter((x): x is string => !!x))];
  const authors = authorIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds)) : [];
  const nameOf = new Map(authors.map((a) => [a.id, a.name]));

  const rows = notes.map((n) => {
    const iso = n.createdAt ? n.createdAt.toISOString().slice(0, 10) : "";
    const row: NoteRow = {
      id: n.id,
      kind: n.kind,
      body: n.body,
      origin: n.origin,
      link: n.link,
      isPrivate: n.isPrivate,
      resolved: n.resolved,
      author: (n.createdBy && nameOf.get(n.createdBy)) || "",
      date: shortDate(iso),
      canChange: n.createdBy === user.id || ctx.canEdit,
    };
    return { row, iso, moduleId: n.moduleId };
  });

  const groups: { key: string; title: string; items: NoteRow[] }[] = byDay
    ? [...new Set(rows.map((r) => r.iso))].map((d) => ({ key: d, title: shortDate(d) || "Undated", items: rows.filter((r) => r.iso === d).map((r) => r.row) }))
    : [
        ...wp.modules.map((m) => ({ key: m.id, title: m.name, items: rows.filter((r) => r.moduleId === m.id).map((r) => r.row) })),
        { key: "none", title: "General", items: rows.filter((r) => !r.moduleId || !wp.modules.some((m) => m.id === r.moduleId)).map((r) => r.row) },
      ].filter((g) => g.items.length > 0);

  const pinned = rows.filter((r) => r.row.link);
  const base = `/e/${id}/notes`;

  return (
    <CaseShell
      ctx={ctx}
      section="notes"
      title="Notes"
      actions={
        <nav className="seg" aria-label="Group by">
          <Link href={base} className="seg-link" aria-current={!byDay ? "page" : undefined}>
            By topic
          </Link>
          <Link href={`${base}?view=day`} className="seg-link" aria-current={byDay ? "page" : undefined}>
            By day
          </Link>
        </nav>
      }
    >
      <div className="split">
        <div className="primary">
          <NoteForm engagementId={id} modules={wp.modules.map((m) => ({ id: m.id, name: m.name }))} />
          {groups.map((g) => (
            <section key={g.key} className="panel">
              <div className="group-head">
                <h2>{g.title}</h2>
                <span className="muted" style={{ fontSize: 13 }}>{g.items.length}</span>
              </div>
              <div className="panel-body" style={{ gap: 8 }}>
                {g.items.map((n) => (
                  <NoteItem key={n.id} engagementId={id} n={n} />
                ))}
              </div>
            </section>
          ))}
          {groups.length === 0 && <p className="muted">No notes</p>}
        </div>
        <aside className="side">
          <section className="card">
            <h2 style={{ fontSize: 16 }}>Pinned</h2>
            {pinned.map(({ row }) => (
              <Link key={row.id} href={row.link!} className="item" style={{ color: "inherit", textDecoration: "none" }}>
                <span className="meta">
                  <span>{row.origin}</span>
                  <span>{row.date}</span>
                </span>
                <span className="clamp">{row.body}</span>
              </Link>
            ))}
            {pinned.length === 0 && <p className="muted">None</p>}
          </section>
        </aside>
      </div>
    </CaseShell>
  );
}
