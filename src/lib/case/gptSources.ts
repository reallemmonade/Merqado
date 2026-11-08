import type { Snippet } from "./search";

export type SourceKind = Snippet["kind"];

/** The kinds of case material the GPT can answer from, as named in the source filter. */
export const SOURCE_KINDS: { kind: SourceKind; label: string }[] = [
  { kind: "transcript", label: "Transcripts" },
  { kind: "takeaway", label: "KTAs" },
  { kind: "hypothesis", label: "Hypotheses" },
  { kind: "slide", label: "Deck" },
  { kind: "note", label: "Notes" },
  { kind: "chat", label: "Team channel" },
  { kind: "file", label: "Files" },
  { kind: "term", label: "Dictionary" },
  { kind: "task", label: "Workplan" },
];

const ALL = new Set<string>(SOURCE_KINDS.map((s) => s.kind));

/** Reads a comma-separated list of kinds, keeping only known ones. Empty means all. */
export function parseKinds(v: string | null | undefined): SourceKind[] {
  if (!v) return [];
  return [...new Set(v.split(","))].filter((k): k is SourceKind => ALL.has(k));
}
