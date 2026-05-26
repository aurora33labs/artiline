-- Postgres Full Text Search on artifact_versions
ALTER TABLE "artifact_versions" ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("content", ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS "artifact_versions_search_idx"
  ON "artifact_versions"
  USING gin ("search_tsv");
