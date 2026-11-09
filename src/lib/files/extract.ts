/** Plain text from an uploaded file, for filing, search and the case GPT. Empty when we can't read it. */
export const MAX_TEXT_CHARS = 400_000;

export async function extractText(filename: string, bytes: Uint8Array): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  try {
    let text = "";
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } else if (["txt", "md", "csv", "tsv", "vtt", "srt", "json", "eml"].includes(ext)) {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } else if (ext === "xlsx" || ext === "xlsm") {
      text = await xlsxText(bytes);
    } else if (ext === "pptx") {
      text = await pptxText(bytes);
    }
    return text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_TEXT_CHARS);
  } catch {
    return "";
  }
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

async function zip(bytes: Uint8Array) {
  const JSZip = (await import("jszip")).default;
  return JSZip.loadAsync(bytes);
}

/** Each sheet as "## Sheet" then one tab-separated line per row. */
async function xlsxText(bytes: Uint8Array): Promise<string> {
  const z = await zip(bytes);
  const shared: string[] = [];
  const ss = await z.file("xl/sharedStrings.xml")?.async("string");
  if (ss) for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) ?? []) shared.push(decodeXml((si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
  const wb = (await z.file("xl/workbook.xml")?.async("string")) ?? "";
  const names = [...wb.matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => decodeXml(m[1]!));
  const sheets = Object.keys(z.files)
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const out: string[] = [];
  let total = 0;
  for (const [i, f] of sheets.entries()) {
    const xml = await z.file(f)!.async("string");
    out.push(`## ${names[i] ?? `Sheet ${i + 1}`}`);
    for (const row of xml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
      const cells: string[] = [];
      for (const c of row.match(/<c [^>]*?(\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const inline = c.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
        if (/t="s"/.test(c) && v != null) cells.push(shared[Number(v)] ?? "");
        else if (inline != null) cells.push(decodeXml(inline));
        else if (v != null) cells.push(decodeXml(v));
      }
      const line = cells.filter((x) => x !== "").join("\t");
      if (line) {
        out.push(line);
        total += line.length;
      }
      if (total > MAX_TEXT_CHARS) return out.join("\n");
    }
  }
  return out.join("\n");
}

async function pptxText(bytes: Uint8Array): Promise<string> {
  const z = await zip(bytes);
  const slides = Object.keys(z.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const out: string[] = [];
  for (const [i, f] of slides.entries()) {
    const xml = await z.file(f)!.async("string");
    const paras = (xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? []).map((p) => decodeXml((p.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join(""))).filter(Boolean);
    out.push(`## Slide ${i + 1}`, ...paras);
  }
  return out.join("\n");
}
