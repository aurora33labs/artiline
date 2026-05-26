import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
export const R2_BUCKET = process.env.R2_BUCKET ?? "";
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

export function r2Configured(): boolean {
  return !!(accountId && accessKeyId && secretAccessKey && R2_BUCKET);
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!r2Configured()) throw new Error("R2 no configurado");
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
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
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn: 3600 },
  );
}
