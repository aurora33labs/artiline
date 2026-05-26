CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_user_id" text,
	"type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_workspace_idx" ON "events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");