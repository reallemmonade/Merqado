/** Turns an uploaded transcript file into plain text. Word, text, Markdown and caption files. */
export const TRANSCRIPT_ACCEPT = ".txt,.md,.vtt,.srt,.docx";
export const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024;

export async function transcriptText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) });
    return cleanTranscript(value);
  }
  if (/\.(txt|md|vtt|srt)$/.test(name)) {
    return cleanTranscript(await file.text(), /\.(vtt|srt)$/.test(name));
  }
  throw new Error("Upload a Word (.docx), text (.txt), Markdown or caption (.vtt, .srt) file.");
}

/** Light cleanup: normalizes line endings, drops caption cue numbers and timing lines. */
export function cleanTranscript(text: string, captions = false): string {
  let lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (captions) {
    lines = lines.filter(
      (l) => !/^WEBVTT/.test(l) && !/^\d+$/.test(l.trim()) && !/-->/.test(l),
    );
  }
  return lines
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
