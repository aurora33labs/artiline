CREATE TABLE "tracking_salts" (
	"date" text PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view_events" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"version_id" text NOT NULL,
	"viewer_hash" text NOT NULL,
	"user_id" text,
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_version_id_artifact_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."artifact_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "view_events_artifact_idx" ON "view_events" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "view_events_version_idx" ON "view_events" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "view_events_viewer_idx" ON "view_events" USING btree ("viewer_hash");