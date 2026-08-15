import { CreateMultipartUploadCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../../../../lib/s3';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fileName, contentType } = body;

    if (!fileName || !contentType) {
      return Response.json(
        { error: 'Missing required parameters: fileName, contentType' },
        { status: 400 }
      );
    }

    const key = `uploads/${uuidv4()}-${fileName}`;

    const command = new CreateMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const response = await s3Client.send(command);

    if (!response.UploadId) {
      throw new Error('Failed to obtain UploadId from AWS S3');
    }

    return Response.json({
      uploadId: response.UploadId,
      key,
    });
  } catch (error: any) {
    console.error('S3 Initiate Upload Error:', error);
    return Response.json(
      { error: error.message || 'Failed to initiate multipart upload' },
      { status: 500 }
    );
  }
}
