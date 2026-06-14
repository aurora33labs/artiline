ALTER TABLE "artifact_versions" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD COLUMN "content_key" text;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD COLUMN "content_snippet" text;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD COLUMN "content_bytes" integer;--> statement-breakpoint
ALTER TABLE "artifact_versions" ADD COLUMN "thumb_key" text;--> statement-breakpoint
-- Backfill snippet + byte size for existing inline content (idempotent).
UPDATE "artifact_versions"
  SET "content_snippet" = substring("content" for 4096),
      "content_bytes" = octet_length("content")
  WHERE "content" IS NOT NULL AND "content_snippet" IS NULL;