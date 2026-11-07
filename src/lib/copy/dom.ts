// Reads tables that are already on screen into CopyTable form (browser only).
import type { CopyTable } from "./table";

const BLOCKISH = /^(block|flex|grid|list-item|table|flow-root)$/;

/** Visible text of a cell, with stacked lines (e.g. title over name) joined by " · ". */
export function cellText(el: Element): string {
  const lines: string[] = [""];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      lines[lines.length - 1] += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.hidden || node.getAttribute("aria-hidden") === "true" || node.hasAttribute("data-copy-skip")) return;
    if (node.matches(".sr-only, svg, script, style")) return;
    if (node instanceof HTMLInputElement) {
      if (node.type === "checkbox" || node.type === "radio") {
        if (!node.checked) return;
      } else {
        lines[lines.length - 1] += node.value;
        return;
      }
    }
    if (node instanceof HTMLSelectElement) {
      lines[lines.length - 1] += node.selectedOptions[0]?.text ?? "";
      return;
    }
    const block = BLOCKISH.test(getComputedStyle(node).display);
    if (block) lines.push("");
    node.childNodes.forEach(walk);
    if (block) lines.push("");
  };
  el.childNodes.forEach(walk);
  return lines
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
}

export function readTable(table: HTMLTableElement, title?: string): CopyTable {
  const rows = [...table.rows].filter((r) => !r.hidden && r.getAttribute("aria-hidden") !== "true");
  const headRows = rows.filter((r) => r.parentElement?.tagName === "THEAD");
  const bodyRows = rows.filter((r) => r.parentElement?.tagName !== "THEAD");
  const header = headRows[headRows.length - 1] ?? bodyRows.shift();
  const columns = header ? [...header.cells].map(cellText) : [];
  return {
    title: title || table.caption?.textContent?.trim() || undefined,
    columns,
    rows: bodyRows.map((r) => [...r.cells].map(cellText)),
  };
}

/** Every table inside a container. */
export function readTables(container: Element, title?: string): CopyTable[] {
  return [...container.querySelectorAll("table")].map((t) => readTable(t, title));
}
