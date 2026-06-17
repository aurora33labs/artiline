import "server-only";
import { nanoid } from "nanoid";
import { getObject, r2Configured, uploadObject } from "@/lib/r2";
import type { schema } from "@/lib/db";

/**
 * Artifact content storage. Content lives EITHER inline in the DB
 * (`artifact_versions.content`) OR in object storage (`content_key`) when an
 * S3-compatible backend is configured. Always read through `getContent` — never
 * touch `version.content` directly, or S3-backed artifacts will render blank.
 *
 * A small `content_snippet` (+ `content_bytes`) is always kept in the DB so list
 * thumbnails and search never need to load the full (possibly multi-MB / remote)
 * payload. This keeps the dashboard and metadata queries cheap regardless of size.
 */

/** First N chars kept inline for thumbnails / previews. */
export const SNIPPET_CHARS = 4096;

/** Hard cap on a single artifact's content, enforced at the upload boundary. */
export const MAX_CONTENT_BYTES = 12 * 1024 * 1024; // 12 MB

type ArtifactType = "html" | "markdown" | "code";

/** The subset of version columns needed to read content back. */
type ContentSource = Pick<
  typeof schema.artifactVersions.$inferSelect,
  "content" | "contentKey"
>;

/** Columns prepared for an insert/update of a version's content. */
export type PreparedContent = {
  content: string | null;
  contentKey: string | null;
  contentSnippet: string;
  contentBytes: number;
};

function objectKey(versionId: string): string {
  return `artifacts/${versionId}`;
}

function storageContentType(type: ArtifactType): string {
  // Stored type is informational; the streaming route re-derives a safe type.
  return type === "html" ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
}

/**
 * Decide where a version's content goes and return the columns to persist.
 * Pass the version id you will insert with (generate one via `newVersionId`)
 * so the object key is stable and matches the row.
 */
export async function prepareContent(
  versionId: string,
  content: string,
  type: ArtifactType,
): Promise<PreparedContent> {
  const contentBytes = Buffer.byteLength(content, "utf8");
  const contentSnippet = content.slice(0, SNIPPET_CHARS);

  if (r2Configured()) {
    const key = objectKey(versionId);
    await uploadObject(key, Buffer.from(content, "utf8"), storageContentType(type));
    return { content: null, contentKey: key, contentSnippet, contentBytes };
  }
  return { content, contentKey: null, contentSnippet, contentBytes };
}

/** Read a version's full content, from object storage or the DB column. */
export async function getContent(version: ContentSource): Promise<string> {
  if (version.contentKey) {
    const { body } = await getObject(version.contentKey);
    return Buffer.from(body).toString("utf8");
  }
  return version.content ?? "";
}

/** A fresh id to use for both the version row and its object key. */
export function newVersionId(): string {
  return nanoid(21);
}

/**
 * Browser path that streams a version's content with access control + hardened
 * headers (see the raw route). Used as the iframe `src` so the bytes never enter
 * the page's RSC payload. Carries the password attempt for `*_pw` artifacts.
 */
export function rawContentPath(opts: {
  slug: string;
  versionNumber?: number | null;
  pw?: string | null;
  // When true, the route serves the original source as a file download
  // (Content-Disposition: attachment) instead of the inline iframe document.
  download?: boolean;
}): string {
  const params = new URLSearchParams();
  if (opts.versionNumber != null) params.set("v", String(opts.versionNumber));
  if (opts.pw) params.set("pw", opts.pw);
  if (opts.download) params.set("download", "1");
  const qs = params.toString();
  return `/api/artifacts/raw/${opts.slug}${qs ? `?${qs}` : ""}`;
}
