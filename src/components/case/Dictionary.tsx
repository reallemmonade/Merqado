"use client";

import { useState } from "react";
import { EditableCell } from "@/components/experts/EditableCell";
import { useApi } from "@/components/experts/useApi";

export interface TermRow {
  id: string;
  term: string;
  category: string;
  definition: string;
  status: "active" | "suggested";
}

export function Dictionary({ engagementId, terms, categories, canEdit }: { engagementId: string; terms: TermRow[]; categories: string[]; canEdit: boolean }) {
  const { call, busy, error } = useApi();
  const url = `/api/engagements/${engagementId}/dictionary`;
  const [cat, setCat] = useState<string>("");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState({ term: "", category: "", definition: "" });
  const active = terms.filter((t) => t.status === "active");
  const suggested = terms.filter((t) => t.status === "suggested");
  const needle = q.trim().toLowerCase();
  const shown = active.filter((t) => (!cat || t.category === cat) && (!needle || `${t.term} ${t.definition}`.toLowerCase().includes(needle)));
  const save = (id: string, field: "term" | "category" | "definition") => async (v: string) => !!(await call(id, url, { json: { op: "update", id, [field]: v } }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="toolbar">
        <nav className="chips" aria-label="Category">
          <button type="button" className="chip" aria-pressed={!cat} onClick={() => setCat("")}>
            All {active.length}
          </button>
          {categories.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c} {active.filter((t) => t.category === c).length}
            </button>
          ))}
        </nav>
        <span className="grow" />
        <input type="search" aria-label="Filter" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180 }} />
        {canEdit && (
          <button type="button" className="secondary small" disabled={busy !== null} onClick={() => call("suggest", url, { json: { op: "suggest" } })}>
            {busy === "suggest" ? "Suggesting…" : "Suggest terms"}
          </button>
        )}
      </div>
      {error && <span className="error">{error}</span>}

      {suggested.length > 0 && (
        <section className="panel">
          <div className="group-head">
            <h2>Suggested</h2>
            <span className="muted" style={{ fontSize: 13 }}>{suggested.length}</span>
          </div>
          <div className="panel-body" style={{ gap: 8 }}>
            {suggested.map((t) => (
              <div key={t.id} className="item" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <strong>{t.term}</strong> <span className="tag">{t.category}</span>
                  <div className="muted" style={{ fontSize: 13 }}>{t.definition}</div>
                </div>
                {canEdit && (
                  <>
                    <button type="button" className="small" disabled={busy !== null} onClick={() => call(t.id, url, { json: { op: "accept", id: t.id } })}>
                      Add
                    </button>
                    <button type="button" className="secondary small" disabled={busy !== null} onClick={() => call(t.id, url, { json: { op: "delete", id: t.id } })}>
                      Dismiss
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="group">
        <div className="scroll-x">
          <table className="grid">
            <thead>
              <tr>
                <th style={{ width: 200 }}>Term</th>
                <th style={{ width: 140 }}>Category</th>
                <th>Definition</th>
                {canEdit && <th style={{ width: 32 }} aria-label="Delete" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>
                    <EditableCell value={t.term} label={`Term ${t.term}`} canEdit={canEdit} onSave={save(t.id, "term")} />
                  </td>
                  <td>
                    <EditableCell value={t.category} label={`Category of ${t.term}`} canEdit={canEdit} onSave={save(t.id, "category")} />
                  </td>
                  <td>
                    <EditableCell value={t.definition} label={`Definition of ${t.term}`} canEdit={canEdit} onSave={save(t.id, "definition")} />
                  </td>
                  {canEdit && (
                    <td>
                      <button type="button" className="x" aria-label={`Delete ${t.term}`} disabled={busy !== null} onClick={() => call(t.id, url, { json: { op: "delete", id: t.id } })}>
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {canEdit && (
                <tr>
                  <td>
                    <input type="text" aria-label="New term" placeholder="Term" value={draft.term} onChange={(e) => setDraft({ ...draft, term: e.target.value })} />
                  </td>
                  <td>
                    <input type="text" aria-label="Category" placeholder="Category" list="dict-cats" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
                    <datalist id="dict-cats">
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        aria-label="Definition"
                        placeholder="Definition"
                        value={draft.definition}
                        style={{ flex: 1 }}
                        onChange={(e) => setDraft({ ...draft, definition: e.target.value })}
                      />
                      <button
                        type="button"
                        className="small"
                        disabled={busy !== null || !draft.term.trim()}
                        onClick={async () => {
                          if (await call("add", url, { json: { op: "add", ...draft } })) setDraft({ term: "", category: "", definition: "" });
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && !canEdit && <p className="muted" style={{ padding: 16 }}>No terms</p>}
      </section>
    </div>
  );
}
