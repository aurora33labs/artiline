CREATE TYPE "public"."annotation_target_type" AS ENUM('point', 'area', 'global');--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"width" double precision,
	"height" double precision,
	"target_type" "annotation_target_type" DEFAULT 'point' NOT NULL,
	"iframe_x" double precision,
	"iframe_y" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotations_comment_idx" ON "annotations" USING btree ("comment_id");