"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewEngagement() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [title, setTitle] = useState("");
  const [sample, setSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open)
    return (
      <div>
        <button type="button" className="secondary" onClick={() => setOpen(true)}>
          + New case
        </button>
      </div>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
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
        setBusy(false);
        if (!res.ok) return setError(data.error ?? "Something went wrong.");
        router.push(`/e/${data.id}/experts`);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div className="form-grid">
        <label className="field">
          Client (or code name)
          <input type="text" required value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Project Resin" />
        </label>
        <label className="field">
          Case title
          <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} /> Sample data
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create"}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
