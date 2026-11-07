"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Kind = "text" | "number" | "date" | "select";

/**
 * A table cell you can click to edit. Enter or clicking away saves, Escape cancels.
 * While the save is on its way the new value is shown, so the table doesn't flicker.
 */
export function EditableCell({
  value,
  label,
  kind = "text",
  options,
  placeholder,
  render,
  canEdit,
  onSave,
  className,
  style,
}: {
  value: string;
  label: string;
  kind?: Kind;
  options?: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  render?: (v: string) => ReactNode;
  canEdit: boolean;
  onSave: (v: string) => Promise<boolean>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState<string | null>(null);
  const done = useRef(false);

  // Once fresh data arrives from the server, drop the optimistic value.
  useEffect(() => setPending(null), [value]);

  const shown = pending ?? value;
  const content = render ? render(shown) : shown || <span className="muted">—</span>;

  if (!canEdit) {
    return (
      <td className={className} style={style}>
        {content}
      </td>
    );
  }

  async function commit(next: string) {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (next === value) return;
    setPending(next);
    const ok = await onSave(next);
    if (!ok) setPending(null);
  }

  const start = () => {
    done.current = false;
    setDraft(shown);
    setEditing(true);
  };

  const common = {
    autoFocus: true,
    "aria-label": label,
    className: "cell-input",
    onBlur: () => commit(draft),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit(draft);
      } else if (e.key === "Escape") {
        done.current = true;
        setEditing(false);
      }
    },
  };

  return (
    <td className={`${className ?? ""} cell-editable`} style={style}>
      {editing ? (
        kind === "select" ? (
          <select
            {...common}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              commit(e.target.value);
            }}
          >
            {options?.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...common}
            type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
            min={kind === "number" ? 0 : undefined}
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        )
      ) : (
        <button type="button" className="cell-edit" title={`Edit ${label.toLowerCase()}`} onClick={start}>
          {content}
        </button>
      )}
    </td>
  );
}

/** Topics cell: click to tick topics on or off, then Done to save. */
export function TopicsCell({
  topicIds,
  topics,
  canEdit,
  onSave,
}: {
  topicIds: string[];
  topics: { id: string; name: string }[];
  canEdit: boolean;
  onSave: (ids: string[]) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(topicIds);
  const names = topicIds
    .map((id) => topics.find((t) => t.id === id)?.name)
    .filter(Boolean)
    .join(", ");

  if (!canEdit) return <td style={{ minWidth: 200 }}>{names}</td>;

  return (
    <td style={{ minWidth: 220 }} className="cell-editable">
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {topics.length === 0 && <span className="muted">No topics</span>}
          {topics.map((t) => (
            <label key={t.id} className="check" style={{ fontSize: 13 }}>
              <input
                type="checkbox"
                checked={draft.includes(t.id)}
                onChange={(e) => setDraft(e.target.checked ? [...draft, t.id] : draft.filter((x) => x !== t.id))}
              />
              {t.name}
            </label>
          ))}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="small"
              onClick={async () => {
                const changed = draft.length !== topicIds.length || draft.some((d) => !topicIds.includes(d));
                if (changed && !(await onSave(draft))) return;
                setEditing(false);
              }}
            >
              Done
            </button>
            <button type="button" className="secondary small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="cell-edit"
          title="Edit topics"
          onClick={() => {
            setDraft(topicIds);
            setEditing(true);
          }}
        >
          {names || <span className="muted">—</span>}
        </button>
      )}
    </td>
  );
}
