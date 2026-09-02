const BUCKET = process.env.S3_BUCKET || process.env.MINIO_BUCKET || 'festa-olivia';
const useAws = process.env.S3_STORAGE === 'aws';
const region = process.env.AWS_REGION || 'us-east-1';

let s3;

function getS3() {
  if (s3) return s3;

  const { S3Client } = require('@aws-sdk/client-s3');

  const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.MINIO_SECRET_KEY,
  };

  s3 = useAws
    ? new S3Client({ region, credentials })
    : new S3Client({
        region,
        credentials,
        endpoint: process.env.MINIO_USE_SSL === 'true'
          ? `https://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`
          : `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
        forcePathStyle: true,
      });

  return s3;
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout após ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function ensureBucket() {
  const { HeadBucketCommand, CreateBucketCommand } = require('@aws-sdk/client-s3');
  const client = getS3();

  try {
    await withTimeout(
      client.send(new HeadBucketCommand({ Bucket: BUCKET })),
      5_000,
      'HeadBucket',
    );
    console.log(`Storage OK: bucket "${BUCKET}"`);
    return true;
  } catch (err) {
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

async function uploadFile(key, buffer, contentType) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await getS3().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return key;
}

async function getFileUrl(key, expiresIn = 3600) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return getSignedUrl(getS3(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

module.exports = { ensureBucket, uploadFile, getFileUrl, BUCKET };
