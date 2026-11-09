import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { CaseShell } from "@/components/case/CaseShell";
import { MyTasks, ReviewList, TeamRoles, type ReviewExpert } from "@/components/case/TaskViews";
import { WorkplanGrid } from "@/components/case/WorkplanGrid";
import { experts } from "@/db/schema";
import { loadWorkplan } from "@/lib/case/data";
import { loadCase } from "@/lib/case/page";
import { reviewerOf } from "@/lib/case/tasks";
import { parseApprovals, slots, waitingOn } from "@/lib/experts/approval";
import { anonymizeTitle, honorarium } from "@/lib/experts/calc";
import { allows } from "@/lib/roles";

export const dynamic = "force-dynamic";

type View = "plan" | "mine" | "review" | "team";

export default async function WorkplanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const view: View = sp.view === "mine" || sp.view === "review" || sp.view === "team" ? sp.view : "plan";
  const ctx = await loadCase(id, view === "plan" ? "/workplan" : `/workplan?view=${view}`);
  const me = ctx.user.id;
  const canAssign = allows(ctx.membership, "assign_tasks");
  const canPlan = allows(ctx.membership, "edit_plan");
  const [wp, proposedRows] = await Promise.all([
    loadWorkplan(ctx.db, id),
    ctx.canEdit ? ctx.db.select().from(experts).where(and(eq(experts.engagementId, id), eq(experts.status, "proposed"))) : Promise.resolve([]),
  ]);

  const leadOf = new Map(wp.modules.map((m) => [m.id, m.leadId]));
  const mine = wp.tasks.filter((t) => t.assigneeId === me);
  const toReview = wp.tasks.filter((t) => t.status === "almost_done" && reviewerOf(t, leadOf.get(t.moduleId)) === me);
  const nameOf = new Map(ctx.members.map((m) => [m.id, m.name]));
  // An expert waits in the inbox of everyone who still has a sign-off to give: a consultant, plus whoever asked.
  const proposed: ReviewExpert[] = proposedRows
    .map((e) => ({ e, state: { requestedBy: e.requestedBy, approvals: parseApprovals(e.approvals) } }))
    .filter(({ state }) => waitingOn(state, ctx.members).includes(me))
    .map(({ e, state }) => ({
      id: e.id,
      name: [e.firstName, e.lastName].filter(Boolean).join(" "),
      title: e.anonTitle || anonymizeTitle(e.company, e.title, e.isFormer),
      cost: honorarium(e),
      proposedBy: e.proposedBy ? (nameOf.get(e.proposedBy) ?? null) : null,
      signoffs: slots(state, ctx.members).map((s): [string, boolean] => [
        s.slot === "requester" ? (nameOf.get(e.requestedBy!) ?? "") : s.by ? (nameOf.get(s.by) ?? "") : "Consultant",
        s.done,
      ]),
    }));

  const base = `/e/${id}/workplan`;
  const tabs: { key: View; label: string; href: string; count?: number }[] = [
    { key: "plan", label: "Plan", href: base },
    { key: "mine", label: "My tasks", href: `${base}?view=mine`, count: mine.filter((t) => t.status !== "done").length },
    { key: "review", label: "To review", href: `${base}?view=review`, count: toReview.length + proposed.length },
    { key: "team", label: "Team", href: `${base}?view=team` },
  ];

  return (
    <CaseShell ctx={ctx} section="workplan" title="Workplan">
      <nav className="seg" aria-label="Workplan view" style={{ alignSelf: "flex-start" }}>
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} className="seg-link" aria-current={view === t.key ? "page" : undefined}>
            {t.label}
            {t.count ? <span className="seg-count">{t.count}</span> : null}
          </Link>
        ))}
      </nav>
      {view === "plan" && <WorkplanGrid engagementId={id} wp={wp} members={ctx.members} canEdit={ctx.canEdit} canAssign={canAssign} canPlan={canPlan} me={me} />}
      {view === "mine" && <MyTasks engagementId={id} wp={wp} tasks={mine} members={ctx.members} canEdit={ctx.canEdit} me={me} />}
      {view === "review" && <ReviewList engagementId={id} wp={wp} tasks={toReview} experts={proposed} members={ctx.members} canEdit={ctx.canEdit} />}
      {view === "team" && <TeamRoles engagementId={id} members={ctx.members} canSet={allows(ctx.membership, "set_roles")} />}
    </CaseShell>
  );
}
