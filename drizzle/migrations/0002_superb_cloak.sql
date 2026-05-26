ALTER TABLE "comments" ADD COLUMN "version_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_version_id_artifact_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."artifact_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_version_idx" ON "comments" USING btree ("version_id");