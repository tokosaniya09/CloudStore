import { db } from '../db.js';
import { FileItem, FileVersion, FileUploadCompleteRequest } from '../types.js';
import { s3StorageService, localStorageManager } from './s3.service.ts';
import { kafkaService } from './kafka.service.ts';

export class FileService {
  /**
   * Complete direct S3 upload & create file / new version record in atomic transaction
   */
  public completeFileUpload(userId: string, req: FileUploadCompleteRequest): FileItem {
    const org = db.organizations.get(req.orgId);
    if (!org) {
      throw new Error('Organization not found');
    }

    // Assemble any uploaded chunks into final file buffer
    if (req.uploadId) {
      localStorageManager.assembleChunks(req.uploadId, req.s3Key);
    }

    // Check storage quota constraint
    if (org.storageUsedBytes + req.sizeBytes > org.storageQuotaBytes) {
      throw new Error(`Organization storage quota exceeded (${(org.storageQuotaBytes / (1024 * 1024 * 1024)).toFixed(1)} GB limit)`);
    }

    // Find existing file in same folder with same name
    let file = Array.from(db.files.values()).find(
      (f) => f.organizationId === req.orgId && f.folderId === req.folderId && f.name.toLowerCase() === req.fileName.toLowerCase() && !f.isDeleted
    );

    const now = new Date().toISOString();
    let isNewFile = false;

    if (!file) {
      isNewFile = true;
      const fileId = 'file-' + Math.random().toString(36).substring(2, 9);
      file = {
        id: fileId,
        name: req.fileName,
        extension: req.extension || req.fileName.split('.').pop() || '',
        mimeType: req.mimeType,
        sizeBytes: req.sizeBytes,
        folderId: req.folderId,
        organizationId: req.orgId,
        ownerId: userId,
        currentVersionNumber: 1,
        s3StorageKey: req.s3Key,
        tags: [req.extension.toLowerCase(), 'uploaded'],
        isDeleted: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      db.files.set(file.id, file);
      db.saveFile(file);
    } else {
      // File exists - create NEW VERSION!
      const previousSizeBytes = file.sizeBytes;
      file.currentVersionNumber += 1;
      file.sizeBytes = req.sizeBytes;
      file.s3StorageKey = req.s3Key;
      file.updatedAt = now;

      // Adjust org storage used by delta
      const delta = req.sizeBytes - previousSizeBytes;
      org.storageUsedBytes += delta;
      db.saveFile(file);
    }

    if (isNewFile) {
      org.storageUsedBytes += req.sizeBytes;
    }
    org.updatedAt = now;
    db.saveOrg(org);

    // Save FileVersion record
    const version: FileVersion = {
      id: 'ver-' + Math.random().toString(36).substring(2, 9),
      fileId: file.id,
      versionNumber: file.currentVersionNumber,
      s3StorageKey: req.s3Key,
      sizeBytes: req.sizeBytes,
      uploadedById: userId,
      createdAt: now,
    };
    db.fileVersions.push(version);
    db.saveFileVersion(version);

    // Invalidate Redis cache
    db.redisCache.delete(`file:${file.id}`);

    // Emit Kafka event
    kafkaService.publish('file-events-topic', file.id, {
      eventType: 'FileUploaded',
      fileId: file.id,
      userId,
      details: {
        fileName: file.name,
        version: file.currentVersionNumber,
        sizeBytes: req.sizeBytes,
        orgId: req.orgId,
      },
    });

    return file;
  }

  /**
   * Rollback file to a specific prior version
   */
  public rollbackFileVersion(fileId: string, versionNumber: number, userId: string): { file: FileItem; newVersion: FileVersion } {
    const file = db.files.get(fileId);
    if (!file || file.isDeleted) {
      throw new Error('File not found');
    }

    const targetVersion = db.fileVersions.find((v) => v.fileId === fileId && v.versionNumber === versionNumber);
    if (!targetVersion) {
      throw new Error(`Version ${versionNumber} not found for this file`);
    }

    const now = new Date().toISOString();
    const newVersionNumber = file.currentVersionNumber + 1;

    // Update file state to point to target version s3 key & size
    file.currentVersionNumber = newVersionNumber;
    file.s3StorageKey = targetVersion.s3StorageKey;
    file.sizeBytes = targetVersion.sizeBytes;
    file.updatedAt = now;

    // Create new version entry reflecting the rollback
    const rollbackVersion: FileVersion = {
      id: 'ver-' + Math.random().toString(36).substring(2, 9),
      fileId: file.id,
      versionNumber: newVersionNumber,
      s3StorageKey: targetVersion.s3StorageKey,
      sizeBytes: targetVersion.sizeBytes,
      uploadedById: userId,
      createdAt: now,
    };
    db.fileVersions.push(rollbackVersion);
    db.saveFile(file);
    db.saveFileVersion(rollbackVersion);

    kafkaService.publish('file-events-topic', file.id, {
      eventType: 'FileVersionRollback',
      fileId: file.id,
      userId,
      details: { fileName: file.name, targetVersion: versionNumber, newVersionNumber },
    });

    return { file, newVersion: rollbackVersion };
  }

  /**
   * Generate S3 Pre-Signed Download URL
   */
  public createDownloadUrl(fileId: string, userId: string): string {
    const file = db.files.get(fileId);
    if (!file || file.isDeleted) {
      throw new Error('File not found');
    }

    kafkaService.publish('file-events-topic', file.id, {
      eventType: 'FileDownloaded',
      fileId: file.id,
      userId,
      details: { fileName: file.name, version: file.currentVersionNumber },
    });

    return s3StorageService.generatePreSignedDownloadUrl(file.s3StorageKey, file.name, 15);
  }

  /**
   * Get version history for a file
   */
  public getFileVersions(fileId: string): FileVersion[] {
    return db.fileVersions
      .filter((v) => v.fileId === fileId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  /**
   * Soft delete file & restore file
   */
  public deleteFile(fileId: string, userId: string): void {
    const file = db.files.get(fileId);
    if (!file || file.isDeleted) throw new Error('File not found');

    file.isDeleted = true;
    file.deletedAt = new Date().toISOString();
    db.saveFile(file);

    const org = db.organizations.get(file.organizationId);
    if (org) {
      org.storageUsedBytes = Math.max(0, org.storageUsedBytes - file.sizeBytes);
      db.saveOrg(org);
    }

    kafkaService.publish('file-events-topic', file.id, {
      eventType: 'FileDeleted',
      fileId: file.id,
      userId,
      details: { fileName: file.name },
    });
  }

  public restoreFile(fileId: string, userId: string): void {
    const file = db.files.get(fileId);
    if (!file || !file.isDeleted) throw new Error('File not found or not in trash');

    file.isDeleted = false;
    file.deletedAt = null;
    db.saveFile(file);

    const org = db.organizations.get(file.organizationId);
    if (org) {
      org.storageUsedBytes += file.sizeBytes;
      db.saveOrg(org);
    }

    kafkaService.publish('file-events-topic', file.id, {
      eventType: 'FileRestored',
      fileId: file.id,
      userId,
      details: { fileName: file.name },
    });
  }

  /**
   * Search files by query (filename, tags, extension)
   */
  public searchFiles(orgId: string, query: string): FileItem[] {
    const q = query.toLowerCase().trim();
    if (!q) {
      return Array.from(db.files.values()).filter((f) => f.organizationId === orgId && !f.isDeleted);
    }

    return Array.from(db.files.values()).filter(
      (f) =>
        f.organizationId === orgId &&
        !f.isDeleted &&
        (f.name.toLowerCase().includes(q) ||
          f.extension.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }
}

export const fileService = new FileService();
