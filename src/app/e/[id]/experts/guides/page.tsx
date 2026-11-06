import Link from "next/link";
import { RunningGuides } from "@/components/experts/RunningGuides";
import { STATUS_LABEL } from "@/lib/experts/calc";
import { loadExpertsPage } from "@/lib/experts/page";

export default async function ExpertsGuidesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, canEdit } = await loadExpertsPage(id);
  const upcoming = data.experts.filter((e) => e.status !== "declined");
  return (
    <div className="split">
      <div className="primary">
        <RunningGuides engagementId={id} data={data} canEdit={canEdit} />
      </div>
      <aside className="side card" aria-labelledby="eg-h">
        <h2 id="eg-h" style={{ fontSize: 18 }}>
          Guides for each expert
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Open an expert to generate, edit or copy their guide.
        </p>
        {upcoming.map((e) => (
          <div className="row" key={e.id}>
            <Link href={`/e/${id}/experts?expert=${e.id}&tab=guide`}>{e.anonTitle || e.name}</Link>
            <span className="muted" style={{ fontSize: 12 }}>
              {e.guide ? "Guide ready" : "No guide"} · {STATUS_LABEL[e.status]}
            </span>
          </div>
        ))}
        {upcoming.length === 0 && <p className="muted">No experts yet.</p>}
      </aside>
    </div>
  );
}
