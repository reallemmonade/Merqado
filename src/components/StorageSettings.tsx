"use client";

import { useState } from "react";
import { useApi } from "@/components/experts/useApi";
import styles from "./StorageSettings.module.css";

/** Where the firm's case files live: Google Drive now; SharePoint and Box later. */
export function StorageSettings({
  isAdmin,
  error,
  drive,
  other,
}: {
  isAdmin: boolean;
  error: string | null;
  drive: { folderName: string; folderUrl: string; account: string } | null;
  other: string | null;
}) {
  const { call, busy, error: apiError } = useApi();
  const [link, setLink] = useState("");
  const builtIn = !drive && !other;

  const cards: { name: string; state: string; on: boolean; action?: React.ReactNode }[] = [
    {
      name: "Google Drive",
      state: drive ? "Connected" : isAdmin ? "" : "Off",
      on: !!drive,
      action:
        isAdmin &&
        (drive ? (
          <a className="secondary-link" href="/api/storage/google/start">
            Reconnect
          </a>
        ) : (
          <a className="connect-link" href="/api/storage/google/start">
            Connect
          </a>
        )),
    },
    { name: "SharePoint / OneDrive", state: "Soon", on: false },
    { name: "Box", state: "Soon", on: false },
    { name: other ?? "Merqado", state: other ? "Connected" : builtIn ? "In use" : "", on: !!other || builtIn },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {(error || apiError) && <p className="error">{error ?? apiError}</p>}
      <div className={`storage-cards ${styles.cards}`}>
        {cards.map((c) => (
          <div key={c.name} className={`card storage-card${c.on ? " on" : ""}`}>
            <strong>{c.name}</strong>
            {c.state && <span className={`tag${c.on ? " tag-good" : ""}`}>{c.state}</span>}
            {c.action}
          </div>
        ))}
      </div>

      {drive && (
        <section className="card storage-rows">
          <div className="storage-row">
            <span className="muted">Folder</span>
            <a href={drive.folderUrl} target="_blank" rel="noreferrer">
              {drive.folderName}
            </a>
          </div>
          {drive.account && (
            <div className="storage-row">
              <span className="muted">Account</span>
              <span>{drive.account}</span>
            </div>
          )}
          {isAdmin && (
            <form
              className="storage-row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await call("root", "/api/storage/settings", { json: { op: "root", link } })) setLink("");
              }}
            >
              <label className="muted" htmlFor="drive-folder">
                Move to folder
              </label>
              <div className="toolbar" style={{ flex: 1 }}>
                <input id="drive-folder" type="url" placeholder="Folder link" value={link} onChange={(e) => setLink(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
                <button type="submit" className="small" disabled={busy !== null || !link.trim()}>
                  Save
                </button>
              </div>
            </form>
          )}
          {isAdmin && (
            <div className="storage-row">
              <span />
              <button type="button" className="secondary small" disabled={busy !== null} onClick={() => {
                  if (confirm("Disconnect Google Drive?")) call("off", "/api/storage/settings", { json: { op: "disconnect" } });
                }}>
                Disconnect
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
