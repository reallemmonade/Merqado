import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

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

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
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
    createdAt: createdAt(),
  },
  (t) => [index("sources_engagement").on(t.engagementId)],
);

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
