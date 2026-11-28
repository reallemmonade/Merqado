"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** The person's own OpenAI key, used for dictation in the desktop app. */
export function OpenAIKeySetting({ tail }: { tail: string | null }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/me/openai-key", {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify({ key }) : undefined,
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't save.");
    setKey("");
    router.refresh();
  }

  return (
    <div className="field">
      <label htmlFor="openai-key">OpenAI key</label>
      {tail ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <code>sk-…{tail}</code>
          <span style={{ flex: 1 }} />
          <button type="button" className="small secondary" disabled={busy} onClick={() => send("DELETE")}>
            Remove
          </button>
        </div>
      ) : (
        <form
          style={{ display: "flex", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) send("POST");
          }}
        >
          <input id="openai-key" type="password" autoComplete="off" placeholder="sk-…" value={key} onChange={(e) => setKey(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button type="submit" disabled={busy || !key.trim()}>
            Save
          </button>
        </form>
      )}
      {error && (
        <p className="error" role="alert" style={{ fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
