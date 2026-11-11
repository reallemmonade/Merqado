import { sql } from "drizzle-orm";
import { blob, integer, real, primaryKey, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

/** The four persona archetypes every firm's titles map onto. */
export const ARCHETYPES = ["associate", "consultant", "manager", "partner"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** Per-engagement access, deliberately separate from a person's firm title. */
export const ACCESS_LEVELS = ["viewer", "editor", "lead"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/**
 * How AI usage is paid for.
 * - managed: Merqado calls the model with its own keys and bills the firm for metered usage.
 * - byo: the firm connects its own model account (Anthropic, Bedrock, Vertex, Azure OpenAI, ...)
 *   and pays its provider directly. Merqado still records usage for visibility.
 */
export const BILLING_MODES = ["managed", "byo"] as const;
export type BillingMode = (typeof BILLING_MODES)[number];

export const firms = sqliteTable("firms", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  aiBillingMode: text("ai_billing_mode", { enum: BILLING_MODES }).notNull().default("managed"),
  /** Monthly AI spend cap in USD, checked before each model call. Null: no firm cap. */
  aiMonthlyCapUsd: real("ai_monthly_cap_usd"),
  createdAt: createdAt(),
});

/** A firm's own job title (e.g. "Senior Associate", "Engagement Manager") mapped to an archetype. */
export const firmRoles = sqliteTable(
  "firm_roles",
  {
    id: id(),
    firmId: text("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    archetype: text("archetype", { enum: ARCHETYPES }).notNull(),
    rank: integer("rank").notNull().default(0),
  },
  (t) => [uniqueIndex("firm_roles_firm_title").on(t.firmId, t.title)],
);

export const PRESENCE_STATUSES = ["auto", "busy", "dnd", "away"] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** Last time the person had Merqado open; drives available / away / offline. */
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  /** "auto" follows activity; the others are set by the person. */
  presence: text("presence", { enum: PRESENCE_STATUSES }).notNull().default("auto"),
  /** IANA time zone (e.g. "America/New_York"), picked up from the person's browser. Null until seen. */
  timeZone: text("time_zone"),
  createdAt: createdAt(),
});

export const firmMembers = sqliteTable(
  "firm_members",
  {
    firmId: text("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    firmRoleId: text("firm_role_id")
      .notNull()
      .references(() => firmRoles.id),
    isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.firmId, t.userId] })],
);

export const engagements = sqliteTable(
  "engagements",
  {
    id: id(),
    firmId: text("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    clientName: text("client_name").notNull(),
    title: text("title").notNull(),
    status: text("status", { enum: ["active", "paused", "closed"] }).notNull().default("active"),
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    /** Optional overrides; null means use the firm default. */
    aiProviderId: text("ai_provider_id"),
    storageConnectionId: text("storage_connection_id"),
    createdAt: createdAt(),
  },
  (t) => [index("engagements_firm").on(t.firmId)],
);

export const engagementMembers = sqliteTable(
  "engagement_members",
  {
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    access: text("access", { enum: ACCESS_LEVELS }).notNull().default("editor"),
    /** Role on this case; null means the person's firm title decides it. Rights like approving follow it. */
    caseRole: text("case_role", { enum: ARCHETYPES }),
  },
  (t) => [primaryKey({ columns: [t.engagementId, t.userId] })],
);

/** A firm's connection to an AI model. `config` is encrypted JSON (see lib/crypto). */
export const aiProviders = sqliteTable("ai_providers", {
  id: id(),
  firmId: text("firm_id")
    .notNull()
    .references(() => firms.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  kind: text("kind").notNull(),
  encryptedConfig: text("encrypted_config").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

/** A firm's connection to its own document storage. `config` is encrypted JSON. */
export const storageConnections = sqliteTable("storage_connections", {
  id: id(),
  firmId: text("firm_id")
    .notNull()
    .references(() => firms.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  kind: text("kind").notNull(),
  encryptedConfig: text("encrypted_config").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

/** A file or dataset in an engagement's data room. Bytes stay in the firm's storage. */
export const sources = sqliteTable(
  "sources",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    storageConnectionId: text("storage_connection_id"),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    status: text("status", { enum: ["uploaded", "processing", "ready", "failed"] })
      .notNull()
      .default("uploaded"),
    uploadedBy: text("uploaded_by").references(() => users.id),
    /** Folder in the case's Files view, e.g. "Models". Empty means unfiled. */
    folder: text("folder").notNull().default(""),
    /** "pending" waits for someone to confirm its folder; "filed" is in place. */
    filing: text("filing", { enum: ["pending", "filed"] }).notNull().default("filed"),
    /** JSON array of suggested folder paths, best first. */
    suggestions: text("suggestions").notNull().default("[]"),
    /** JSON array of case items the file is about: { kind, id, label }. */
    links: text("links").notNull().default("[]"),
    /** SHA-256 of the bytes, to skip exact duplicates. */
    contentHash: text("content_hash"),
    /** The first file of a version stack; null for the first version itself. */
    versionOf: text("version_of"),
    version: integer("version").notNull().default(1),
    /** Pending only: the earlier file this looks like a newer copy of. */
    versionCandidate: text("version_candidate"),
    /** Where the file sat inside a dropped folder, e.g. "OEM deep dive/OEM 01.xlsx". */
    relPath: text("rel_path"),
    /** Plain text of the file, for search and the case GPT. */
    textBody: text("text_body"),
    /** Files posted in a chat stay visible only to that chat's members. */
    roomId: text("room_id"),
    messageId: text("message_id"),
    /** Files dropped together share a batch, so they're confirmed together. */
    batchId: text("batch_id"),
    createdAt: createdAt(),
  },
  (t) => [index("sources_engagement").on(t.engagementId), index("sources_hash").on(t.engagementId, t.contentHash)],
);

/** A case's folder list, seeded from the firm default and editable per case. */
export const caseFolders = sqliteTable(
  "case_folders",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    /** Full path, e.g. "Interviews/Transcripts". */
    path: text("path").notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("case_folders_path").on(t.engagementId, t.path)],
);

/**
 * Original file bytes, kept here only when the firm has no cloud storage connected yet,
 * so every source can still be opened. Once storage is connected, new files go there.
 */
export const sourceBlobs = sqliteTable("source_blobs", {
  sourceId: text("source_id")
    .primaryKey()
    .references(() => sources.id, { onDelete: "cascade" }),
  data: blob("data", { mode: "buffer" }).notNull(),
});

export const FINDING_STATUSES = ["hypothesis", "supported", "needs_data", "contradicted"] as const;

export const findings = sqliteTable(
  "findings",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    statement: text("statement").notNull(),
    workstream: text("workstream"),
    status: text("status", { enum: FINDING_STATUSES }).notNull().default("hypothesis"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("findings_engagement").on(t.engagementId)],
);

/** Ties a finding to the exact place in a source that backs it (cell range, page, timestamp). */
export const findingEvidence = sqliteTable("finding_evidence", {
  id: id(),
  findingId: text("finding_id")
    .notNull()
    .references(() => findings.id, { onDelete: "cascade" }),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  locator: text("locator"),
  quote: text("quote"),
});

/** One row per model call, for both billing modes. */
export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: id(),
    firmId: text("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    engagementId: text("engagement_id"),
    userId: text("user_id"),
    aiProviderId: text("ai_provider_id"),
    billingMode: text("billing_mode", { enum: BILLING_MODES }).notNull(),
    providerKind: text("provider_kind").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    feature: text("feature").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("usage_firm_time").on(t.firmId, t.createdAt)],
);

/**
 * A firm's identity provider. OIDC covers Microsoft Entra ID, Google Workspace, Okta,
 * Auth0, OneLogin and most others. People sign in with their work email; the domain
 * picks the connection.
 */
export const ssoConnections = sqliteTable("sso_connections", {
  id: id(),
  firmId: text("firm_id")
    .notNull()
    .references(() => firms.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  protocol: text("protocol", { enum: ["oidc"] }).notNull().default("oidc"),
  issuer: text("issuer").notNull(),
  clientId: text("client_id").notNull(),
  encryptedClientSecret: text("encrypted_client_secret").notNull(),
  /** Lowercase, comma-separated, e.g. "acme.com,acme.co.uk". */
  emailDomains: text("email_domains").notNull(),
  /** Title given to people the first time they sign in. Null disables auto-provisioning. */
  defaultFirmRoleId: text("default_firm_role_id").references(() => firmRoles.id),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

/** Only the SHA-256 of the session token is stored, so a database leak can't be replayed. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    firmId: text("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    ssoConnectionId: text("sso_connection_id"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

/**
 * Email domains a firm has claimed for the shared "Continue with Google / Microsoft" buttons.
 * Anyone with a verified work account on a claimed domain can sign in to that firm, so a
 * firm's IT team doesn't need to set anything up. Firms with their own identity provider
 * use `sso_connections` instead.
 */
export const firmDomains = sqliteTable("firm_domains", {
  domain: text("domain").primaryKey(),
  firmId: text("firm_id")
    .notNull()
    .references(() => firms.id, { onDelete: "cascade" }),
  /** Title given to people the first time they sign in. Null means only pre-added people. */
  defaultFirmRoleId: text("default_firm_role_id").references(() => firmRoles.id),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Experts: the interview pipeline, transcripts, guides and key takeaways.
// ---------------------------------------------------------------------------

/** Proposed by anyone on the team, approved by a reviewer, then booked and held. */
export const EXPERT_STATUSES = ["proposed", "approved", "scheduled", "completed", "declined"] as const;
export type ExpertStatus = (typeof EXPERT_STATUSES)[number];

/** An interview archetype for a case (e.g. "Customers"), with how many calls the team wants. */
export const expertTypes = sqliteTable(
  "expert_types",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    target: integer("target").notNull().default(0),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("expert_types_engagement").on(t.engagementId)],
);

/** A topic the case needs covered in interviews (e.g. "Pricing power"). */
export const expertTopics = sqliteTable(
  "expert_topics",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Calls that should discuss it. */
    target: integer("target").notNull().default(5),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("expert_topics_engagement").on(t.engagementId)],
);

export const experts = sqliteTable(
  "experts",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    typeId: text("type_id").references(() => expertTypes.id, { onDelete: "set null" }),
    status: text("status", { enum: EXPERT_STATUSES }).notNull().default("proposed"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    company: text("company").notNull().default(""),
    title: text("title").notNull().default(""),
    /** Manual override; null means use the one generated from company and title. */
    anonTitle: text("anon_title"),
    isFormer: integer("is_former", { mode: "boolean" }).notNull().default(false),
    /** ISO date (YYYY-MM-DD) of the call, planned or held. */
    interviewDate: text("interview_date"),
    network: text("network").notNull().default(""),
    callMinutes: integer("call_minutes").notNull().default(0),
    followupMinutes: integer("followup_minutes").notNull().default(0),
    surveyMinutes: integer("survey_minutes").notNull().default(0),
    /** Whole dollars per hour. */
    hourlyRate: integer("hourly_rate").notNull().default(0),
    /** JSON array of expert_topics ids this person has expertise in. */
    topicIds: text("topic_ids").notNull().default("[]"),
    notes: text("notes").notNull().default(""),
    /** Generated or edited interview guide, as plain text / Markdown. */
    guide: text("guide"),
    guideUpdatedAt: integer("guide_updated_at", { mode: "timestamp" }),
    proposedBy: text("proposed_by").references(() => users.id),
    /** Who asked for this expert, if not a consultant. They sign off too, on top of a consultant. */
    requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
    /** JSON array of user ids who have signed off so far (see lib/experts/approval). */
    approvals: text("approvals").notNull().default("[]"),
    approvedBy: text("approved_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("experts_engagement").on(t.engagementId)],
);

export const expertTranscripts = sqliteTable(
  "expert_transcripts",
  {
    id: id(),
    expertId: text("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["call", "followup"] }).notNull().default("call"),
    filename: text("filename").notNull(),
    /** The original uploaded file (Word, text, captions), so it can be opened as it was. */
    sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),
    /** The transcript exactly as uploaded (verbatim). */
    body: text("body").notNull(),
    /** AI-cleaned version: speakers labeled, fillers and garble removed, names and figures fixed. */
    cleanedBody: text("cleaned_body"),
    cleanStatus: text("clean_status", { enum: ["none", "cleaning", "cleaned", "failed"] }).notNull().default("none"),
    /** JSON array of { quote, reason } the cleaner flagged for a human to check (e.g. possible MNPI). */
    cleanFlags: text("clean_flags").notNull().default("[]"),
    /** JSON array of expert_topics ids the call actually discussed (from analysis). */
    discussedTopicIds: text("discussed_topic_ids").notNull().default("[]"),
    uploadedBy: text("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("expert_transcripts_expert").on(t.expertId)],
);

/** A theme the team is testing across interviews; key takeaways roll up into these. */
export const hypotheses = sqliteTable(
  "hypotheses",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    statement: text("statement").notNull(),
    /** Where it lives in the deck, e.g. "Slide 4". */
    slideRef: text("slide_ref").notNull().default(""),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("hypotheses_engagement").on(t.engagementId)],
);

export const TAKEAWAY_VERDICTS = ["supports", "challenges", "new"] as const;

export const keyTakeaways = sqliteTable(
  "key_takeaways",
  {
    id: id(),
    expertId: text("expert_id")
      .notNull()
      .references(() => experts.id, { onDelete: "cascade" }),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    verdict: text("verdict", { enum: TAKEAWAY_VERDICTS }).notNull().default("new"),
    hypothesisId: text("hypothesis_id").references(() => hypotheses.id, { onDelete: "set null" }),
    /** Where in the transcript, e.g. "06:40". */
    locator: text("locator").notNull().default(""),
    /** Whether it counts toward the hypotheses section. */
    included: integer("included", { mode: "boolean" }).notNull().default(true),
    source: text("source", { enum: ["ai", "manual"] }).notNull().default("manual"),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("key_takeaways_engagement").on(t.engagementId)],
);

/** The team's running interview guide, one per interviewee type (or a general one). */
export const runningGuides = sqliteTable(
  "running_guides",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    typeId: text("type_id").references(() => expertTypes.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    updatedAt: createdAt(),
  },
  (t) => [index("running_guides_engagement").on(t.engagementId)],
);

export const caseBudgets = sqliteTable("case_budgets", {
  engagementId: text("engagement_id")
    .primaryKey()
    .references(() => engagements.id, { onDelete: "cascade" }),
  /** Whole dollars. */
  total: integer("total").notNull().default(0),
  plannedInterviews: integer("planned_interviews").notNull().default(0),
});

export const EXPENSE_CATEGORIES = ["meals", "travel", "ai_tools", "other"] as const;

export const caseExpenses = sqliteTable(
  "case_expenses",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    category: text("category", { enum: EXPENSE_CATEGORIES }).notNull().default("other"),
    description: text("description").notNull().default(""),
    /** Whole dollars. */
    amount: integer("amount").notNull(),
    spentOn: text("spent_on"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("case_expenses_engagement").on(t.engagementId)],
);

// ---------------------------------------------------------------------------
// Case workspace: workplan, team channel, notes, dictionary, deck, case GPT.
// ---------------------------------------------------------------------------

/** A workstream such as "Market sizing"; deck sections, notes and tasks tag to it. */
export const workplanModules = sqliteTable(
  "workplan_modules",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    leadId: text("lead_id").references(() => users.id, { onDelete: "set null" }),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("workplan_modules_engagement").on(t.engagementId)],
);

/** A dated checkpoint such as "Client update 1"; the workplan's columns and the case timeline. */
export const workplanMilestones = sqliteTable(
  "workplan_milestones",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** ISO date (YYYY-MM-DD). */
    date: text("date").notNull(),
    /** Client-facing columns show in the workplan grid; others only on the timeline. */
    isColumn: integer("is_column", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("workplan_milestones_engagement").on(t.engagementId)],
);

/**
 * Stored keys predate the current labels: not_yet = Not started, in_progress = Started,
 * almost_done = Ready for review, done = Done (see TASK_STATUS_LABEL).
 */
export const TASK_STATUSES = ["not_yet", "in_progress", "almost_done", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const workplanTasks = sqliteTable(
  "workplan_tasks",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    moduleId: text("module_id")
      .notNull()
      .references(() => workplanModules.id, { onDelete: "cascade" }),
    milestoneId: text("milestone_id").references(() => workplanMilestones.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("not_yet"),
    /** ISO date; falls back to the milestone's date when empty. */
    dueDate: text("due_date"),
    /** Who marks it done. Falls back to whoever assigned it, then the module lead. */
    reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    /** The reviewer's note when sending a task back. */
    reviewNote: text("review_note").notNull().default(""),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("workplan_tasks_engagement").on(t.engagementId)],
);

export const CHAT_KINDS = ["room", "dm", "group"] as const;
export type ChatKind = (typeof CHAT_KINDS)[number];

/**
 * A team chat. Rooms are seen by the roles in `archetypes`; 1:1 and group chats ("dm", "group")
 * are seen only by the people in `memberIds`.
 */
export const chatRooms = sqliteTable(
  "chat_rooms",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: CHAT_KINDS }).notNull().default("room"),
    /** JSON array of archetypes allowed in the room. */
    archetypes: text("archetypes").notNull().default("[]"),
    /** JSON array of user ids in a 1:1 or group chat. */
    memberIds: text("member_ids").notNull().default("[]"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("chat_rooms_engagement").on(t.engagementId)],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: id(),
    roomId: text("room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    /** Set on thread replies: the message they answer. */
    parentId: text("parent_id"),
    /** "text", or a meeting / call card whose details are in `meta`. */
    kind: text("kind", { enum: ["text", "meeting", "call"] }).notNull().default("text"),
    /** JSON: meeting { title, startsAt, minutes, link } or call { video, endedAt, link }. */
    meta: text("meta").notNull().default("{}"),
    /** JSON array of user ids @mentioned. */
    mentions: text("mentions").notNull().default("[]"),
    editedAt: integer("edited_at", { mode: "timestamp" }),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_room").on(t.roomId, t.createdAt), index("chat_messages_parent").on(t.parentId)],
);

export const chatReactions = sqliteTable(
  "chat_reactions",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })],
);

/** How far each person has read in each chat, for unread counts. */
export const chatReads = sqliteTable(
  "chat_reads",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: integer("last_read_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] })],
);

export const NOTE_KINDS = ["note", "decision", "open"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const caseNotes = sqliteTable(
  "case_notes",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: NOTE_KINDS }).notNull().default("note"),
    body: text("body").notNull(),
    moduleId: text("module_id").references(() => workplanModules.id, { onDelete: "set null" }),
    /** Where it came from, e.g. "Core team" or "AtlasGPT". */
    origin: text("origin").notNull().default(""),
    /** A pinned chat or GPT conversation this note points to. */
    link: text("link"),
    /** Only the author sees a private note. */
    isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("case_notes_engagement").on(t.engagementId)],
);

export const glossaryTerms = sqliteTable(
  "glossary_terms",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    category: text("category").notNull().default("Industry"),
    definition: text("definition").notNull().default(""),
    /** AI-suggested terms wait for a person to add them. */
    status: text("status", { enum: ["active", "suggested"] }).notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [index("glossary_terms_engagement").on(t.engagementId)],
);

export const deckSlides = sqliteTable(
  "deck_slides",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    section: text("section").notNull().default(""),
    headline: text("headline").notNull(),
    /** One point per line. */
    body: text("body").notNull().default(""),
    /** Source line shown under the slide. */
    sourceNote: text("source_note").notNull().default(""),
    moduleId: text("module_id").references(() => workplanModules.id, { onDelete: "set null" }),
    status: text("status", { enum: ["draft", "final"] }).notNull().default("draft"),
    sort: integer("sort").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("deck_slides_engagement").on(t.engagementId)],
);

/** Review rules the deck generator and checks follow (e.g. "headlines are so-whats"). */
export const deckLearnings = sqliteTable(
  "deck_learnings",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    rule: text("rule").notNull(),
    origin: text("origin").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("deck_learnings_engagement").on(t.engagementId)],
);

/**
 * Something a deck check found: a quality flag on one slide, or a contradiction between two
 * claims (slide vs slide, or slide vs takeaways, notes or the model).
 */
export const deckIssues = sqliteTable(
  "deck_issues",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["qc", "contradiction"] }).notNull(),
    severity: text("severity", { enum: ["high", "medium", "low"] }).notNull().default("medium"),
    slideId: text("slide_id").references(() => deckSlides.id, { onDelete: "cascade" }),
    claim: text("claim").notNull().default(""),
    /** The other side of a contradiction. */
    otherRef: text("other_ref").notNull().default(""),
    otherClaim: text("other_claim").notNull().default(""),
    detail: text("detail").notNull().default(""),
    fix: text("fix").notNull().default(""),
    status: text("status", { enum: ["open", "resolved", "dismissed"] }).notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [index("deck_issues_engagement").on(t.engagementId, t.kind)],
);

/** A conversation with the case GPT. Shared chats show under Team chats. */
export const gptChats = sqliteTable(
  "gpt_chats",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    folder: text("folder").notNull().default(""),
    shared: integer("shared", { mode: "boolean" }).notNull().default(false),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("gpt_chats_engagement").on(t.engagementId, t.userId)],
);

export const gptMessages = sqliteTable(
  "gpt_messages",
  {
    id: id(),
    chatId: text("chat_id")
      .notNull()
      .references(() => gptChats.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    body: text("body").notNull(),
    /** JSON array of { n, label, href, text } the answer cites. */
    sources: text("sources").notNull().default("[]"),
    createdAt: createdAt(),
  },
  (t) => [index("gpt_messages_chat").on(t.chatId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// iPhone app: sign-in hand-off and push devices.
// ---------------------------------------------------------------------------

/**
 * A one-time code the website hands the iPhone app after sign-in. The app proves it started the
 * sign-in by sending the verifier whose SHA-256 is `challenge` (PKCE), so a stolen code is useless.
 */
export const mobileAuthCodes = sqliteTable("mobile_auth_codes", {
  id: id(),
  codeHash: text("code_hash").notNull().unique(),
  challenge: text("challenge").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  firmId: text("firm_id")
    .notNull()
    .references(() => firms.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: createdAt(),
});

/** An iPhone that gets push notifications for a person (Apple device token). */
export const pushDevices = sqliteTable(
  "push_devices",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    /** "production" for TestFlight / App Store builds, "sandbox" for development builds. */
    environment: text("environment", { enum: ["production", "sandbox"] }).notNull().default("production"),
    createdAt: createdAt(),
  },
  (t) => [index("push_devices_user").on(t.userId)],
);

export const TODO_STATUSES = ["suggested", "open", "done", "dismissed"] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

/** Where a to-do came from. Teams and email plug in later through src/lib/todos/sources. */
export const TODO_SOURCES = ["manual", "channel", "teams", "email"] as const;
export type TodoSourceKind = (typeof TODO_SOURCES)[number];

/** A to-do on a case: added by hand, or suggested from chats and accepted. */
export const todos = sqliteTable(
  "todos",
  {
    id: id(),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Null means anyone on the team. */
    assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
    /** ISO date (YYYY-MM-DD). */
    dueDate: text("due_date"),
    status: text("status", { enum: TODO_STATUSES }).notNull().default("open"),
    source: text("source", { enum: TODO_SOURCES }).notNull().default("manual"),
    /** e.g. the chat's name, "Outlook" or a Teams channel. */
    sourceLabel: text("source_label").notNull().default(""),
    /** In-app link back to the message it came from. */
    sourceLink: text("source_link"),
    /** Stable id of the source message, so a rescan never raises it twice. */
    sourceKey: text("source_key"),
    /** JSON array of archetypes who may see it (the source chat's members); null is everyone. */
    audience: text("audience"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    doneAt: integer("done_at", { mode: "timestamp" }),
  },
  (t) => [index("todos_engagement").on(t.engagementId, t.status)],
);

export const JOB_RUN_STATUSES = ["running", "done", "failed"] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

/**
 * One row per scheduled job per time slot. The unique (job, slot) key is what makes a job run
 * at most once per slot, however many times the scheduler calls in. See src/lib/cron.
 */
export const jobRuns = sqliteTable(
  "job_runs",
  {
    id: id(),
    job: text("job").notNull(),
    /** Start of the slot, ISO UTC (e.g. "2026-11-11T20:15:00.000Z"). */
    slot: text("slot").notNull(),
    status: text("status", { enum: JOB_RUN_STATUSES }).notNull().default("running"),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    /** Short JSON summary from the job, or the error message when it failed. */
    result: text("result"),
  },
  (t) => [uniqueIndex("job_runs_job_slot").on(t.job, t.slot), index("job_runs_started").on(t.startedAt)],
);

export const NOTIFICATION_KINDS = ["mention", "reply", "task", "review", "todo"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_STATUSES = ["unread", "read", "snoozed", "done"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/**
 * Something that needs a person: the phone Activity inbox reads these, and reminders will nudge
 * from `next_nudge_at`. Rows are kept in step with their source by src/lib/notifications.
 */
export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    engagementId: text("engagement_id")
      .notNull()
      .references(() => engagements.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    /** Stable id of the source item (e.g. "m-<message id>", "t-<task id>"), one row per person. */
    key: text("key").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    /** In-app link to the item. */
    link: text("link").notNull(),
    /** JSON with the ids the apps open it by: roomId, messageId, threadId, taskId, todoId. */
    data: text("data").notNull().default("{}"),
    status: text("status", { enum: NOTIFICATION_STATUSES }).notNull().default("unread"),
    snoozeUntil: integer("snooze_until", { mode: "timestamp" }),
    nextNudgeAt: integer("next_nudge_at", { mode: "timestamp" }),
    /** "system" when it was closed because the source went away; "user" when the person closed it. */
    doneBy: text("done_by", { enum: ["system", "user"] }),
    /** When the source happened (message sent, task or to-do made). */
    occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("notifications_user_key").on(t.userId, t.key),
    index("notifications_user_status").on(t.userId, t.status, t.occurredAt),
    index("notifications_nudge").on(t.nextNudgeAt),
  ],
);
