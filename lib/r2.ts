import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
export const R2_BUCKET = process.env.R2_BUCKET ?? "";
const PUBLIC_URL = process.env.R2_PUBLIC_URL;
// Optional override for any S3-compatible backend (MinIO, Garage, etc). When
// unset, falls back to the Cloudflare R2 endpoint derived from R2_ACCOUNT_ID.
const ENDPOINT = process.env.R2_ENDPOINT;

export function r2Configured(): boolean {
  return !!((accountId || ENDPOINT) && accessKeyId && secretAccessKey && R2_BUCKET);
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!r2Configured()) throw new Error("R2 no configurado");
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`,
      // MinIO and most self-hosted S3 servers require path-style addressing.
      forcePathStyle: !!ENDPOINT,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
  }
  return _client;
}

export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function publicOrPresignedUrl(key: string): Promise<string> {
  if (PUBLIC_URL) return `${PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  // Self-hosted backends (R2_ENDPOINT) are typically reachable only over the
  // private network, so a presigned URL pointing at them is useless to the
  // browser. Stream the object back through the app instead.
  if (ENDPOINT) return `/api/export/file/${key}`;
  // Cloudflare R2: a presigned URL on the public host works directly.
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn: 3600 },
  );
}

/**
 * Best-effort delete of one or more objects. Used to clean up artifact content,
 * thumbnails and exports when an artifact is removed. Never throws — a storage
 * hiccup must not block the DB delete; at worst an object is briefly orphaned.
 */
export async function deleteObjects(keys: (string | null | undefined)[]): Promise<void> {
  if (!r2Configured()) return;
  const real = keys.filter((k): k is string => !!k);
  await Promise.all(
    real.map((key) =>
      client()
        .send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
        .catch(() => {}),
    ),
  );
}

/** Fetch an object's bytes (used to proxy downloads for private backends). */
export async function getObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string }> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
  );
  const body = await res.Body!.transformToByteArray();
  return { body, contentType: res.ContentType ?? "application/octet-stream" };
}
