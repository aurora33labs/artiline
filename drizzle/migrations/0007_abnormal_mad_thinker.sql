CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'paused');--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"tier" text NOT NULL,
	"status" "subscription_status" NOT NULL,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_customer_idx" ON "subscriptions" USING btree ("stripe_customer_id");