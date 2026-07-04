CREATE TYPE "public"."webhook_format" AS ENUM('raw', 'slack');--> statement-breakpoint
ALTER TYPE "public"."artifact_type" ADD VALUE 'external';--> statement-breakpoint
CREATE TABLE "external_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"path" text NOT NULL,
	"title" text,
	"last_hash" text,
	"last_changed_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_sites" (
	"artifact_id" text PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"public_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "stale_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD COLUMN "assigned_reviewer_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "page_url" text;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "response_code" integer;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "format" "webhook_format" DEFAULT 'raw' NOT NULL;--> statement-breakpoint
ALTER TABLE "external_pages" ADD CONSTRAINT "external_pages_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_sites" ADD CONSTRAINT "external_sites_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_pages_unique" ON "external_pages" USING btree ("artifact_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "external_sites_key_idx" ON "external_sites" USING btree ("public_key");--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_assigned_reviewer_id_users_id_fk" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_page_idx" ON "comments" USING btree ("artifact_id","page_url");