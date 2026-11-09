"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** The case GPT bar along the bottom of every case page; asking opens the chat. */
export function GptBar({ engagementId, name }: { engagementId: string; name: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/engagements/${engagementId}/gpt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "new", question: q, shared: true }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Something went wrong.");
    router.push(`/e/${engagementId}/gpt/${data.id}`);
  }

  return (
    <form className="gpt-bar" onSubmit={submit} aria-label={name}>
      <label htmlFor="gpt-bar-input" className="sr-only">
        Ask {name}
      </label>
      <input
        id="gpt-bar-input"
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Ask ${name}`}
        autoComplete="off"
      />
      {error && <span className="error" style={{ fontSize: 12 }}>{error}</span>}
      <kbd>Ctrl /</kbd>
      <button type="submit" aria-label={`Ask ${name}`} disabled={busy || !q.trim()} className="gpt-send">
        {busy ? "…" : "→"}
      </button>
    </form>
  );
}
