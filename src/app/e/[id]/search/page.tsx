import Link from "next/link";
import { CaseShell } from "@/components/case/CaseShell";
import { loadCorpus } from "@/lib/case/corpus";
import { loadCase } from "@/lib/case/page";
import { phraseHits, type Snippet } from "@/lib/case/search";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<Snippet["kind"], string> = {
  transcript: "Transcripts",
  takeaway: "KTAs",
  slide: "Deck",
  note: "Notes",
  chat: "Team channel",
  term: "Dictionary",
  hypothesis: "Hypotheses",
  task: "Workplan",
  file: "Files",
};

export default async function SearchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; kind?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 200);
  const ctx = await loadCase(id, "/search");
  const corpus = q ? await loadCorpus(ctx.db, id, ctx.user) : [];
  const hits = corpus.flatMap((s) => {
    const h = phraseHits(s.text, q);
    return h ? [{ s, h }] : [];
  });
  const kinds = (Object.keys(KIND_LABEL) as Snippet["kind"][]).filter((k) => hits.some((x) => x.s.kind === k));
  const kind = kinds.find((k) => k === sp.kind);
  const shown = kind ? hits.filter((x) => x.s.kind === kind) : hits;
  const total = shown.reduce((a, x) => a + x.h.count, 0);
  const base = `/e/${id}/search?q=${encodeURIComponent(q)}`;

  return (
    <CaseShell ctx={ctx} section="search" title="Keyword search">
      <form method="get" className="toolbar search-form" role="search">
        <label htmlFor="kw" className="sr-only">
          Keyword
        </label>
        <input id="kw" name="q" type="search" defaultValue={q} placeholder="Keyword" autoFocus style={{ flex: 1, minHeight: 44 }} />
        <button type="submit">Search</button>
      </form>
      {q && (
        <div className="toolbar">
          <nav className="chips" aria-label="Filter">
            <Link href={base} aria-current={!kind ? "page" : undefined}>
              All {hits.length}
            </Link>
            {kinds.map((k) => (
              <Link key={k} href={`${base}&kind=${k}`} aria-current={kind === k ? "page" : undefined}>
                {KIND_LABEL[k]} {hits.filter((x) => x.s.kind === k).length}
              </Link>
            ))}
          </nav>
          <span className="grow" />
          <span className="muted mono">{total} matches</span>
        </div>
      )}
      {q && (
        <section className="panel">
          {shown.map(({ s, h }, i) => (
            <Link key={i} href={s.href} className="hit">
              <span className="meta">
                <span className="tag">{KIND_LABEL[s.kind]}</span>
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>{s.label}</span>
                {h.count > 1 && <span>×{h.count}</span>}
              </span>
              <span className="hit-text">
                {h.before}
                <mark>{h.match}</mark>
                {h.after}
              </span>
            </Link>
          ))}
          {shown.length === 0 && <p className="muted" style={{ padding: 16 }}>No matches</p>}
        </section>
      )}
    </CaseShell>
  );
}
