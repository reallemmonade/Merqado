import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { DeleteExpense, ExpenseForm } from "@/components/experts/ExpenseForm";
import type { CopyTable } from "@/lib/copy/table";
import { budgetSummary, coverage, elapsedShare, money } from "@/lib/experts/calc";
import { focusHref } from "@/lib/experts/focus";
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
  // A clickable bar segment: opens Calls narrowed to the experts behind it. Empty segments render nothing.
  // Hovering (or tabbing to) a segment pops up its details.
  const Tip = ({ head, lines }: { head: string; lines?: string[] }) => (
    <span className="tip" role="tooltip">
      <strong>{head}</strong>
      {lines?.map((l) => <span key={l}>{l}</span>)}
    </span>
  );
  const Seg = ({ focus, n, width, className, style, head, lines }: { focus: string; n: number; width: string; className?: string; style?: React.CSSProperties; head: string; lines?: string[] }) =>
    n > 0 ? (
      <Link href={focusHref(id, focus)} className={`tip-host ${className ?? ""}`} style={{ ...style, width }}>
        <Tip head={head} lines={[...(lines ?? []), "Click to see them in Calls"]} />
      </Link>
    ) : null;
  // The empty grey rest of a bar, with its own popup.
  const Rest = ({ head, lines }: { head: string; lines?: string[] }) => (
    <span className="tip-host seg-rest" tabIndex={0}>
      <Tip head={head} lines={lines} />
    </span>
  );
  const experts = (n: number) => `${n} ${n === 1 ? "expert" : "experts"}`;
  const STATUS_TIP = { completed: "Completed", scheduled: "Scheduled", approved: "Approved", proposed: "Proposed" } as const;

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
          </div>
          {typeRows.length === 0 && <p className="toolbar"><span className="muted">No types</span>{setupLink}</p>}
          {typeRows.map((t) => {
            const inMotion = t.cov.scheduled + t.cov.approved + t.cov.proposed;
            const target = Math.max(t.target, t.cov.completed + inMotion, 1);
            return (
              <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                  <strong style={{ fontWeight: 500 }}>{t.name}</strong>
                </div>
                <div className="covbar big">
                  {(["completed", "scheduled", "approved", "proposed"] as const).map((st) => (
                    <Seg key={st} focus={`type:${t.id}:${st}`} n={t.cov[st]} width={pct(t.cov[st], target)} className={`seg-${st}`} head={`${STATUS_TIP[st]}: ${experts(t.cov[st])}`} lines={[t.name]} />
                  ))}
                  {t.target > t.cov.completed + inMotion && (
                    <Rest head={`Still needed: ${experts(t.target - t.cov.completed - inMotion)}`} lines={[`${t.name} target is ${t.target}`]} />
                  )}
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
            <p className="toolbar"><span className="muted">No budget</span>{setupLink}</p>
          ) : (
            <>
              <div className="tiles">
                <div><div className="muted" style={{ fontSize: 12 }}>Total budget</div><div className="tile-value" style={{ fontSize: 20 }}>{money(b.total)}</div></div>
                <div><div className="muted" style={{ fontSize: 12 }}>Spent so far</div><div className="tile-value" style={{ fontSize: 20 }}>{money(b.spent)}</div></div>
                <div><div className="muted" style={{ fontSize: 12 }}>Remaining</div><div className="tile-value" style={{ fontSize: 20 }}>{money(b.remaining)}</div></div>
                <div><div className="muted" style={{ fontSize: 12 }}>Projected total</div><div className="tile-value" style={{ fontSize: 20, color: over > 0 ? "var(--bad)" : undefined }}>{money(b.projected)}</div></div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div className="budget-bar">
                  <Seg focus="budget:spent" n={b.spent > 0 ? 1 : 0} width={pct(b.spent, scale)} style={{ background: "var(--st-completed)" }} head={`Spent ${money(b.spent)}`} lines={[`Honoraria ${money(b.honorariaPaid)}`, `Expenses ${money(b.expenses)}`, `AI tools ${money(b.aiTools)}`]} />
                  <Seg focus="budget:booked" n={b.booked > 0 ? 1 : 0} width={pct(b.booked, scale)} style={{ background: "var(--st-scheduled)" }} head={`Booked, not billed ${money(b.booked)}`} lines={["Interviews scheduled or approved"]} />
                  <Seg focus="budget:expected" n={stillExpected > 0 ? 1 : 0} width={pct(stillExpected, scale)} style={{ background: "var(--st-approved)", outline: "1px solid var(--st-scheduled)", outlineOffset: -1 }} head={`Still expected ${money(stillExpected)}`}
                    lines={[
                      `Proposed interviews ${money(b.proposed)}`,
                      `${b.futureInterviews} more planned at ${money(b.averageHonorarium)} avg: ${money(b.futureInterviewCost)}`,
                      ...(b.futureExpenses > 0 ? [`Expenses and AI at the pace so far: ${money(b.futureExpenses)}`] : []),
                    ]}
                  />
                  {over < 0 && <Rest head={`Left over ${money(-over)}`} lines={[`Budget ${money(b.total)}, projected ${money(b.projected)}`]} />}
                  {over > 0 && (
                    <span className="tip-host budget-mark" tabIndex={0} style={{ left: pct(b.total, scale) }}>
                      <Tip head={`Budget ${money(b.total)}`} lines={[`Projected ${money(over)} over`]} />
                    </span>
                  )}
                </div>
              </div>
              <div className="legend">
                <span>
                  <i style={{ background: "var(--st-completed)" }} />
                  Spent
                </span>
                <span>
                  <i style={{ background: "var(--st-scheduled)" }} />
                  Booked, not billed
                </span>
                <span>
                  <i style={{ background: "var(--st-approved)", border: "1px solid var(--st-scheduled)", boxSizing: "border-box" }} />
                  Still expected
                </span>
                {over > 0 && (
                  <span>
                    <i style={{ background: "var(--ink)", width: 2 }} />
                    Budget
                  </span>
                )}
              </div>
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
        <div className="legend">
          <span><i className="seg-completed" />Discussed in an interview</span>
          <span><i style={{ background: "var(--st-approved)", border: "1px solid var(--st-scheduled)", boxSizing: "border-box" }} />Know it, not discussed yet</span>
        </div>
        {topicRows.length === 0 && <p className="toolbar"><span className="muted">No topics</span>{setupLink}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: "16px 40px" }}>
          {topicRows.map((t) => (
            <div key={t.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                <strong style={{ fontWeight: 500 }}>{t.name}</strong>
              </div>
              <div className="covbar big">
                <Seg focus={`topic:${t.id}:discussed`} n={t.discussed} width={pct(t.discussed, t.full)} className="seg-completed" head={`Discussed: ${experts(t.discussed)}`} lines={[t.name]} />
                <Seg
                  focus={`topic:${t.id}:notyet`}
                  n={t.notYet}
                  width={pct(Math.min(t.notYet, t.full - t.discussed), t.full)}
                  style={{ background: "var(--st-approved)", outline: "1px solid var(--st-scheduled)", outlineOffset: -1 }}
                  head={`Know it, not discussed yet: ${experts(t.notYet)}`}
                  lines={[t.name]}
                />
                {t.short > 0 && <Rest head={`Still needed: ${experts(t.short)}`} lines={[`${t.name} target is ${t.target}`]} />}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
