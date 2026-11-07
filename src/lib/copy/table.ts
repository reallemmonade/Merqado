// Turns tables and chart numbers into clipboard content that pastes cleanly into
// email (Gmail, Outlook), Word, PowerPoint and spreadsheets.
//
// We put two versions on the clipboard:
//   - text/html: a real table with inline styles (email clients drop <style> tags)
//   - text/plain: tab-separated values, so spreadsheets split it into cells

export type Cell = string | number | null | undefined;

export type CopyTable = {
  /** Shown in bold above the table. */
  title?: string;
  columns: string[];
  rows: Cell[][];
  /** Columns to right-align (indexes). Defaults to columns whose values all look like numbers. */
  numeric?: number[];
  /** Small print under the table, e.g. how a number was worked out. */
  note?: string;
};

const FONT = "Arial, Helvetica, sans-serif";
const BORDER = "1px solid #d0d5dd";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const text = (c: Cell) => (c === null || c === undefined ? "" : String(c));

/** "$1,200", "~60", "45%", "-3", "12 of 20"… anything that reads as a number. */
export function looksNumeric(s: string): boolean {
  const t = s.trim();
  if (!t || t === "—" || t === "–" || t === "-") return false;
  return /^[~≈<>+\-−]?\s*[$€£]?\s*-?[\d,]+(\.\d+)?\s*(%|[kKmM])?$/.test(t);
}

function numericColumns(t: CopyTable): Set<number> {
  if (t.numeric) return new Set(t.numeric);
  const out = new Set<number>();
  t.columns.forEach((_, i) => {
    const vals = t.rows.map((r) => text(r[i]).trim()).filter((v) => v && v !== "—" && v !== "–");
    if (vals.length > 0 && vals.every(looksNumeric)) out.add(i);
  });
  return out;
}

export function tableToHtml(t: CopyTable): string {
  const num = numericColumns(t);
  const cell = (tag: "th" | "td", v: Cell, i: number, extra = "") =>
    `<${tag} style="border:${BORDER};padding:6px 10px;text-align:${num.has(i) ? "right" : "left"};vertical-align:top;${extra}">${escapeHtml(text(v)).replace(/\n/g, "<br>")}</${tag}>`;
  const head = `<tr>${t.columns.map((c, i) => cell("th", c, i, "background:#f2f4f7;font-weight:bold;")).join("")}</tr>`;
  const body = t.rows.map((r) => `<tr>${t.columns.map((_, i) => cell("td", r[i], i)).join("")}</tr>`).join("");
  const title = t.title ? `<p style="font-family:${FONT};font-size:14px;font-weight:bold;margin:0 0 6px;">${escapeHtml(t.title)}</p>` : "";
  const note = t.note ? `<p style="font-family:${FONT};font-size:12px;color:#667085;margin:6px 0 0;">${escapeHtml(t.note)}</p>` : "";
  return (
    `${title}<table style="border-collapse:collapse;font-family:${FONT};font-size:13px;color:#101828;">` +
    `<thead>${head}</thead><tbody>${body}</tbody></table>${note}`
  );
}

/** Spreadsheet-friendly text: tabs between cells, one row per line. */
export function tableToTsv(t: CopyTable): string {
  const clean = (v: Cell) => text(v).replace(/[\t\r\n]+/g, " ").trim();
  const lines = [t.columns.map(clean).join("\t"), ...t.rows.map((r) => t.columns.map((_, i) => clean(r[i])).join("\t"))];
  if (t.title) lines.unshift(clean(t.title));
  if (t.note) lines.push(clean(t.note));
  return lines.join("\n");
}

/** Several tables (e.g. a chart's numbers plus a breakdown) as one paste. */
export function tablesToClipboard(tables: CopyTable[]): { html: string; plain: string } {
  return {
    html: `<div>${tables.map(tableToHtml).join('<p style="margin:0;">&nbsp;</p>')}</div>`,
    plain: tables.map(tableToTsv).join("\n\n"),
  };
}
