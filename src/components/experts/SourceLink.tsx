import Link from "next/link";

/** A takeaway's place in the transcript (e.g. "06:40"), linked to the transcript it came from. */
export function SourceLink({
  engagementId,
  transcripts,
  locator,
}: {
  engagementId: string;
  transcripts: { id: string; kind: "call" | "followup" }[];
  locator: string;
}) {
  const tr = transcripts.find((t) => t.kind === "call") ?? transcripts[0];
  if (!tr) return <span>{locator}</span>;
  return (
    <Link href={`/e/${engagementId}/experts/transcripts?t=${tr.id}`} title="Open the transcript this came from">
      {locator}
    </Link>
  );
}
