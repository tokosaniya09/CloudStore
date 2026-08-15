import { UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, BUCKET_NAME } from '../../../../lib/s3';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { uploadId, key, partNumber } = body;

    if (!uploadId || !key || !partNumber) {
      return Response.json(
        { error: 'Missing required parameters: uploadId, key, partNumber' },
        { status: 400 }
      );
    }

    const command = new UploadPartCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: Number(partNumber),
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    return Response.json({ url });
  } catch (error: any) {
    console.error('S3 Presign Part Error:', error);
    return Response.json(
      { error: error.message || 'Failed to generate pre-signed URL for part' },
      { status: 500 }
    );
  }
}
