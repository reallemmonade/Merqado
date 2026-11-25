"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { hostOf, webUrl } from "@/lib/case/webTiles";

type FrameState = { ok: boolean; blocked: boolean } | null;

/**
 * The body of a web tile: an address bar and the page. A site that refuses to be shown in a frame gets
 * an Open button instead. Only the signed-in app asks the server whether a site allows framing.
 */
export function TileWeb({ url, onNavigate }: { url: string; onNavigate: (next: string) => void }) {
  const [draft, setDraft] = useState(url);
  const [frame, setFrame] = useState<FrameState>(null);

  useEffect(() => {
    setDraft(url);
    setFrame(null);
    let live = true;
    fetch(`/api/web-frame?url=${encodeURIComponent(url)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { ok: false, blocked: false }))
      .then((v: { ok: boolean; blocked: boolean }) => live && setFrame(v))
      .catch(() => live && setFrame({ ok: false, blocked: false }));
    return () => {
      live = false;
    };
  }, [url]);

  const submit = () => {
    const next = webUrl(draft);
    if (next && next !== url) onNavigate(next);
    else setDraft(url);
  };

  return (
    <>
      <div className="tile-url">
        <input
          value={draft}
          aria-label="Address"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          onBlur={() => setDraft(url)}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>
      {frame?.blocked ? (
        <div className="tile-blocked">
          <div className="tile-blocked-site">{hostOf(url)}</div>
          <a className="secondary tile-open" href={url} target="_blank" rel="noopener noreferrer">
            Open
            <Icon name="up" size={14} />
          </a>
        </div>
      ) : (
        <iframe className="tile-frame" title={hostOf(url)} src={url} referrerPolicy="strict-origin-when-cross-origin" allow="clipboard-read; clipboard-write; fullscreen" />
      )}
    </>
  );
}
