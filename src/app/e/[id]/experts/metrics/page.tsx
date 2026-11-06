import Link from "next/link";
import { DeleteExpense, ExpenseForm } from "@/components/experts/ExpenseForm";
import { budgetSummary, coverage, elapsedShare, money } from "@/lib/experts/calc";
import { loadExpertsPage } from "@/lib/experts/page";

const pct = (n: number, d: number) => (d > 0 ? `${Math.max(0, (n / d) * 100)}%` : "0%");
const CATEGORY_LABEL: Record<string, string> = { meals: "Meals", travel: "Cabs and travel", ai_tools: "AI tools", other: "Other" };

export default async function ExpertsMetricsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, engagement, canEdit } = await loadExpertsPage(id);
  const live = data.experts.filter((e) => e.status !== "declined");

  const typeRows = data.types.map((t) => ({ ...t, cov: coverage(data.experts.filter((e) => e.typeId === t.id).map((e) => e.status), t.target) }));

  const b = budgetSummary({
    total: data.budget.total,
    plannedInterviews: data.budget.plannedInterviews,
    experts: data.experts,
    expenses: data.expenses,
    elapsedShare: elapsedShare(engagement.startsOn, engagement.endsOn),
  });
  const scale = Math.max(b.total, b.projected, b.spent + b.booked, 1) * 1.04;
  const over = b.projected - b.total;

  const discussedBy = (topicId: string) =>
    new Set(data.transcripts.filter((t) => t.discussedTopicIds.includes(topicId)).map((t) => t.expertId)).size;
  const topicRows = data.topics.map((t) => ({
    ...t,
    tagged: live.filter((e) => e.topicIds.includes(t.id)).length,
    discussed: discussedBy(t.id),
  }));
  const topicMax = Math.max(1, ...topicRows.map((t) => Math.max(t.tagged, t.target)));
  const setupLink = <Link href={`/e/${id}/experts/setup`}>Case setup</Link>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: 16 }}>
        <section className="card" aria-labelledby="cov-h">
          <h2 id="cov-h" style={{ fontSize: 18 }}>
            Coverage by type
          </h2>
          <div className="legend">
            <span><i className="seg-completed" />Completed</span>
            <span><i className="seg-scheduled" />Scheduled</span>
            <span><i className="seg-approved" />Approved</span>
            <span><i className="seg-proposed" />Proposed</span>
            <span><i style={{ background: "var(--track)" }} />Still needed</span>
          </div>
          {typeRows.length === 0 && <p className="muted">Add interviewee types and targets in {setupLink}.</p>}
          {typeRows.map((t) => {
            const inMotion = t.cov.scheduled + t.cov.approved + t.cov.proposed;
            const target = Math.max(t.target, t.cov.completed + inMotion, 1);
            return (
              <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                  <strong style={{ fontWeight: 500 }}>{t.name}</strong>
                  <span className="muted">
                    {t.cov.completed} done · {inMotion} in motion{t.target ? ` · target ${t.target}` : ""}
                  </span>
                </div>
                <div
                  className="covbar big"
                  role="img"
                  aria-label={`${t.name}: ${t.cov.completed} completed, ${t.cov.scheduled} scheduled, ${t.cov.approved} approved, ${t.cov.proposed} proposed, target ${t.target}`}
                >
                  <span className="seg-completed" style={{ width: pct(t.cov.completed, target) }} />
                  <span className="seg-scheduled" style={{ width: pct(t.cov.scheduled, target) }} />
                  <span className="seg-approved" style={{ width: pct(t.cov.approved, target) }} />
                  <span className="seg-proposed" style={{ width: pct(t.cov.proposed, target) }} />
                </div>
              </div>
            );
          })}
        </section>

        <section className="card" aria-labelledby="budget-h">
          <h2 id="budget-h" style={{ fontSize: 18 }}>
            Case budget
          </h2>
          {b.total === 0 ? (
            <p className="muted">Set the case budget and planned interviews in {setupLink}.</p>
          ) : (
            <>
              <div className="tiles">
                <div><div className="muted" style={{ fontSize: 12 }}>Total budget</div><div className="tile-value" style={{ fontSize: 20 }}>{money(b.total)}</div></div>
                <div><div className="muted" style={{ fontSize: 12 }}>Spent so far</div><div className="tile-value" style={{ fontSize: 20 }}>{money(b.spent)}</div></div>
                <div><div className="muted" style={{ fontSize: 12 }}>Remaining</div><div className="tile-value" style={{ fontSize: 20 }}>{money(b.remaining)}</div></div>
                <div><div className="muted" style={{ fontSize: 12 }}>Projected</div><div className="tile-value" style={{ fontSize: 20, color: over > 0 ? "var(--bad)" : undefined }}>{money(b.projected)}</div></div>
              </div>
              <div
                className="budget-bar"
                role="img"
                aria-label={`Honoraria ${money(b.honorariaPaid)}, expenses ${money(b.expenses)}, AI tools ${money(b.aiTools)}, booked ${money(b.booked)}, of ${money(b.total)}; projected ${money(b.projected)}`}
              >
                <span style={{ width: pct(b.honorariaPaid, scale), background: "var(--st-completed)", borderRadius: "6px 0 0 6px" }} />
                <span style={{ width: pct(b.expenses, scale), background: "#0f8a8a" }} />
                <span style={{ width: pct(b.aiTools, scale), background: "#7a4fb4" }} />
                <span style={{ width: pct(b.booked, scale), background: "repeating-linear-gradient(135deg, var(--st-scheduled) 0 6px, var(--st-approved) 6px 12px)" }} />
                <span aria-hidden="true" style={{ position: "absolute", left: pct(b.total, scale), top: -6, bottom: -6, width: 2, background: "var(--ink)" }} />
                <span aria-hidden="true" style={{ position: "absolute", left: pct(b.projected, scale), top: -6, bottom: -6, borderLeft: "2px dashed var(--bad)" }} />
              </div>
              <div className="legend">
                <span><i style={{ background: "var(--st-completed)" }} />Honoraria paid {money(b.honorariaPaid)}</span>
                <span><i style={{ background: "#0f8a8a" }} />Expenses {money(b.expenses)}</span>
                <span><i style={{ background: "#7a4fb4" }} />AI tools {money(b.aiTools)}</span>
                <span><i style={{ background: "var(--st-scheduled)" }} />Booked, not billed {money(b.booked)}</span>
                <span><i style={{ background: "var(--ink)", width: 2 }} />Budget</span>
                <span><i style={{ borderLeft: "2px dashed var(--bad)", width: 0 }} />Projected</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: over > 0 ? "var(--bad)" : "var(--good)", fontWeight: 600 }}>
                {over > 0 ? `Projected ${money(over)} over budget` : `Projected ${money(-over)} under budget`}
              </p>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Spent {money(b.spent)} + booked {money(b.booked)} + proposed {money(b.proposed)} + {b.futureInterviews} more planned
                interviews at the {money(b.averageHonorarium)} average ({money(b.futureInterviewCost)})
                {b.futureExpenses > 0
                  ? ` + expenses and AI at the pace so far (${money(b.futureExpenses)})`
                  : engagement.startsOn && engagement.endsOn
                    ? ""
                    : ". Add the case start and end dates in Case setup to project expenses too"}
                .
              </p>
            </>
          )}
          <details>
            <summary style={{ cursor: "pointer" }}>Expenses ({data.expenses.length})</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {data.expenses.map((x) => (
                <div className="row" key={x.id}>
                  <span>
                    {CATEGORY_LABEL[x.category]}
                    {x.description ? ` · ${x.description}` : ""}
                    {x.spentOn ? <span className="muted"> · {x.spentOn}</span> : null}
                  </span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {money(x.amount)}
                    {canEdit && <DeleteExpense engagementId={id} id={x.id} />}
                  </span>
                </div>
              ))}
              {canEdit && <ExpenseForm engagementId={id} />}
            </div>
          </details>
        </section>
      </div>

      <section className="card" aria-labelledby="topic-h">
        <h2 id="topic-h" style={{ fontSize: 18 }}>
          Topic coverage
        </h2>
        <div className="legend">
          <span><i style={{ background: "var(--st-approved)", border: "1px solid var(--st-scheduled)" }} />Experts with this expertise</span>
          <span><i style={{ background: "var(--st-completed)" }} />Actually discussed it (from transcripts)</span>
          <span><i style={{ background: "var(--ink)", width: 2 }} />Target</span>
        </div>
        {topicRows.length === 0 && <p className="muted">Add the case topics in {setupLink}.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: "14px 40px" }}>
          {topicRows.map((t) => (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 170px) minmax(0, 1fr) 64px", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</span>
              <div role="img" aria-label={`${t.name}: ${t.tagged} experts tagged, ${t.discussed} discussed it, target ${t.target}`} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ height: 12, width: pct(t.tagged, topicMax), background: "var(--st-approved)", border: "1px solid var(--st-scheduled)", borderRadius: 3, boxSizing: "border-box" }} />
                <span style={{ height: 12, width: pct(t.discussed, topicMax), background: "var(--st-completed)", borderRadius: 3 }} />
                {t.target > 0 && <span aria-hidden="true" style={{ position: "absolute", left: pct(t.target, topicMax), top: -3, bottom: -3, width: 2, background: "var(--ink)" }} />}
              </div>
              <span className="muted" style={{ fontSize: 12, textAlign: "right", color: t.target && t.discussed < 2 ? "var(--warn)" : undefined }}>
                {t.discussed} of {t.target || "–"}
              </span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          &ldquo;Discussed&rdquo; comes from generating key takeaways on a transcript, which also tags the topics the call covered.
        </p>
      </section>
    </div>
  );
}
