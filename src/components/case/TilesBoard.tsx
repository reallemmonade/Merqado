"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";
import { TILE_FRAME_PREFIX } from "@/lib/case/tileEmbed";
import {
  dropTile,
  EMPTY_TILES,
  GRID_COLS,
  GRID_ROWS,
  moveTile,
  parseTiles,
  pathFromDrop,
  removeTile,
  resizeTile,
  sectionOf,
  tidy,
  toggleMain,
  type GridRect,
  type TileMode,
  type TilesState,
} from "@/lib/case/tiles";

type Section = { key: string; label: string; icon: IconName; href: string };

const PHONE = "(max-width: 640px)";
// Each tab keeps its own board (sessionStorage), so two windows can show two layouts; the last board
// anyone changed (localStorage) only seeds a brand-new tab.
const tabKey = (id: string) => `mq-tiles:${id}`;
const lastKey = (id: string) => `mq-tiles-last:${id}`;
function load(id: string): TilesState {
  try {
    return parseTiles(sessionStorage.getItem(tabKey(id))) ?? parseTiles(localStorage.getItem(lastKey(id))) ?? EMPTY_TILES;
  } catch {
    return EMPTY_TILES;
  }
}
function save(id: string, s: TilesState) {
  const json = JSON.stringify(s);
  try {
    sessionStorage.setItem(tabKey(id), json);
    localStorage.setItem(lastKey(id), json);
  } catch {}
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const place = (r: GridRect): React.CSSProperties => ({ left: pct(r.x, GRID_COLS), top: pct(r.y, GRID_ROWS), width: pct(r.w, GRID_COLS), height: pct(r.h, GRID_ROWS) });

type Drag = { id: string; kind: "move" | "size"; cell: { x: number; y: number }; ghost: GridRect };

export function TilesBoard({ engagementId, sections }: { engagementId: string; sections: Section[] }) {
  const [state, setState] = useState<TilesState>(EMPTY_TILES);
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [adding, setAdding] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const base = `/e/${engagementId}`;
  const labelOf = (section: string) => sections.find((s) => s.key === section)?.label ?? section;
  const iconOf = (section: string) => sections.find((s) => s.key === section)?.icon ?? "overview";

  useEffect(() => {
    setState(load(engagementId));
    setReady(true);
    const mq = matchMedia(PHONE);
    const onMq = () => setPhone(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, [engagementId]);

  const update = useCallback(
    (fn: (s: TilesState) => TilesState) =>
      setState((s) => {
        const next = fn(s);
        if (next !== s) save(engagementId, next);
        return next;
      }),
    [engagementId],
  );

  // A page dragged in (a side menu link, or a link from another tab) is shown over the tiles' own pages,
  // which would otherwise swallow the drop.
  useEffect(() => {
    const on = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("text/uri-list")) setDropping(true);
    };
    const off = (e: DragEvent) => {
      if (e.type !== "dragleave" || !e.relatedTarget) setDropping(false);
    };
    window.addEventListener("dragenter", on);
    window.addEventListener("dragleave", off);
    window.addEventListener("dragend", off);
    window.addEventListener("drop", off);
    return () => {
      window.removeEventListener("dragenter", on);
      window.removeEventListener("dragleave", off);
      window.removeEventListener("dragend", off);
      window.removeEventListener("drop", off);
    };
  }, []);

  function cellAt(clientX: number, clientY: number) {
    const b = boardRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(GRID_COLS - 1, Math.floor(((clientX - b.left) / b.width) * GRID_COLS))),
      y: Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(((clientY - b.top) / b.height) * GRID_ROWS))),
    };
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropping(false);
    const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    const path = pathFromDrop(text, engagementId, location.origin);
    if (!path) return;
    let at: number | undefined;
    if (!phone && boardRef.current) {
      const c = cellAt(e.clientX, e.clientY);
      const i = state.tiles.findIndex((t) => t.rect && c.x >= t.rect.x && c.x < t.rect.x + t.rect.w && c.y >= t.rect.y && c.y < t.rect.y + t.rect.h);
      if (i >= 0) at = i;
    }
    update((s) => dropTile(s, path, at));
  }

  function startPointer(e: React.PointerEvent, id: string, kind: Drag["kind"]) {
    if (phone || e.button !== 0) return;
    const t = state.tiles.find((x) => x.id === id);
    if (!t?.rect) return;
    e.preventDefault();
    const start = cellAt(e.clientX, e.clientY);
    const grab = { dx: start.x - t.rect.x, dy: start.y - t.rect.y };
    let cur: Drag = { id, kind, cell: start, ghost: t.rect };
    setDrag(cur);
    const move = (ev: PointerEvent) => {
      const c = cellAt(ev.clientX, ev.clientY);
      const r = t.rect!;
      const ghost =
        kind === "move"
          ? { ...r, x: Math.max(0, Math.min(GRID_COLS - r.w, c.x - grab.dx)), y: Math.max(0, Math.min(GRID_ROWS - r.h, c.y - grab.dy)) }
          : { ...r, w: Math.max(1, c.x - r.x + 1), h: Math.max(1, c.y - r.y + 1) };
      cur = { ...cur, cell: c, ghost };
      setDrag(cur);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      const r = t.rect!;
      if (kind === "move") {
        // Over another tile: swap with it. Otherwise move the tile so the grabbed point stays under the pointer.
        const over = state.tiles.find((o) => o.id !== id && o.rect && cur.cell.x >= o.rect.x && cur.cell.x < o.rect.x + o.rect.w && cur.cell.y >= o.rect.y && cur.cell.y < o.rect.y + o.rect.h);
        update((s) => (over ? moveTile(s, id, cur.cell.x, cur.cell.y) : moveTile(s, id, cur.ghost.x, cur.ghost.y)));
      } else if (cur.ghost.w !== r.w || cur.ghost.h !== r.h) {
        update((s) => resizeTile(s, id, cur.ghost.w, cur.ghost.h));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Follow navigation inside a tile, so a reload brings back the page the tile was on.
  function onFrameLoad(id: string, frame: HTMLIFrameElement) {
    try {
      const loc = frame.contentWindow?.location;
      if (!loc || loc.origin !== location.origin || !loc.pathname.startsWith(base)) return;
      const path = (loc.pathname.slice(base.length) || "/") + loc.search;
      if (!sectionOf(path)) return;
      update((s) => {
        const t = s.tiles.find((x) => x.id === id);
        if (!t || t.path === path || s.tiles.some((x) => x.path === path)) return s;
        return { ...s, tiles: s.tiles.map((x) => (x.id === id ? { ...x, path, section: sectionOf(path)! } : x)) };
      });
    } catch {}
  }

  const setMode = (mode: TileMode) => update((s) => tidy(s, mode));
  const onBoard = new Set(state.tiles.map((t) => t.path));

  return (
    <div className="tiles-page">
      <header className="tiles-head">
        <h1>Tiles</h1>
        <div className="toolbar">
          <div className="pop-wrap">
            <button type="button" className="secondary tiles-add" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
              <Icon name="plus" size={16} />
              Add
            </button>
            {adding && (
              <div className="pop-menu pop-right" role="menu" onMouseLeave={() => setAdding(false)}>
                {sections.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    role="menuitem"
                    disabled={onBoard.has(s.href || "/")}
                    onClick={() => {
                      setAdding(false);
                      update((st) => dropTile(st, s.href || "/"));
                    }}
                  >
                    <Icon name={s.icon} size={16} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!phone && (
            <>
              <div className="seg" role="group" aria-label="Layout">
                <button type="button" aria-pressed={state.mode === "grid"} onClick={() => setMode("grid")}>
                  Grid
                </button>
                <button type="button" aria-pressed={state.mode === "focus"} onClick={() => setMode("focus")}>
                  Focus
                </button>
              </div>
              <button type="button" className="secondary" onClick={() => setMode(state.mode)} disabled={!state.tiles.length}>
                Tidy
              </button>
            </>
          )}
        </div>
      </header>
      <div
        ref={boardRef}
        className={`tiles-board${phone ? " tiles-stack" : ""}${dropping ? " is-dropping" : ""}${drag ? " is-dragging" : ""}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("text/uri-list")) e.preventDefault();
        }}
        onDrop={onDrop}
      >
        {ready && !state.tiles.length && <div className="tiles-empty">No tiles</div>}
        {state.tiles.map((t) => {
          const label = labelOf(t.section);
          const style = phone || !t.rect ? undefined : place(drag?.id === t.id && drag.kind === "size" ? drag.ghost : t.rect);
          return (
            <section key={t.id} className={`tile${drag?.id === t.id ? " is-active" : ""}`} style={style} aria-label={label}>
              <div className="tile-card">
                <div className="tile-head" onPointerDown={(e) => startPointer(e, t.id, "move")}>
                  <Icon name={iconOf(t.section)} size={15} />
                  <span className="tile-name">{label}</span>
                  {state.mode === "focus" && !phone && (
                    <button type="button" className="tile-btn" aria-pressed={!!t.main} aria-label={t.main ? "Unpin from main" : "Pin to main"} title={t.main ? "Unpin" : "Pin"} onPointerDown={(e) => e.stopPropagation()} onClick={() => update((s) => toggleMain(s, t.id))}>
                      <Icon name="pin" size={15} />
                    </button>
                  )}
                  <a className="tile-btn" href={base + t.path} aria-label={`Open ${label}`} title="Open" onPointerDown={(e) => e.stopPropagation()}>
                    <Icon name="up" size={15} />
                  </a>
                  <button type="button" className="tile-btn" aria-label={`Close ${label}`} title="Close" onPointerDown={(e) => e.stopPropagation()} onClick={() => update((s) => tidy(removeTile(s, t.id)))}>
                    <Icon name="close" size={15} />
                  </button>
                </div>
                <iframe className="tile-frame" title={label} name={TILE_FRAME_PREFIX + t.id} src={base + t.path} onLoad={(e) => onFrameLoad(t.id, e.currentTarget)} />
                {!phone && <span className="tile-size" aria-hidden="true" onPointerDown={(e) => startPointer(e, t.id, "size")} />}
              </div>
            </section>
          );
        })}
        {drag?.kind === "move" && <div className="tile-ghost" style={place(drag.ghost)} aria-hidden="true" />}
      </div>
    </div>
  );
}
