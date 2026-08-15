import { S3Client } from '@aws-sdk/client-s3';

const region = process.env.AWS_REGION || 'us-east-1';
const endpoint = process.env.AWS_S3_ENDPOINT;

export const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
  ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
});

export const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'cloudstore-bucket';
