/**
 * A sample Experts pipeline (a fictional specialty plastics diligence) so a new engagement
 * has something to show. All names and companies are made up.
 */
import type { DB } from "@/db/client";
import {
  caseBudgets,
  caseExpenses,
  experts,
  expertTopics,
  expertTranscripts,
  expertTypes,
  hypotheses,
  keyTakeaways,
  runningGuides,
} from "@/db/schema";

export async function seedSampleExperts(db: DB, engagementId: string): Promise<void> {
  const typeRows = await db
    .insert(expertTypes)
    .values([
      { engagementId, name: "Customers", target: 10, sort: 1 },
      { engagementId, name: "Competitors", target: 6, sort: 2 },
      { engagementId, name: "Target company", target: 4, sort: 3 },
      { engagementId, name: "End users", target: 6, sort: 4 },
      { engagementId, name: "Channel partners", target: 4, sort: 5 },
    ])
    .returning();
  const T = (name: string) => typeRows.find((t) => t.name === name)!.id;

  const topicRows = await db
    .insert(expertTopics)
    .values(
      ["Pricing power", "Switching costs", "Lead times and capacity", "Raw material pass-through", "Customer concentration", "Recycled resins"].map(
        (name, i) => ({ engagementId, name, target: 5, sort: i }),
      ),
    )
    .returning();
  const P = (...names: string[]) => JSON.stringify(names.map((n) => topicRows.find((t) => t.name === n)!.id));

  const hyps = await db
    .insert(hypotheses)
    .values([
      { engagementId, slideRef: "Slide 4", statement: "The target has real pricing power", sort: 1 },
      { engagementId, slideRef: "Slide 6", statement: "Customers rarely switch suppliers", sort: 2 },
      { engagementId, slideRef: "Slide 7", statement: "Customer concentration is a low risk", sort: 3 },
      { engagementId, slideRef: "Slide 8", statement: "Capacity is not a constraint", sort: 4 },
      { engagementId, slideRef: "Slide 9", statement: "The target is behind on recycled resins", sort: 5 },
    ])
    .returning();
  const H = (n: number) => hyps[n]!.id;

  type Seed = [string, string, string, string, string, string, string | null, string, number, number, number, number, string, boolean?];
  const seeds: Seed[] = [
    ["completed", "Dana", "Whitfield", "Polyvance Materials", "Senior Director, Commercial Strategy", "Target company", "2026-10-28", "GLG", 60, 20, 0, 1200, P("Pricing power", "Customer concentration")],
    ["completed", "Marcus", "Oyelaran", "Kestrel Polymers", "Vice President, Global Procurement", "Competitors", "2026-10-29", "AlphaSights", 45, 0, 15, 1500, P("Raw material pass-through", "Pricing power")],
    ["completed", "Priya", "Natarajan", "Hollis Medical Devices", "Director of Supplier Quality", "Customers", "2026-10-30", "Guidepoint", 60, 0, 0, 900, P("Switching costs", "Lead times and capacity")],
    ["completed", "Tom", "Brekke", "Arcline Packaging", "Senior Manager, Materials Engineering", "Customers", "2026-11-03", "Third Bridge", 60, 30, 10, 800, P("Recycled resins", "Switching costs")],
    ["completed", "Elena", "Vasquez", "Ridgeway Automotive", "Head of Interior Components", "End users", "2026-11-04", "GLG", 45, 0, 0, 1000, P("Lead times and capacity", "Pricing power")],
    ["scheduled", "Samuel", "Achterberg", "Kestrel Polymers", "Director, Product Management", "Competitors", "2026-11-09", "GLG", 60, 0, 0, 1100, P("Pricing power", "Lead times and capacity")],
    ["scheduled", "Hannah", "Liu", "Polyvance Materials", "Plant Manager", "Target company", "2026-11-10", "AlphaSights", 60, 0, 0, 700, P("Lead times and capacity"), true],
    ["approved", "Rafael", "Moreno", "Corvane Distribution", "Vice President, Sales", "Channel partners", null, "Guidepoint", 60, 0, 0, 1250, P("Pricing power")],
    ["approved", "Grace", "Okafor", "Hollis Medical Devices", "Senior Buyer, Polymer Components", "Customers", null, "Third Bridge", 60, 0, 0, 850, P("Switching costs")],
    ["proposed", "Ben", "Sato", "Northfield Appliances", "Senior Director, Strategic Sourcing", "Customers", null, "GLG", 60, 0, 0, 1300, P("Switching costs", "Recycled resins")],
    ["proposed", "Ines", "Carvalho", "Tamsin Chemicals", "Chief Technology Officer", "Competitors", null, "AlphaSights", 60, 0, 0, 1800, P("Recycled resins")],
    ["proposed", "Owen", "Mbeki", "Ridgeway Automotive", "Purchasing Manager, Interior Trim", "End users", null, "Guidepoint", 60, 0, 0, 750, P("Pricing power")],
  ];
  const rows = await db
    .insert(experts)
    .values(
      seeds.map((s) => ({
        engagementId,
        status: s[0] as "completed",
        firstName: s[1],
        lastName: s[2],
        company: s[3],
        title: s[4],
        typeId: T(s[5]),
        interviewDate: s[6],
        network: s[7],
        callMinutes: s[8],
        followupMinutes: s[9],
        surveyMinutes: s[10],
        hourlyRate: s[11],
        topicIds: s[12],
        isFormer: s[13] ?? false,
      })),
    )
    .returning();
  const E = (first: string) => rows.find((r) => r.firstName === first)!.id;

  await db.insert(expertTranscripts).values({
    engagementId,
    expertId: E("Dana"),
    kind: "call",
    filename: "Whitfield_call.txt",
    discussedTopicIds: P("Pricing power", "Customer concentration"),
    body: [
      "[00:00] Interviewer: Thanks for making the time. Please don't share anything confidential to your employer. Could you start with your role?",
      "[02:15] Expert: I run commercial strategy for the specialty resins unit. We've put through 4 to 6% a year since 2021, and on the qualified medical grades we almost never lost volume over it.",
      "[06:40] Expert: Once you're specced into a catheter housing, nobody is changing resin to save three cents a pound. Requalification is 12 to 18 months.",
      "[09:05] Interviewer: Where did you see the most pushback?",
      "[09:30] Expert: Packaging, and the top three accounts. They're roughly 40% of specialty volume, so they get a different conversation every January.",
    ].join("\n\n"),
  });

  const K = (expert: string, body: string, verdict: "supports" | "challenges" | "new", h: number | null, locator: string) => ({
    engagementId,
    expertId: E(expert),
    body,
    verdict,
    hypothesisId: h === null ? null : H(h),
    locator,
    source: "manual" as const,
  });
  await db.insert(keyTakeaways).values([
    K("Dana", "Price increases of 4 to 6% a year have held since 2021, with almost no volume lost on medical grades.", "supports", 0, "02:15"),
    K("Dana", "Requalifying a resin takes 12 to 18 months, which keeps customers in place.", "supports", 1, "06:40"),
    K("Dana", "The top 3 customers are about 40% of specialty volume and negotiate hard every January.", "challenges", 2, "09:30"),
    K("Marcus", "Kestrel follows the target's price moves within about one quarter.", "supports", 0, ""),
    { ...K("Marcus", "Raw material costs are passed through with a 60 to 90 day lag.", "new", null, ""), included: false },
    K("Priya", "Switching a qualified resin would mean revalidating the whole device.", "supports", 1, ""),
    K("Tom", "Packaging buyers will switch for savings of 5% or more, so they're less sticky than medical.", "challenges", 1, ""),
    K("Tom", "Wants 30% recycled content by 2028 and sees the target as behind.", "supports", 4, ""),
    K("Elena", "Lead times are back to about five weeks.", "supports", 3, ""),
  ]);

  await db.insert(runningGuides).values({
    engagementId,
    typeId: T("Customers"),
    body: [
      "1. Walk me through your role and which specialty plastics you buy.",
      "2. Roughly how much do you spend a year, and with how many suppliers?",
      "3. How have resin prices moved over the last three years?",
      "4. What would it take to change suppliers on a qualified part?",
      "5. Are your customers asking for recycled content?",
    ].join("\n"),
  });
  await db.insert(caseBudgets).values({ engagementId, total: 40000, plannedInterviews: 30 });
  await db.insert(caseExpenses).values([
    { engagementId, category: "meals", description: "Late team dinners", amount: 1320 },
    { engagementId, category: "travel", description: "Cabs", amount: 820 },
    { engagementId, category: "ai_tools", description: "Claude and transcription", amount: 480 },
  ]);
}
