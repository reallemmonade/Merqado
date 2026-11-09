"use client";

import { useState } from "react";
import type { ExpertsData } from "@/lib/experts/data";
import { useApi } from "./useApi";

type Api = ReturnType<typeof useApi>;

export function SetupView({
  engagementId,
  data,
  startsOn,
  endsOn,
  canEdit,
}: {
  engagementId: string;
  data: ExpertsData;
  startsOn: string | null;
  endsOn: string | null;
  canEdit: boolean;
}) {
  const api = useApi();
  const url = `/api/engagements/${engagementId}/expert-setup`;
  const send = (key: string, json: Record<string, unknown>) => api.call(key, url, { json });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16 }}>
      <NamedTargets
        title="Interviewee types"
        kind="type"
        rows={data.types.map((t) => ({ id: t.id, name: t.name, target: t.target }))}
        placeholder="Customers"
        canEdit={canEdit}
        send={send}
        api={api}
      />
      <NamedTargets
        title="Topics"
        kind="topic"
        rows={data.topics.map((t) => ({ id: t.id, name: t.name, target: t.target }))}
        placeholder="Pricing power"
        canEdit={canEdit}
        send={send}
        api={api}
      />
      <Hypotheses rows={data.hypotheses} canEdit={canEdit} send={send} api={api} />
      <Budget
        total={data.budget.total}
        planned={data.budget.plannedInterviews}
        startsOn={startsOn}
        endsOn={endsOn}
        canEdit={canEdit}
        send={send}
        api={api}
      />
      {api.error && <p className="error">{api.error}</p>}
    </div>
  );
}

function NamedTargets({
  title,
  kind,
  rows,
  placeholder,
  canEdit,
  send,
  api,
}: {
  title: string;
  kind: "type" | "topic";
  rows: { id: string; name: string; target: number }[];
  placeholder: string;
  canEdit: boolean;
  send: (key: string, json: Record<string, unknown>) => Promise<unknown>;
  api: Api;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState(kind === "topic" ? "5" : "");
  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>{title}</h2>
      {rows.map((r) => (
        <Row key={r.id} kind={kind} row={r} canEdit={canEdit} send={send} />
      ))}
      {canEdit && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await send(`add-${kind}`, { kind, name, target: Number(target) || 0 });
            if (ok) setName("");
          }}
          style={{ display: "flex", gap: 8 }}
        >
          <label className="sr-only" htmlFor={`new-${kind}`}>
            New {kind}
          </label>
          <input id={`new-${kind}`} type="text" required placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "1 1 auto", minWidth: 0 }} />
          <label className="sr-only" htmlFor={`new-${kind}-t`}>
            Target
          </label>
          <input id={`new-${kind}-t`} type="number" min={0} placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)} style={{ flex: "0 0 72px", width: 72 }} />
          <button type="submit" disabled={api.busy === `add-${kind}`}>
            Add
          </button>
        </form>
      )}
    </section>
  );
}

function Row({
  kind,
  row,
  canEdit,
  send,
}: {
  kind: "type" | "topic";
  row: { id: string; name: string; target: number };
  canEdit: boolean;
  send: (key: string, json: Record<string, unknown>) => Promise<unknown>;
}) {
  const [name, setName] = useState(row.name);
  const [target, setTarget] = useState(String(row.target));
  const dirty = name !== row.name || target !== String(row.target);
  if (!canEdit)
    return (
      <div className="row">
        <span>{row.name}</span>
        <span className="muted">target {row.target}</span>
      </div>
    );
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <label className="sr-only" htmlFor={`n-${row.id}`}>
        Name
      </label>
      <input id={`n-${row.id}`} type="text" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "1 1 auto", minWidth: 0 }} />
      <label className="sr-only" htmlFor={`t-${row.id}`}>
        Target
      </label>
      <input id={`t-${row.id}`} type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} style={{ flex: "0 0 72px", width: 72 }} />
      {dirty && (
        <button type="button" className="small" onClick={() => send(`s-${row.id}`, { kind, id: row.id, name, target: Number(target) || 0 })}>
          Save
        </button>
      )}
      <button type="button" className="secondary small" onClick={() => send(`d-${row.id}`, { kind: "delete", what: kind, id: row.id })}>
        Remove
      </button>
    </div>
  );
}

function Hypotheses({
  rows,
  canEdit,
  send,
  api,
}: {
  rows: ExpertsData["hypotheses"];
  canEdit: boolean;
  send: (key: string, json: Record<string, unknown>) => Promise<unknown>;
  api: Api;
}) {
  const [statement, setStatement] = useState("");
  const [slideRef, setSlideRef] = useState("");
  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Hypotheses</h2>
      {rows.map((h) => (
        <div className="row" key={h.id}>
          <span>
            {h.slideRef && <span className="muted">{h.slideRef} · </span>}
            {h.statement}
          </span>
          {canEdit && (
            <button type="button" className="secondary small" onClick={() => send(`d-${h.id}`, { kind: "delete", what: "hypothesis", id: h.id })}>
              Remove
            </button>
          )}
        </div>
      ))}
      {canEdit && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await send("add-h", { kind: "hypothesis", statement, slideRef });
            if (ok) {
              setStatement("");
              setSlideRef("");
            }
          }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <label className="sr-only" htmlFor="new-h-ref">
            Slide
          </label>
          <input id="new-h-ref" type="text" placeholder="Slide 4" value={slideRef} onChange={(e) => setSlideRef(e.target.value)} style={{ flex: "0 1 100px" }} />
          <label className="sr-only" htmlFor="new-h">
            Hypothesis
          </label>
          <input id="new-h" type="text" required placeholder="Hypothesis" value={statement} onChange={(e) => setStatement(e.target.value)} style={{ flex: "1 1 220px" }} />
          <button type="submit" disabled={api.busy === "add-h"}>
            Add
          </button>
        </form>
      )}
    </section>
  );
}

function Budget({
  total,
  planned,
  startsOn,
  endsOn,
  canEdit,
  send,
  api,
}: {
  total: number;
  planned: number;
  startsOn: string | null;
  endsOn: string | null;
  canEdit: boolean;
  send: (key: string, json: Record<string, unknown>) => Promise<unknown>;
  api: Api;
}) {
  const [t, setT] = useState(String(total || ""));
  const [p, setP] = useState(String(planned || ""));
  const [s, setS] = useState(startsOn ?? "");
  const [e, setE] = useState(endsOn ?? "");
  return (
    <section className="card">
      <h2 style={{ fontSize: 18 }}>Budget and timing</h2>
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          await send("budget", { kind: "budget", total: Number(t) || 0, plannedInterviews: Number(p) || 0 });
          await send("dates", { kind: "dates", startsOn: s || null, endsOn: e || null });
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div className="form-grid">
          <label className="field">
            Case budget ($)
            <input type="number" min={0} value={t} disabled={!canEdit} onChange={(x) => setT(x.target.value)} />
          </label>
          <label className="field">
            Planned interviews
            <input type="number" min={0} value={p} disabled={!canEdit} onChange={(x) => setP(x.target.value)} />
          </label>
          <label className="field">
            Case starts
            <input type="date" value={s} disabled={!canEdit} onChange={(x) => setS(x.target.value)} />
          </label>
          <label className="field">
            Case ends
            <input type="date" value={e} disabled={!canEdit} onChange={(x) => setE(x.target.value)} />
          </label>
        </div>
        {canEdit && (
          <div>
            <button type="submit" disabled={!!api.busy}>
              Save
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
