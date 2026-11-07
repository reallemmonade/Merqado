"use client";

import { useState } from "react";
import { TRANSCRIPT_ACCEPT } from "@/lib/experts/transcript-text";
import { useApi } from "./useApi";

export function TranscriptUploadForm({ engagementId, experts }: { engagementId: string; experts: { id: string; label: string }[] }) {
  const api = useApi();
  const [expertId, setExpertId] = useState(experts[0]?.id ?? "");
  const [kind, setKind] = useState("call");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  if (!experts.length) return <p className="muted">No experts</p>;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setDone(null);
        const form = new FormData();
        form.set("kind", kind);
        if (file) form.set("file", file);
        else form.set("text", text);
        const res = await api.call("upload", `/api/engagements/${engagementId}/experts/${expertId}/transcripts`, { form });
        if (res?.id) {
          setText("");
          setFile(null);
          setFileKey((k) => k + 1);
          const cleaned = await api.call("clean", `/api/engagements/${engagementId}/transcripts/${res.id}/clean`);
          setDone(
            cleaned
              ? "Uploaded"
              : "Uploaded, cleaning failed",
          );
        }
      }}
      style={{ display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div className="form-grid">
        <label className="field">
          Expert
          <select value={expertId} onChange={(e) => setExpertId(e.target.value)}>
            {experts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          This is the
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="call">Main call</option>
            <option value="followup">Follow-up</option>
          </select>
        </label>
      </div>
      <label className="field">
        File (Word, text, .vtt or .srt)
        <input key={fileKey} type="file" accept={TRANSCRIPT_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {!file && (
        <label className="field">
          Or paste the transcript
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      <div>
        <button type="submit" disabled={api.busy === "upload" || (!file && !text.trim())}>
          {api.busy === "upload" ? "Uploading…" : api.busy === "clean" ? "Cleaning with AI…" : "Upload transcript"}
        </button>
      </div>
      {api.error && <p className="error">{api.error}</p>}
      {done && <p style={{ color: "var(--good)", margin: 0 }}>{done}</p>}
    </form>
  );
}
