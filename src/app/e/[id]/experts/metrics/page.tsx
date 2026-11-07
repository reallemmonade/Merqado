import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { DeleteExpense, ExpenseForm } from "@/components/experts/ExpenseForm";
import type { CopyTable } from "@/lib/copy/table";
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
  // Budget bar: the full bar is the budget, unless we're projected to go over it.
  const over = b.projected - b.total;
  const stillExpected = Math.max(0, b.projected - b.spent - b.booked);
  const scale = Math.max(b.total, b.projected, 1);

  const discussedBy = (topicId: string) =>
    new Set(data.transcripts.filter((t) => t.discussedTopicIds.includes(topicId)).map((t) => t.expertId));
  const topicRows = data.topics.map((t) => {
    const discussedIds = discussedBy(t.id);
    const discussed = discussedIds.size;
    // Experts on the list who know this topic but haven't talked about it in a transcript yet.
    const notYet = live.filter((e) => e.topicIds.includes(t.id) && !discussedIds.has(e.id)).length;
    const short = Math.max(0, t.target - discussed - notYet);
    const full = Math.max(t.target, discussed, 1);
    return { ...t, discussed, notYet, short, full };
  });
  const setupLink = <Link href={`/e/${id}/experts/setup`}>Case setup</Link>;

  // What each card's Copy button puts on the clipboard: the numbers behind the chart, as a table.
  const coverageCopy: CopyTable[] = [
    {
      title: "Coverage by type",
      columns: ["Type", "Completed", "Scheduled", "Approved", "Proposed", "Target", "Still needed"],
      rows: typeRows.map((t) => [
        t.name,
        t.cov.completed,
        t.cov.scheduled,
        t.cov.approved,
        t.cov.proposed,
        t.target || "—",
        t.target ? Math.max(0, t.target - t.cov.completed - t.cov.scheduled - t.cov.approved - t.cov.proposed) : "—",
      ]),
    },
  ];
  const budgetCopy: CopyTable[] = [
    {
      title: "Case budget",
      columns: ["Item", "Amount"],
      rows: [
        ["Total budget", money(b.total)],
        ["Spent so far", money(b.spent)],
        ["Spent on honoraria", money(b.honorariaPaid)],
        ["Spent on expenses", money(b.expenses)],
        ["Spent on AI tools", money(b.aiTools)],
        ["Booked, not billed yet", money(b.booked)],
        ["Still expected", money(stillExpected)],
        ["Projected total", money(b.projected)],
        ["Remaining (budget less spent)", money(b.remaining)],
        [over > 0 ? "Projected over budget" : "Projected under budget", money(Math.abs(over))],
      ],
      numeric: [1],
    },
    ...(data.expenses.length
      ? [
          {
            title: "Expenses",
            columns: ["Category", "Description", "Date", "Amount"],
            rows: data.expenses.map((x) => [CATEGORY_LABEL[x.category], x.description, x.spentOn, money(x.amount)]),
            numeric: [3],
          },
        ]
      : []),
  ];
  const topicCopy: CopyTable[] = [
    {
      title: "Topic coverage",
      columns: ["Topic", "Discussed in an interview", "Know it, not discussed yet", "Target", "Experts still to find"],
      rows: topicRows.map((t) => [t.name, t.discussed, t.notYet, t.target || "—", t.target ? t.short : "—"]),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: 16 }}>
        <section className="card copyable" aria-labelledby="cov-h">
          <CopyButton tables={coverageCopy} />
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

        <section className="card copyable" aria-labelledby="budget-h">
          <CopyButton tables={budgetCopy} />
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
                <div><div className="muted" style={{ fontSize: 12 }}>Projected total</div><div className="tile-value" style={{ fontSize: 20, color: over > 0 ? "var(--bad)" : undefined }}>{money(b.projected)}</div></div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  className="budget-bar"
                  role="img"
                  aria-label={`Spent ${money(b.spent)}, booked ${money(b.booked)}, still expected ${money(stillExpected)}, against a budget of ${money(b.total)}`}
                >
                  <span style={{ width: pct(b.spent, scale), background: "var(--st-completed)", borderRadius: "6px 0 0 6px" }} />
                  <span style={{ width: pct(b.booked, scale), background: "var(--st-scheduled)" }} />
                  <span style={{ width: pct(stillExpected, scale), background: "var(--st-approved)", outline: "1px solid var(--st-scheduled)", outlineOffset: -1 }} />
                  {over > 0 && (
                    <span aria-hidden="true" style={{ position: "absolute", left: pct(b.total, scale), top: -4, bottom: -4, width: 2, background: "var(--ink)" }} />
                  )}
                </div>
                <div style={{ position: "relative", height: 16, fontSize: 12 }} className="muted" aria-hidden="true">
                  <span style={{ position: "absolute", left: 0 }}>$0</span>
                  <span style={{ position: "absolute", right: over > 0 ? `calc(100% - ${pct(b.total, scale)})` : 0, whiteSpace: "nowrap" }}>
                    Budget {money(b.total)}
                  </span>
                </div>
              </div>
              <div className="legend" style={{ flexDirection: "column", gap: 6, fontSize: 13 }}>
                <span>
                  <i style={{ background: "var(--st-completed)" }} />
                  <strong style={{ color: "var(--ink)", fontWeight: 500 }}>Spent {money(b.spent)}</strong>: honoraria {money(b.honorariaPaid)}, expenses{" "}
                  {money(b.expenses)}, AI tools {money(b.aiTools)}
                </span>
                <span>
                  <i style={{ background: "var(--st-scheduled)" }} />
                  <strong style={{ color: "var(--ink)", fontWeight: 500 }}>Booked {money(b.booked)}</strong>: interviews scheduled or approved, not billed yet
                </span>
                <span>
                  <i style={{ background: "var(--st-approved)", border: "1px solid var(--st-scheduled)", boxSizing: "border-box" }} />
                  <strong style={{ color: "var(--ink)", fontWeight: 500 }}>Still expected {money(stillExpected)}</strong>: our estimate for proposed and future interviews
                  {b.futureExpenses > 0 ? " and expenses" : ""}
                </span>
                <span>
                  <i style={{ background: "var(--track)" }} />
                  {over > 0 ? (
                    <strong style={{ color: "var(--bad)", fontWeight: 500 }}>Past the black line: {money(over)} over budget</strong>
                  ) : (
                    <><strong style={{ color: "var(--ink)", fontWeight: 500 }}>Left over {money(-over)}</strong>: budget we don&rsquo;t expect to use</>
                  )}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: over > 0 ? "var(--bad)" : "var(--good)", fontWeight: 600 }}>
                {over > 0 ? `Projected ${money(over)} over budget` : `Projected ${money(-over)} under budget`}
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

      <section className="card copyable" aria-labelledby="topic-h">
          <CopyButton tables={topicCopy} />
        <h2 id="topic-h" style={{ fontSize: 18 }}>
          Topic coverage
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          How many experts have actually talked about each topic in an interview, against the target set in Case setup. A full bar means
          the target is met.
        </p>
        <div className="legend">
          <span><i className="seg-completed" />Discussed in an interview</span>
          <span><i style={{ background: "var(--st-approved)", border: "1px solid var(--st-scheduled)", boxSizing: "border-box" }} />Experts who know it, not discussed yet</span>
          <span><i style={{ background: "var(--track)" }} />Still needed</span>
        </div>
        {topicRows.length === 0 && <p className="muted">Add the case topics in {setupLink}.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: "16px 40px" }}>
          {topicRows.map((t) => (
            <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                <strong style={{ fontWeight: 500 }}>{t.name}</strong>
                <span style={{ whiteSpace: "nowrap" }}>
                  {t.target > 0 ? `${t.discussed} of ${t.target} discussed` : `${t.discussed} discussed`}
                </span>
              </div>
              <div
                className="covbar big"
                role="img"
                aria-label={`${t.name}: ${t.discussed} discussed, ${t.notYet} more experts know it, target ${t.target}`}
              >
                <span className="seg-completed" style={{ width: pct(t.discussed, t.full) }} />
                <span style={{ width: pct(Math.min(t.notYet, t.full - t.discussed), t.full), background: "var(--st-approved)", outline: "1px solid var(--st-scheduled)", outlineOffset: -1 }} />
              </div>
              <span className="muted" style={{ fontSize: 12, color: t.short > 0 ? "var(--warn)" : undefined }}>
                {t.target > 0 && t.discussed >= t.target
                  ? "Target met"
                  : [
                      t.notYet > 0 ? `${t.notYet} more ${t.notYet === 1 ? "expert knows" : "experts know"} it` : null,
                      t.short > 0 ? `find ${t.short} more ${t.short === 1 ? "expert" : "experts"} to hit the target` : null,
                    ]
                      .filter(Boolean)
                      .join(", ")
                      .replace(/^./, (c) => c.toUpperCase()) || "No target set"}
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
