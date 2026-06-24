import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  primaryKey,
  uniqueIndex,
  index,
  integer,
  boolean,
  jsonb,
  doublePrecision,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

const id = () => text("id").$defaultFn(() => nanoid(21)).primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const roleEnum = pgEnum("workspace_role", ["owner", "admin", "member"]);
export const artifactTypeEnum = pgEnum("artifact_type", [
  "html",
  "markdown",
  "code",
]);
export const visibilityEnum = pgEnum("artifact_visibility", [
  "internal_pw",
  "internal",
  "public_pw",
  "public",
]);
export const exportFormatEnum = pgEnum("export_format", ["png"]);
export const reviewStatusEnum = pgEnum("review_status", [
  "draft",
  "pending",
  "approved",
  "changes_requested",
]);
export const annotationTargetTypeEnum = pgEnum("annotation_target_type", [
  "point",
  "area",
  "global",
  "text",
  "element",
]);

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  // bcrypt hash for email+password sign-in. Null for users created via magic
  // link / SSO who never set one. Lets self-host instances onboard without email.
  passwordHash: text("password_hash"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  createdAt: createdAt(),
});

export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    branding: jsonb("branding").$type<{
      logoUrl?: string;
      primaryColor?: string;
      brandName?: string;
      hideFooterChip?: boolean;
    } | null>(),
    // Max retained versions per artifact. Older versions (and their storage) are
    // pruned past this. Owner-configurable in workspace settings; default 5.
    maxVersions: integer("max_versions").notNull().default(5),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("workspaces_slug_idx").on(t.slug)],
);

export const workspaceDomains = pgTable(
  "workspace_domains",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull(),
    status: text("status").notNull(), // pending|verified|failed
    sslStatus: text("ssl_status"), // pending|active|failed
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    cloudflareHostnameId: text("cloudflare_hostname_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("workspace_domains_hostname_idx").on(t.hostname),
    index("workspace_domains_workspace_idx").on(t.workspaceId),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("member"),
    joinedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("workspace_members_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    token: text("token").notNull(),
    role: roleEnum("role").notNull().default("member"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    // Cumulative wrong-password count on the accept page. Survives attempt-log
    // pruning so a slow brute force can't outlast the window — at the cap the
    // invite is killed (expired) and must be reissued.
    failedAttempts: integer("failed_attempts").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invitations_token_idx").on(t.token),
    index("invitations_workspace_idx").on(t.workspaceId),
  ],
);

// Generic throttle log for password auth (login + invite-accept). Rows are
// failed attempts keyed by email / ip / invite-token; a sliding-window count
// drives temporary cooldowns. Pruned opportunistically on write.
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: id(),
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_attempts_key_idx").on(t.key, t.kind, t.createdAt)],
);

export const artifacts = pgTable(
  "artifacts",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    // Legacy content fields — kept nullable for backfill safety, will be dropped
    // in a follow-up migration after Phase 1 lands. Live content lives in
    // artifact_versions (see currentVersionId).
    type: artifactTypeEnum("type"),
    title: text("title"),
    content: text("content"),
    language: text("language"),
    currentVersionId: text("current_version_id"),
    visibility: visibilityEnum("visibility").notNull().default("internal"),
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    views: integer("views").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("artifacts_slug_idx").on(t.slug),
    index("artifacts_workspace_idx").on(t.workspaceId),
  ],
);

export const artifactVersions = pgTable(
  "artifact_versions",
  {
    id: id(),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    type: artifactTypeEnum("type").notNull(),
    // Content lives EITHER inline here (DB, when no object storage configured or
    // small) OR in object storage under `contentKey`. Read via lib/artifact-content
    // (getContent) which picks the right source — never read `content` directly.
    content: text("content"),
    contentKey: text("content_key"),
    // First few KB, always in the DB — powers list thumbnails and search without
    // loading the full (possibly multi-MB, possibly S3) content.
    contentSnippet: text("content_snippet"),
    contentBytes: integer("content_bytes"),
    // Optional pre-rendered PNG thumbnail key (object storage) for the dashboard.
    thumbKey: text("thumb_key"),
    language: text("language"),
    title: text("title").notNull(),
    message: text("message"),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewStatus: reviewStatusEnum("review_status")
      .notNull()
      .default("draft"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("artifact_versions_unique").on(t.artifactId, t.versionNumber),
    index("artifact_versions_artifact_idx").on(t.artifactId),
  ],
);

export const artifactExports = pgTable("artifact_exports", {
  id: id(),
  artifactId: text("artifact_id")
    .notNull()
    .references(() => artifacts.id, { onDelete: "cascade" }),
  format: exportFormatEnum("format").notNull(),
  r2Key: text("r2_key").notNull(),
  createdAt: createdAt(),
});

export const comments = pgTable(
  "comments",
  {
    id: id(),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    versionId: text("version_id").references(() => artifactVersions.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    authorName: text("author_name"),
    body: text("body").notNull(),
    parentCommentId: text("parent_comment_id").references(
      (): AnyPgColumn => comments.id,
      { onDelete: "cascade" },
    ),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("comments_artifact_idx").on(t.artifactId),
    index("comments_version_idx").on(t.versionId),
    index("comments_parent_idx").on(t.parentCommentId),
  ],
);

export const annotations = pgTable(
  "annotations",
  {
    id: id(),
    commentId: text("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    x: doublePrecision("x").notNull(),
    y: doublePrecision("y").notNull(),
    width: doublePrecision("width"),
    height: doublePrecision("height"),
    targetType: annotationTargetTypeEnum("target_type").notNull().default("point"),
    iframeX: doublePrecision("iframe_x"),
    iframeY: doublePrecision("iframe_y"),
    selectedText: text("selected_text"),
    anchorXPath: text("anchor_xpath"),
    anchorOffset: integer("anchor_offset"),
    anchorEndXPath: text("anchor_end_xpath"),
    anchorEndOffset: integer("anchor_end_offset"),
    createdAt: createdAt(),
  },
  (t) => [
    index("annotations_comment_idx").on(t.commentId),
  ],
);

export const trackingSalts = pgTable("tracking_salts", {
  date: text("date").primaryKey(),
  salt: text("salt").notNull(),
  createdAt: createdAt(),
});

export const viewEvents = pgTable(
  "view_events",
  {
    id: id(),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    versionId: text("version_id")
      .notNull()
      .references(() => artifactVersions.id, { onDelete: "cascade" }),
    viewerHash: text("viewer_hash").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    referrer: text("referrer"),
    // Advanced tracking (gated by tracking_advanced feature; populated by /api/track beacon)
    sessionId: text("session_id"),
    country: text("country"),
    dwellMs: integer("dwell_ms"),
    scrollDepth: integer("scroll_depth"), // 0..100
    createdAt: createdAt(),
  },
  (t) => [
    index("view_events_artifact_idx").on(t.artifactId),
    index("view_events_version_idx").on(t.versionId),
    index("view_events_viewer_idx").on(t.viewerHash),
    index("view_events_session_idx").on(t.sessionId),
  ],
);

export const ssoConfigs = pgTable(
  "sso_configs",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "saml" | "oidc"
    enabled: boolean("enabled").notNull().default(false),
    config: jsonb("config").notNull(), // provider-specific (entityID, ssoUrl, x509cert, etc.)
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

export const reactions = pgTable(
  "reactions",
  {
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.artifactId, t.userId, t.emoji] })],
);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id"),
    tier: text("tier").notNull(), // "studio" | "agency" | "agency_plus"
    status: subscriptionStatusEnum("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("subscriptions_stripe_customer_idx").on(t.stripeCustomerId)],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id"),
    payload: jsonb("payload").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("events_workspace_idx").on(t.workspaceId, t.createdAt),
    index("events_type_idx").on(t.type),
  ],
);

export const webhooks = pgTable(
  "webhooks",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: jsonb("events").notNull().$type<string[]>(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("webhooks_workspace_idx").on(t.workspaceId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("webhook_deliveries_webhook_idx").on(t.webhookId),
    index("webhook_deliveries_status_idx").on(t.status, t.nextAttemptAt),
  ],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<"oauth" | "oidc" | "email" | "webauthn">().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const authSessions = pgTable("auth_sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const authVerificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);
