import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../../../../lib/s3';

interface CompletedPart {
  PartNumber: number;
  ETag: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { uploadId, key, parts } = body;

    if (!uploadId || !key || !Array.isArray(parts) || parts.length === 0) {
      return Response.json(
        { error: 'Missing required parameters: uploadId, key, parts' },
        { status: 400 }
      );
    }

    const sortedParts: CompletedPart[] = parts
      .map((part: CompletedPart) => ({
        PartNumber: Number(part.PartNumber),
        ETag: part.ETag,
      }))
      .sort((a, b) => a.PartNumber - b.PartNumber);

    const command = new CompleteMultipartUploadCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts,
      },
    });

    const response = await s3Client.send(command);

    return Response.json({
      location: response.Location,
      key: response.Key,
      status: 'completed',
    });
  } catch (error: any) {
    console.error('S3 Complete Upload Error:', error);
    return Response.json(
      { error: error.message || 'Failed to complete multipart upload' },
      { status: 500 }
    );
  }
}
