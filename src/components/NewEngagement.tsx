"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { emptyOnboarding } from "@/lib/onboarding/model";

const STEPS = ["Name", "Code", "Scope"] as const;

export function NewEngagement() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [clientName, setClientName] = useState("");
  const [title, setTitle] = useState("");
  const [caseCode, setCaseCode] = useState("");
  const [market, setMarket] = useState("");
  const [objective, setObjective] = useState("");
  const [sample, setSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setStep(0);
    setError(null);
  };

  if (!open)
    return (
      <div>
        <button type="button" className="secondary" onClick={() => setOpen(true)}>
          + New case
        </button>
      </div>
    );

  const canNext = step === 0 ? clientName.trim() !== "" && title.trim() !== "" : true;
  const last = step === STEPS.length - 1;

  const create = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/engagements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientName, title, sample }),
    }).catch(() => null);
    if (!res) {
      setBusy(false);
      return setError("Couldn't reach Merqado. Try again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setError(data.error ?? "Something went wrong.");
    }
    const data2 = { ...emptyOnboarding(), market: market.trim(), objective: objective.trim() };
    await fetch(`/api/engagements/${data.id}/onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "save", caseCode: caseCode.trim(), data: data2 }),
    }).catch(() => null);
    setBusy(false);
    router.push(`/e/${data.id}/onboarding`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!last) return setStep(step + 1);
        void create();
      }}
      style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,300px)", gap: 20, alignItems: "start" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6 }} aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} style={{ width: 28, height: 4, borderRadius: 2, background: i <= step ? "var(--accent, #9a4a96)" : "var(--line, #e5e3ee)" }} />
          ))}
        </div>
        {step === 0 && (
          <>
            <label className="field">
              Code name
              <input type="text" required value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Project Resin" />
            </label>
            <label className="field">
              Title
              <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            </label>
            <label className="check">
              <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} /> Sample data
            </label>
          </>
        )}
        {step === 1 && (
          <label className="field">
            Case code
            <input type="text" value={caseCode} onChange={(e) => setCaseCode(e.target.value)} placeholder="CASE000" />
          </label>
        )}
        {step === 2 && (
          <>
            <label className="field">
              Market
              <input type="text" value={market} onChange={(e) => setMarket(e.target.value)} placeholder="Market" />
            </label>
            <label className="field">
              Objective
              <textarea value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Objective" rows={3} />
            </label>
          </>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          {step === 0 ? (
            <button type="button" className="secondary" onClick={reset}>
              Cancel
            </button>
          ) : (
            <button type="button" className="secondary" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button type="submit" disabled={busy || !canNext}>
            {last ? (busy ? "Creating…" : "Create") : "Next →"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 18 }} aria-label="Preview">
        <div style={{ fontSize: 11, color: "var(--muted, #6d6a80)", letterSpacing: ".06em" }}>{caseCode.trim() || "—"}</div>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{clientName.trim() || "Untitled"}</div>
        <dl style={{ display: "grid", gridTemplateColumns: "84px minmax(0,1fr)", gap: "6px 10px", fontSize: 13, margin: 0 }}>
          <dt style={{ color: "var(--muted, #6d6a80)" }}>Title</dt>
          <dd style={{ margin: 0, minWidth: 0 }}>{title.trim() || "—"}</dd>
          <dt style={{ color: "var(--muted, #6d6a80)" }}>Market</dt>
          <dd style={{ margin: 0, minWidth: 0 }}>{market.trim() || "—"}</dd>
          <dt style={{ color: "var(--muted, #6d6a80)" }}>Objective</dt>
          <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{objective.trim() || "—"}</dd>
        </dl>
      </div>
    </form>
  );
}
