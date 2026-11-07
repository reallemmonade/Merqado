import { describe, expect, it } from "vitest";
import { looksNumeric, tableToHtml, tableToTsv, tablesToClipboard } from "./table";

const t = {
  title: "Coverage by type",
  columns: ["Type", "Completed", "Honorarium"],
  rows: [
    ["Customers", 3, "$1,200"],
    ["Competitors <OEM>", 0, "~$450"],
  ],
};

describe("copy tables", () => {
  it("spots numbers", () => {
    for (const s of ["12", "$1,200", "~$450", "45%", "-3", "1.5", "~60"]) expect(looksNumeric(s)).toBe(true);
    for (const s of ["", "—", "Customers", "12 of 20", "Not booked"]) expect(looksNumeric(s)).toBe(false);
  });

  it("makes a tab-separated version for spreadsheets", () => {
    expect(tableToTsv(t)).toBe("Coverage by type\nType\tCompleted\tHonorarium\nCustomers\t3\t$1,200\nCompetitors <OEM>\t0\t~$450");
    expect(tableToTsv({ columns: ["A"], rows: [["line\none\tx"]] })).toBe("A\nline one x");
  });

  it("makes an email-safe HTML table with inline styles and escaping", () => {
    const html = tableToHtml(t);
    expect(html).toContain("<table style=");
    expect(html).toContain("Competitors &lt;OEM&gt;");
    expect(html).not.toContain("<style");
    // numeric columns are right-aligned, text columns left-aligned
    expect(html).toMatch(/text-align:right;vertical-align:top;">\$1,200</);
    expect(html).toMatch(/text-align:left;vertical-align:top;">Customers</);
  });

  it("joins several tables into one paste", () => {
    const out = tablesToClipboard([t, { columns: ["X"], rows: [[1]], note: "n" }]);
    expect(out.plain.split("\n\n")).toHaveLength(2);
    expect(out.html.match(/<table/g)).toHaveLength(2);
  });
});
