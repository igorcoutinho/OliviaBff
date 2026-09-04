import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const BUCKET = process.env.S3_BUCKET || process.env.MINIO_BUCKET || 'festa-olivia';
const useAws = process.env.S3_STORAGE === 'aws';
const region = process.env.AWS_REGION || 'us-east-1';

let s3Instance: S3Client | null = null;

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function getS3(): S3Client {
  if (s3Instance) return s3Instance;

  const credentials = {
    accessKeyId: (process.env.AWS_ACCESS_KEY_ID || process.env.MINIO_ACCESS_KEY) as string,
    secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || process.env.MINIO_SECRET_KEY) as string,
  };

  s3Instance = useAws
    ? new S3Client({ region, credentials })
    : new S3Client({
        region,
        credentials,
        endpoint:
          process.env.MINIO_USE_SSL === 'true'
            ? `https://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`
            : `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
        forcePathStyle: true,
      });

  return s3Instance;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout após ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function ensureBucket(): Promise<boolean> {
  const client = getS3();
  try {
    await withTimeout(client.send(new HeadBucketCommand({ Bucket: BUCKET })), 5_000, 'HeadBucket');
    console.log(`Storage OK: bucket "${BUCKET}"`);
    return true;
  } catch (err: any) {
    if (useAws) {
      console.warn(`⚠️  Bucket S3 "${BUCKET}" inacessível — uploads vão falhar até corrigir IAM/região.`);
      console.warn(`   Detalhe: ${err.message}`);
      return false;
    }
    await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`Bucket "${BUCKET}" criado no MinIO`);
    return true;
  }
}

export async function uploadFile(key: string, buffer: Buffer, contentType: string): Promise<string> {
  await getS3().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return key;
}

export async function getFileUrl(key: string, expiresIn = 3600): Promise<string> {
  const now = Date.now();
  const cached = signedUrlCache.get(key);
  // Reusa a mesma URL enquanto faltar mais de 10% do TTL (evita redownload no app)
  if (cached && cached.expiresAt - now > expiresIn * 100) {
    return cached.url;
  }

  const url = await getSignedUrl(
    getS3(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn },
  );
  signedUrlCache.set(key, { url, expiresAt: now + expiresIn * 1000 });
  return url;
}

export async function deleteFile(key: string): Promise<void> {
  if (!key) return;
  await getS3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
