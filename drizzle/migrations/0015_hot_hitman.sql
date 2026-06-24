ALTER TYPE "public"."annotation_target_type" ADD VALUE 'text';--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "selected_text" text;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "anchor_xpath" text;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "anchor_offset" integer;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "anchor_end_xpath" text;--> statement-breakpoint
ALTER TABLE "annotations" ADD COLUMN "anchor_end_offset" integer;