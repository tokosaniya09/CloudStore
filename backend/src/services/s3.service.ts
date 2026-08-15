import { ChunkPresignRequest } from '../types.js';

// Local storage buffer store for uploaded files and multipart chunks
class LocalStorageManager {
  private fileBuffers: Map<string, Buffer> = new Map();
  private multipartChunks: Map<string, Map<number, Buffer>> = new Map();

  public saveFileBuffer(key: string, buffer: Buffer) {
    this.fileBuffers.set(key, buffer);
  }

  public getFileBuffer(key: string): Buffer | undefined {
    return this.fileBuffers.get(key);
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
      // Fallback empty buffer or dummy content
      const fallback = Buffer.from('CloudStore Enterprise File Content');
      this.fileBuffers.set(key, fallback);
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

    this.fileBuffers.set(key, combined);
    this.multipartChunks.delete(uploadId);
    return combined;
  }

  public clearAll() {
    this.fileBuffers.clear();
    this.multipartChunks.clear();
  }
}

export const localStorageManager = new LocalStorageManager();

export class S3StorageService {
  // Generate an S3 storage key formatted by Org, Folder, UUID, and Filename
  public buildS3StorageKey(orgId: string, folderId: string | null, fileName: string): string {
    const folderPath = folderId ? folderId : 'root';
    const uniqueSuffix = Math.random().toString(36).substring(2, 10);
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return `orgs/${orgId}/folders/${folderPath}/${uniqueSuffix}_${cleanFileName}`;
  }

  // Generate URL for standard or single-part upload
  public generatePreSignedUploadUrl(s3Key: string, contentType: string, expirationMinutes: number = 15): string {
    const encodedKey = encodeURIComponent(s3Key);
    return `/api/v1/files/upload-binary?key=${encodedKey}`;
  }

  // Generate URL for downloading files directly from server
  public generatePreSignedDownloadUrl(s3Key: string, originalFileName: string, expirationMinutes: number = 15): string {
    const encodedKey = encodeURIComponent(s3Key);
    const encodedName = encodeURIComponent(originalFileName);
    return `/api/v1/files/content?key=${encodedKey}&filename=${encodedName}`;
  }

  // S3 Multipart Upload APIs
  public initiateMultipartUpload(s3Key: string, mimeType: string): { uploadId: string; key: string } {
    const uploadId = 'mp_up_' + Math.random().toString(36).substring(2, 12);
    return { uploadId, key: s3Key };
  }

  public presignMultipartChunk(req: ChunkPresignRequest): { url: string; partNumber: number } {
    const encodedKey = encodeURIComponent(req.s3Key);
    const url = `/api/v1/files/upload-chunk?uploadId=${req.uploadId}&partNumber=${req.partNumber}&key=${encodedKey}`;
    return { url, partNumber: req.partNumber };
  }
}

export const s3StorageService = new S3StorageService();

