"use client";

// Hover "Copy" button for tables, metric cards and charts. Copies a formatted table
// that pastes cleanly into Gmail / Outlook / Word / PowerPoint, plus a tab-separated
// version that pastes into Excel or Sheets as cells.
//
// Usage:
//   <Copyable tables={[...]}>…a chart…</Copyable>        explicit numbers (charts, tiles)
//   <Copyable title="Customers"><table>…</table></Copyable>  reads the table on screen
//   <div className="copyable"> … <CopyButton inline /> … </div>  put the button anywhere inside

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { readTables } from "@/lib/copy/dom";
import { tablesToClipboard, type CopyTable } from "@/lib/copy/table";

async function writeClipboard(html: string, plain: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    // Fall through to the older copy-event route (e.g. Firefox without ClipboardItem, or no permission).
  }
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData("text/html", html);
    e.clipboardData?.setData("text/plain", plain);
    e.preventDefault();
  };
  document.addEventListener("copy", onCopy);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.removeEventListener("copy", onCopy);
  }
}

export function CopyButton({
  tables,
  title,
  label = "Copy",
  inline = false,
}: {
  /** What to copy. Leave out to copy the table(s) inside the nearest `.copyable` box. */
  tables?: CopyTable[] | (() => CopyTable[]);
  /** Heading for tables read from the screen. */
  title?: string;
  label?: string;
  /** Sit in the normal flow (e.g. in a header strip) instead of floating top-right. */
  inline?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    let list = typeof tables === "function" ? tables() : tables;
    if (!list) {
      const box = ref.current?.closest(".copyable");
      list = box ? readTables(box, title) : [];
    }
    list = list.filter((t) => t.columns.length > 0);
    if (list.length === 0) return;
    const { html, plain } = tablesToClipboard(list);
    setState((await writeClipboard(html, plain)) ? "copied" : "failed");
    setTimeout(() => setState("idle"), 1800);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`secondary small copy-btn${inline ? " inline" : ""}${state !== "idle" ? " shown" : ""}`}
      onClick={copy}
      title="Copy as a table you can paste into an email, Word, PowerPoint or Excel"
      data-copy-skip
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="5" y="5" width="9" height="9" rx="1.5" />
        <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
      </svg>
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Couldn’t copy" : label}</span>
    </button>
  );
}

/** A box that shows a Copy button in its top-right corner on hover. */
export function Copyable({
  tables,
  title,
  label,
  children,
  className,
  style,
}: {
  tables?: CopyTable[] | (() => CopyTable[]);
  title?: string;
  label?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`copyable${className ? ` ${className}` : ""}`} style={style}>
      {children}
      <CopyButton tables={tables} title={title} label={label} />
    </div>
  );
}
