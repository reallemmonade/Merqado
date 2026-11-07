"use client";

import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { money, shortDate, STATUS_LABEL, STATUS_ORDER, type Status } from "@/lib/experts/calc";
import type { ExpertRow, ExpertsData } from "@/lib/experts/data";
import { moveBefore } from "@/lib/experts/order";
import { EditableCell, TopicsCell } from "./EditableCell";
import type { ExpertFormValues } from "./ExpertForm";

type Patch = Partial<ExpertFormValues> & { status?: Status };

type Ctx = {
  data: ExpertsData;
  canEdit: boolean;
  canApprove: boolean;
  save: (fields: Patch) => Promise<boolean>;
};

type Column = { key: string; label: string; num?: boolean; cell: (e: ExpertRow, c: Ctx) => ReactNode };

const int = (v: string) => (v === "" ? 0 : Math.max(0, Math.round(Number(v)) || 0));
const dash = (v: string) => (v && v !== "0" ? v : <span className="muted">—</span>);

/** Every column of the full table except the pinned expert name. Users can drag these into any order. */
export const COLUMNS: Column[] = [
  {
    key: "firstName",
    label: "First name",
    cell: (e, c) => (
      <EditableCell
        label="First name"
        value={e.firstName}
        canEdit={c.canEdit}
        onSave={async (v) => (v.trim() ? c.save({ firstName: v.trim() }) : false)}
      />
    ),
  },
  {
    key: "lastName",
    label: "Last name",
    cell: (e, c) => <EditableCell label="Last name" value={e.lastName} canEdit={c.canEdit} onSave={(v) => c.save({ lastName: v.trim() })} />,
  },
  {
    key: "company",
    label: "Company",
    cell: (e, c) => <EditableCell label="Company" value={e.company} canEdit={c.canEdit} onSave={(v) => c.save({ company: v.trim() })} />,
  },
  {
    key: "title",
    label: "Full title",
    cell: (e, c) => (
      <EditableCell label="Full title" value={e.title} canEdit={c.canEdit} style={{ minWidth: 200 }} onSave={(v) => c.save({ title: v.trim() })} />
    ),
  },
  {
    key: "anonTitle",
    label: "Shown in decks as",
    cell: (e, c) => (
      <EditableCell
        label="Shown in decks as"
        value={e.anonOverride ?? ""}
        placeholder={e.anonTitle || "Leave blank for automatic"}
        render={(v) => v || e.anonTitle || <span className="muted">—</span>}
        canEdit={c.canEdit}
        style={{ minWidth: 180 }}
        onSave={(v) => c.save({ anonTitle: v.trim() || null })}
      />
    ),
  },
  {
    key: "type",
    label: "Type",
    cell: (e, c) => (
      <EditableCell
        label="Type"
        kind="select"
        value={e.typeId ?? ""}
        options={[{ value: "", label: "No type" }, ...c.data.types.map((t) => ({ value: t.id, label: t.name }))]}
        render={(v) => c.data.types.find((t) => t.id === v)?.name ?? <span className="muted">No type</span>}
        canEdit={c.canEdit}
        onSave={(v) => c.save({ typeId: v || null })}
      />
    ),
  },
  {
    key: "status",
    label: "Status",
    cell: (e, c) => (
      <EditableCell
        label="Status"
        kind="select"
        value={e.status}
        // Moving an expert out of "proposed" is an approval, which only approvers can do.
        options={[...STATUS_ORDER, "declined" as const].map((s) => ({
          value: s,
          label: STATUS_LABEL[s],
          disabled: !c.canApprove && e.status === "proposed" && s !== "proposed",
        }))}
        render={(v) => <span className={`pill pill-${v}`}>{STATUS_LABEL[v as Status]}</span>}
        canEdit={c.canEdit}
        onSave={(v) => c.save({ status: v as Status })}
      />
    ),
  },
  {
    key: "date",
    label: "Date",
    cell: (e, c) => (
      <EditableCell
        label="Interview date"
        kind="date"
        value={e.interviewDate ?? ""}
        render={(v) => (v ? <span style={{ whiteSpace: "nowrap" }}>{shortDate(v)}</span> : <span className="muted">Not booked</span>)}
        canEdit={c.canEdit}
        onSave={(v) => c.save({ interviewDate: v || null })}
      />
    ),
  },
  {
    key: "network",
    label: "Network",
    cell: (e, c) => <EditableCell label="Network" value={e.network} canEdit={c.canEdit} onSave={(v) => c.save({ network: v.trim() })} />,
  },
  {
    key: "call",
    label: "Call",
    num: true,
    cell: (e, c) => (
      <EditableCell
        label="Call minutes"
        kind="number"
        className="num"
        value={String(e.callMinutes)}
        render={dash}
        canEdit={c.canEdit}
        onSave={(v) => c.save({ callMinutes: int(v) })}
      />
    ),
  },
  {
    key: "followup",
    label: "Follow-up",
    num: true,
    cell: (e, c) => (
      <EditableCell
        label="Follow-up minutes"
        kind="number"
        className="num"
        value={String(e.followupMinutes)}
        render={dash}
        canEdit={c.canEdit}
        onSave={(v) => c.save({ followupMinutes: int(v) })}
      />
    ),
  },
  {
    key: "survey",
    label: "Survey",
    num: true,
    cell: (e, c) => (
      <EditableCell
        label="Survey minutes"
        kind="number"
        className="num"
        value={String(e.surveyMinutes)}
        render={dash}
        canEdit={c.canEdit}
        onSave={(v) => c.save({ surveyMinutes: int(v) })}
      />
    ),
  },
  {
    key: "minutes",
    label: "Minutes",
    num: true,
    cell: (e) => (
      <td className={`num ${e.billed ? "" : "est"}`}>
        {e.billed ? "" : "~"}
        {e.minutes || (e.billed ? 0 : 60)}
      </td>
    ),
  },
  {
    key: "rate",
    label: "Rate / hr",
    num: true,
    cell: (e, c) => (
      <EditableCell
        label="Hourly rate"
        kind="number"
        className="num"
        value={String(e.hourlyRate)}
        render={(v) => (Number(v) ? money(Number(v)) : <span className="muted">—</span>)}
        canEdit={c.canEdit}
        onSave={(v) => c.save({ hourlyRate: int(v) })}
      />
    ),
  },
  {
    key: "honorarium",
    label: "Honorarium",
    num: true,
    cell: (e) => (
      <td className={`num ${e.billed ? "" : "est"}`} style={{ fontWeight: 500 }}>
        {e.status === "declined" ? "—" : (e.billed ? "" : "~") + money(e.honorarium)}
      </td>
    ),
  },
  {
    key: "topics",
    label: "Topics",
    cell: (e, c) => <TopicsCell topicIds={e.topicIds} topics={c.data.topics} canEdit={c.canEdit} onSave={(ids) => c.save({ topicIds: ids })} />,
  },
];

const DEFAULT_COLS = COLUMNS.map((c) => c.key);

function readList(key: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null;
  } catch {
    return null;
  }
}
function writeList(key: string, v: string[] | null) {
  try {
    if (v) window.localStorage.setItem(key, JSON.stringify(v));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage blocked (private window etc.): the layout just won't be remembered.
  }
}

/**
 * The person's own arrangement of the full table (column order and row order), kept in this browser
 * per engagement so it doesn't change anyone else's view.
 */
export function useTableLayout(engagementId: string, expertIds: string[]) {
  const colKey = `merqado:experts:${engagementId}:columns`;
  const rowKey = `merqado:experts:${engagementId}:rows`;
  const [cols, setCols] = useState<string[]>(DEFAULT_COLS);
  const [rowOrder, setRowOrder] = useState<string[] | null>(null);

  useEffect(() => {
    const saved = readList(colKey);
    if (saved) {
      // Keep known columns in the saved order, then add any new columns at the end.
      const known = saved.filter((k) => DEFAULT_COLS.includes(k));
      setCols([...known, ...DEFAULT_COLS.filter((k) => !known.includes(k))]);
    }
    setRowOrder(readList(rowKey));
  }, [colKey, rowKey]);

  const moveColumn = useCallback(
    (from: string, to: string) =>
      setCols((c) => {
        const next = moveBefore(c, from, to);
        writeList(colKey, next);
        return next;
      }),
    [colKey],
  );

  const sortRows = useCallback(
    (rows: ExpertRow[]) => {
      if (!rowOrder) return rows;
      const rank = (id: string) => {
        const i = rowOrder.indexOf(id);
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
      };
      return [...rows].sort((a, b) => rank(a.id) - rank(b.id));
    },
    [rowOrder],
  );

  const moveRow = useCallback(
    (from: string, to: string) => {
      const base = rowOrder ? [...rowOrder, ...expertIds.filter((id) => !rowOrder.includes(id))] : expertIds;
      const next = moveBefore(base, from, to);
      writeList(rowKey, next);
      setRowOrder(next);
    },
    [rowOrder, expertIds, rowKey],
  );

  const reset = useCallback(() => {
    writeList(colKey, null);
    writeList(rowKey, null);
    setCols(DEFAULT_COLS);
    setRowOrder(null);
  }, [colKey, rowKey]);

  const customised = rowOrder !== null || cols.join() !== DEFAULT_COLS.join();
  return { cols, moveColumn, sortRows, moveRow, reset, customised };
}

type Drag = { kind: "col" | "row"; id: string } | null;

export function FullTable({
  rows,
  data,
  sel,
  canEdit,
  canApprove,
  cols,
  onMoveColumn,
  onMoveRow,
  onOpen,
  onPatch,
}: {
  rows: ExpertRow[];
  data: ExpertsData;
  sel: string | null;
  canEdit: boolean;
  canApprove: boolean;
  cols: string[];
  onMoveColumn: (from: string, to: string) => void;
  onMoveRow: (from: string, to: string) => void;
  onOpen: (id: string) => void;
  onPatch: (id: string, fields: Patch) => Promise<boolean>;
}) {
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<string | null>(null);
  const columns = cols.map((k) => COLUMNS.find((c) => c.key === k)).filter((c): c is Column => !!c);

  const end = () => {
    setDrag(null);
    setOver(null);
  };
  // Shared drop-target handlers for a column header or a row.
  const target = (kind: "col" | "row", id: string) => ({
    onDragOver: (ev: React.DragEvent) => {
      if (drag?.kind !== kind) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      if (over !== id) setOver(id);
    },
    onDrop: (ev: React.DragEvent) => {
      if (drag?.kind !== kind) return;
      ev.preventDefault();
      if (kind === "col") onMoveColumn(drag.id, id);
      else onMoveRow(drag.id, id);
      end();
    },
  });
  const source = (kind: "col" | "row", id: string) => ({
    draggable: true,
    onDragStart: (ev: React.DragEvent) => {
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", id);
      setDrag({ kind, id });
    },
    onDragEnd: end,
  });

  return (
    <table className="grid full" style={{ minWidth: 1500 }}>
      <thead>
        <tr>
          <th scope="col" style={{ paddingLeft: 16 }}>
            Expert
          </th>
          {columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              className={[
                c.num ? "num" : "",
                "col-drag",
                drag?.kind === "col" && drag.id === c.key ? "dragging" : "",
                drag?.kind === "col" && over === c.key ? "drop-here" : "",
              ].join(" ")}
              title="Drag to move this column"
              {...source("col", c.key)}
              {...target("col", c.key)}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => {
          const ctx: Ctx = { data, canEdit, canApprove, save: (fields) => onPatch(e.id, fields) };
          const cls = [
            e.id === sel ? "selected" : "",
            drag?.kind === "row" && drag.id === e.id ? "dragging" : "",
            drag?.kind === "row" && over === e.id ? "drop-here" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <tr key={e.id} className={cls || undefined} {...target("row", e.id)}>
              <td style={{ paddingLeft: 4 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                  <span className="row-handle" title="Drag to move this row" aria-hidden="true" {...source("row", e.id)}>
                    ⋮⋮
                  </span>
                  <button type="button" className="linklike" onClick={() => onOpen(e.id)} title="Open details">
                    <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{e.name || "Unnamed"} ›</span>
                  </button>
                </div>
              </td>
              {columns.map((c) => (
                <Fragment key={c.key}>{c.cell(e, ctx)}</Fragment>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
