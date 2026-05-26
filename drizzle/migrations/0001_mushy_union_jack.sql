CREATE TYPE "public"."review_status" AS ENUM('draft', 'pending', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TABLE "artifact_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"type" "artifact_type" NOT NULL,
	"content" text NOT NULL,
	"language" text,
	"title" text NOT NULL,
	"message" text,
	"author_user_id" text NOT NULL,
	"review_status" "review_status" DEFAULT 'draft' NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "current_version_id" text;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_versions_unique" ON "artifact_versions" USING btree ("artifact_id","version_number");--> statement-breakpoint
CREATE INDEX "artifact_versions_artifact_idx" ON "artifact_versions" USING btree ("artifact_id");