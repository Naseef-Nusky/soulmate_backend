const accessKeyId = process.env.SPACES_ACCESS_KEY_ID || process.env.DO_SPACES_KEY;
const secretAccessKey = process.env.SPACES_SECRET_ACCESS_KEY || process.env.DO_SPACES_SECRET;
const endpoint = process.env.SPACES_ENDPOINT || 'https://lon1.digitaloceanspaces.com';
const bucket = process.env.SPACES_BUCKET || '';

// Lazily import the S3 client only when credentials are present, so local dev
// without Spaces (and without the package installed) will still run.
async function getS3Client() {
  if (!accessKeyId || !secretAccessKey || !bucket) return null;
  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: false,
      credentials: { accessKeyId, secretAccessKey },
    });
    return { s3, PutObjectCommand };
  } catch (_err) {
    return null;
  }
}

export async function uploadPngToSpaces({ key, dataBase64 }) {
  const client = await getS3Client();
  if (!client) return null;
  const { s3, PutObjectCommand } = client;
  const safeKey = key.replace(/^\/+/, '');
  const Body = Buffer.from(dataBase64, 'base64');
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: safeKey,
    Body,
    ContentType: 'image/png',
    ACL: 'public-read',
    CacheControl: 'public, max-age=31536000, immutable',
  });
  await s3.send(cmd);
  const publicBase = process.env.SPACES_PUBLIC_URL
    || `https://${bucket}.${new URL(endpoint).host}`;
  return `${publicBase}/${safeKey}`;
}


