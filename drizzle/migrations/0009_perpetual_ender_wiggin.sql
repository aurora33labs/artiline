CREATE TABLE "sso_configs" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "view_events" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "view_events" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "view_events" ADD COLUMN "dwell_ms" integer;--> statement-breakpoint
ALTER TABLE "view_events" ADD COLUMN "scroll_depth" integer;--> statement-breakpoint
ALTER TABLE "sso_configs" ADD CONSTRAINT "sso_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "view_events_session_idx" ON "view_events" USING btree ("session_id");