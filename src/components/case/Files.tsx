"use client";

import { useState } from "react";
import { useApi } from "@/components/experts/useApi";

export function FileUpload({ engagementId, folders, folder }: { engagementId: string; folders: string[]; folder: string }) {
  const { call, busy, error } = useApi();
  const [target, setTarget] = useState(folder);
  const [key, setKey] = useState(0);
  return (
    <div className="toolbar">
      <input
        key={key}
        type="file"
        aria-label="File"
        multiple
        disabled={busy !== null}
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          for (const f of files) {
            const form = new FormData();
            form.set("file", f);
            const res = await call("up", `/api/engagements/${engagementId}/sources`, { form });
            if (res?.source?.id && target) await call("mv", `/api/engagements/${engagementId}/files`, { json: { op: "move", sourceId: res.source.id, folder: target } });
          }
          setKey((k) => k + 1);
        }}
      />
      <input type="text" aria-label="Folder" placeholder="Folder" list="file-folders" value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 140 }} />
      <datalist id="file-folders">
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {busy && <span className="muted">Uploading…</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function MoveFile({ engagementId, sourceId, folder }: { engagementId: string; sourceId: string; folder: string }) {
  const { call, busy } = useApi();
  const [value, setValue] = useState(folder);
  return (
    <input
      type="text"
      aria-label="Folder"
      list="file-folders"
      value={value}
      disabled={busy !== null}
      placeholder="Unfiled"
      className="cell-input"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => value !== folder && call("mv", `/api/engagements/${engagementId}/files`, { json: { op: "move", sourceId, folder: value } })}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}
