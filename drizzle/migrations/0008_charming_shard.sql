CREATE TABLE "workspace_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"hostname" text NOT NULL,
	"status" text NOT NULL,
	"ssl_status" text,
	"verified_at" timestamp with time zone,
	"cloudflare_hostname_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "branding" jsonb;--> statement-breakpoint
ALTER TABLE "workspace_domains" ADD CONSTRAINT "workspace_domains_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_domains_hostname_idx" ON "workspace_domains" USING btree ("hostname");--> statement-breakpoint
CREATE INDEX "workspace_domains_workspace_idx" ON "workspace_domains" USING btree ("workspace_id");