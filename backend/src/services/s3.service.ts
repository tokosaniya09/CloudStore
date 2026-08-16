import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  CompletedPart,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ChunkPresignRequest } from '../types.js';

const STORAGE_DIR = path.join(process.cwd(), '.storage_uploads');

// Local storage buffer store for fallback & development
class LocalStorageManager {
  private fileBuffers: Map<string, Buffer> = new Map();
  private multipartChunks: Map<string, Map<number, Buffer>> = new Map();

  constructor() {
    try {
      if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }
    } catch (e) {
      console.warn('Storage dir creation warning:', e);
    }
  }

  private getDiskPath(key: string): string {
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    return path.join(STORAGE_DIR, hash);
  }

  public saveFileBuffer(key: string, buffer: Buffer) {
    this.fileBuffers.set(key, buffer);
    try {
      fs.writeFileSync(this.getDiskPath(key), buffer);
    } catch (err) {
      console.warn('Failed to persist file buffer to disk:', err);
    }
  }

  public getFileBuffer(key: string): Buffer | undefined {
    if (this.fileBuffers.has(key)) {
      return this.fileBuffers.get(key);
    }
    const diskPath = this.getDiskPath(key);
    if (fs.existsSync(diskPath)) {
      try {
        const buf = fs.readFileSync(diskPath);
        this.fileBuffers.set(key, buf);
        return buf;
      } catch (err) {
        console.warn('Failed to read file from disk:', err);
      }
    }
    return undefined;
  }

  public saveChunk(uploadId: string, partNumber: number, buffer: Buffer) {
    if (!this.multipartChunks.has(uploadId)) {
      this.multipartChunks.set(uploadId, new Map());
    }
    this.multipartChunks.get(uploadId)!.set(partNumber, buffer);
  }

  public assembleChunks(uploadId: string, key: string): Buffer {
    const partsMap = this.multipartChunks.get(uploadId);
    if (!partsMap || partsMap.size === 0) {
      const existing = this.getFileBuffer(key);
      if (existing) return existing;

      const fallback = Buffer.from('CloudStore Enterprise File Content');
      this.saveFileBuffer(key, fallback);
      return fallback;
    }

    const sortedPartNumbers = Array.from(partsMap.keys()).sort((a, b) => a - b);
    const totalLength = sortedPartNumbers.reduce((sum, num) => sum + partsMap.get(num)!.length, 0);
    const combined = Buffer.alloc(totalLength);
    let offset = 0;

    for (const num of sortedPartNumbers) {
      const chunk = partsMap.get(num)!;
      chunk.copy(combined, offset);
      offset += chunk.length;
    }

    this.saveFileBuffer(key, combined);
    this.multipartChunks.delete(uploadId);
    return combined;
  }

  public clearAll() {
    this.fileBuffers.clear();
    this.multipartChunks.clear();
    try {
      if (fs.existsSync(STORAGE_DIR)) {
        fs.rmSync(STORAGE_DIR, { recursive: true, force: true });
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }
    } catch (err) {
      console.warn('Failed clearing storage dir:', err);
    }
  }
}

export const localStorageManager = new LocalStorageManager();

export class S3StorageService {
  private s3Client: S3Client | null = null;
  private bucketName: string = '';
  private isAwsConfigured: boolean = false;

  constructor() {
    this.initS3Client();
  }

  private initS3Client() {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'us-east-1';
    const bucket = process.env.AWS_S3_BUCKET_NAME;

    if (accessKeyId && secretAccessKey && bucket) {
      try {
        this.s3Client = new S3Client({
          region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });
        this.bucketName = bucket;
        this.isAwsConfigured = true;
        console.log(`[Storage] Connected to Live AWS S3 (Bucket: ${bucket}, Region: ${region})`);
      } catch (err) {
        console.error('[Storage] Error initializing AWS S3 Client:', err);
        this.isAwsConfigured = false;
      }
    } else {
      this.isAwsConfigured = false;
      console.log('[Storage] AWS credentials not found - running in Local S3 Compatibility Mode');
    }
  }

  public isUsingAwsS3(): boolean {
    return this.isAwsConfigured && this.s3Client !== null;
  }

  public getBucketName(): string {
    return this.bucketName;
  }

  // Generate a clean S3 storage key partitioned by Org and Folder
  public buildS3StorageKey(orgId: string, folderId: string | null, fileName: string): string {
    const folderPath = folderId ? folderId : 'root';
    const uniqueSuffix = Math.random().toString(36).substring(2, 10);
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return `orgs/${orgId}/folders/${folderPath}/${uniqueSuffix}_${cleanFileName}`;
  }

  // Generate Pre-Signed Upload URL (Live AWS S3 or Local S3 proxy)
  public async generatePreSignedUploadUrl(
    s3Key: string,
    contentType: string,
    expirationMinutes: number = 15
  ): Promise<string> {
    if (this.isUsingAwsS3() && this.s3Client) {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ContentType: contentType,
      });
      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expirationMinutes * 60,
      });
    }

    // Fallback: Local proxy endpoint
    const encodedKey = encodeURIComponent(s3Key);
    return `/api/v1/files/upload-binary?key=${encodedKey}`;
  }

  // Generate Pre-Signed Download URL (Live AWS S3 or Local S3 proxy)
  public async generatePreSignedDownloadUrl(
    s3Key: string,
    originalFileName: string,
    isDownload: boolean = false,
    expirationMinutes: number = 60
  ): Promise<string> {
    if (this.isUsingAwsS3() && this.s3Client) {
      const disposition = isDownload ? 'attachment' : 'inline';
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ResponseContentDisposition: `${disposition}; filename="${encodeURIComponent(originalFileName)}"`,
      });
      return await getSignedUrl(this.s3Client, command, {
        expiresIn: expirationMinutes * 60,
      });
    }

    // Fallback: Local content endpoint
    const encodedKey = encodeURIComponent(s3Key);
    const encodedName = encodeURIComponent(originalFileName);
    const downloadQuery = isDownload ? '&download=true' : '';
    return `/api/v1/files/content?key=${encodedKey}&filename=${encodedName}${downloadQuery}`;
  }

  // Initiate Multipart Upload
  public async initiateMultipartUpload(
    s3Key: string,
    mimeType: string
  ): Promise<{ uploadId: string; key: string }> {
    if (this.isUsingAwsS3() && this.s3Client) {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        ContentType: mimeType,
      });
      const res = await this.s3Client.send(command);
      return {
        uploadId: res.UploadId || 'aws_mp_' + Date.now(),
        key: s3Key,
      };
    }

    const uploadId = 'mp_up_' + Math.random().toString(36).substring(2, 12);
    return { uploadId, key: s3Key };
  }

  // Presign Multipart Chunk
  public async presignMultipartChunk(
    req: ChunkPresignRequest,
    expirationMinutes: number = 15
  ): Promise<{ url: string; partNumber: number }> {
    if (this.isUsingAwsS3() && this.s3Client) {
      const command = new UploadPartCommand({
        Bucket: this.bucketName,
        Key: req.s3Key,
        UploadId: req.uploadId,
        PartNumber: req.partNumber,
      });
      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: expirationMinutes * 60,
      });
      return { url, partNumber: req.partNumber };
    }

    const encodedKey = encodeURIComponent(req.s3Key);
    const url = `/api/v1/files/upload-chunk?uploadId=${req.uploadId}&partNumber=${req.partNumber}&key=${encodedKey}`;
    return { url, partNumber: req.partNumber };
  }

  // Complete Multipart Upload in S3
  public async completeMultipartUpload(
    s3Key: string,
    uploadId: string,
    parts: { PartNumber: number; ETag: string }[]
  ): Promise<boolean> {
    if (this.isUsingAwsS3() && this.s3Client) {
      const completedParts: CompletedPart[] = parts.map((p) => ({
        PartNumber: p.PartNumber,
        ETag: p.ETag.startsWith('"') ? p.ETag : `"${p.ETag}"`,
      }));

      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: completedParts,
        },
      });

      await this.s3Client.send(command);
      return true;
    }

    // Local mode: assemble on local manager
    localStorageManager.assembleChunks(uploadId, s3Key);
    return true;
  }

  // Delete Object from Storage
  public async deleteObject(s3Key: string): Promise<boolean> {
    if (this.isUsingAwsS3() && this.s3Client) {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });
      await this.s3Client.send(command);
      return true;
    }
    return true;
  }
}

export const s3StorageService = new S3StorageService();
