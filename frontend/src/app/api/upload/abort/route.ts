import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../../../../lib/s3';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { uploadId, key } = body;

    if (!uploadId || !key) {
      return Response.json(
        { error: 'Missing required parameters: uploadId, key' },
        { status: 400 }
      );
    }

    const command = new AbortMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    });

    await s3Client.send(command);

    return Response.json({ status: 'aborted' });
  } catch (error: any) {
    console.error('S3 Abort Upload Error:', error);
    return Response.json(
      { error: error.message || 'Failed to abort multipart upload' },
      { status: 500 }
    );
  }
}
