import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { authService } from './services/auth.service.ts';
import { fileService } from './services/file.service.ts';
import { folderService } from './services/folder.service.ts';
import { orgService } from './services/org.service.ts';
import { sharingService } from './services/sharing.service.ts';
import { s3StorageService, localStorageManager } from './services/s3.service.ts';
import { auditService } from './services/audit.service.ts';
import { redisCache } from './services/redis.service.ts';
import { db } from './db.js';

async function startServer() {
  await db.init();
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use('/api/v1/files/upload-chunk', express.raw({ type: '*/*', limit: '50mb' }));
  app.use('/api/v1/files/upload-binary', express.raw({ type: '*/*', limit: '50mb' }));

  // Rate Limiting Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const limit = redisCache.checkRateLimit(clientIp, 150, 60);
    if (!limit.allowed) {
      return res.status(429).json({ error: 'Too many requests. Rate limit exceeded.' });
    }
    next();
  });

  // Extract actor user ID from Bearer token
  const getActorUserId = (req: Request): string => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // Format: jwt_access_usr-001_123456789
      const parts = token.split('_');
      if (parts.length >= 3 && parts[2]) {
        return parts[2];
      }
    }
    return req.query.userId as string || 'usr-001';
  };

  // --- API ROUTES ---

  // Health check
  app.get('/api/v1/health', (req, res) => {
    res.json({ status: 'ok', service: 'CloudStore API Gateway', timestamp: new Date().toISOString() });
  });

  // 1. Auth Routes
  app.post('/api/v1/auth/login', (req, res) => {
    try {
      const { email, password } = req.body;
      const result = authService.login(email, password || 'hashed_pass');
      res.json(result);
    } catch (err: any) {
      res.status(401).json({ error: err.message });
    }
  });

  app.post('/api/v1/auth/register', (req, res) => {
    try {
      const { email, firstName, lastName, systemRole } = req.body;
      const user = authService.register(email, firstName, lastName, systemRole);
      res.status(201).json(user);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/v1/auth/users', (req, res) => {
    res.json(authService.getAllUsers());
  });

  app.get('/api/v1/auth/me', (req, res) => {
    const userId = getActorUserId(req);
    const user = authService.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });

  // 2. Organization Routes
  app.get('/api/v1/orgs', (req, res) => {
    res.json(orgService.getAllOrganizations());
  });

  app.get('/api/v1/orgs/:id', (req, res) => {
    const org = orgService.getOrganizationById(req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  });

  app.get('/api/v1/orgs/:id/members', (req, res) => {
    res.json(orgService.getOrgMembers(req.params.id));
  });

  app.post('/api/v1/orgs/:id/invite', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const { email, role } = req.body;
      const member = orgService.inviteMember(req.params.id, email, role, actorUserId);
      res.status(201).json(member);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/v1/orgs/:id/quota', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const { storageQuotaBytes } = req.body;
      const org = orgService.updateStorageQuota(req.params.id, Number(storageQuotaBytes), actorUserId);
      res.json(org);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 3. Folder Routes (Materialized Path Pattern)
  app.get('/api/v1/folders', (req, res) => {
    const orgId = (req.query.orgId as string) || 'org-101';
    res.json(folderService.getFoldersInOrg(orgId));
  });

  app.post('/api/v1/folders', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const { name, parentId, orgId } = req.body;
      const folder = folderService.createFolder(name, parentId || null, orgId || 'org-101', actorUserId);
      res.status(201).json(folder);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/v1/folders/:id/move', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const { targetParentId, orgId } = req.body;
      const folder = folderService.moveFolder(req.params.id, targetParentId, orgId || 'org-101', actorUserId);
      res.json(folder);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/v1/folders/:id', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const orgId = (req.query.orgId as string) || 'org-101';
      const result = folderService.deleteFolderRecursive(req.params.id, orgId, actorUserId);
      res.json({ message: 'Folder and contents deleted', ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 4. S3 Direct Upload & File Management Routes
  // Upload Initiate
  app.post(['/api/v1/files/upload-init', '/api/upload/initiate'], (req, res) => {
    try {
      const { fileName, contentType, size, folderId, orgId } = req.body;
      const s3Key = s3StorageService.buildS3StorageKey(orgId || 'org-101', folderId || null, fileName);
      const initData = s3StorageService.initiateMultipartUpload(s3Key, contentType || 'application/octet-stream');
      const presignedPutUrl = s3StorageService.generatePreSignedUploadUrl(s3Key, contentType || 'application/octet-stream', 15);
      
      res.json({
        uploadId: initData.uploadId,
        key: initData.key,
        presignedPutUrl,
        s3Key,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Presign Part
  app.all(['/api/v1/files/upload-presign-part', '/api/upload/presign-part'], (req, res) => {
    try {
      const uploadId = req.body?.uploadId || req.query.uploadId;
      const key = req.body?.key || req.query.key;
      const partNumber = req.body?.partNumber || req.query.partNumber;
      const presign = s3StorageService.presignMultipartChunk({ uploadId, s3Key: key, partNumber: Number(partNumber) });
      res.json(presign);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Receive Chunk Data Endpoint
  app.all(['/api/v1/files/upload-chunk', '/api/upload/chunk'], (req, res) => {
    try {
      const uploadId = (req.query.uploadId as string) || req.body?.uploadId || 'default';
      const partNumber = Number(req.query.partNumber || req.body?.partNumber || 1);
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body?.chunkData || '', 'base64');
      localStorageManager.saveChunk(uploadId, partNumber, buf);
      res.json({ status: 'ok', partNumber });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Receive Binary File Endpoint
  app.all(['/api/v1/files/upload-binary', '/api/upload/binary'], (req, res) => {
    try {
      const key = (req.query.key as string) || 'default_key';
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
      localStorageManager.saveFileBuffer(key, buf);
      res.json({ status: 'ok', key });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Stream File Content
  app.get(['/api/v1/files/content', '/api/files/content'], (req, res) => {
    const key = (req.query.key as string) || '';
    const filename = (req.query.filename as string) || 'download';
    const buf = localStorageManager.getFileBuffer(key);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    if (buf) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(buf);
    } else {
      res.setHeader('Content-Type', 'text/plain');
      res.send(Buffer.from(`CloudStore File Content: ${filename}`));
    }
  });

  // Clear All Demo Data Endpoint
  app.post('/api/v1/data/clear', async (req, res) => {
    try {
      await db.clearAllData();
      localStorageManager.clearAll();
      res.json({ status: 'cleared', message: 'All demo data wiped successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Complete Upload
  app.post(['/api/v1/files/upload-complete', '/api/upload/complete'], (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const { uploadId, key, fileName, size, mimeType, extension, folderId, orgId } = req.body;

      const file = fileService.completeFileUpload(actorUserId, {
        uploadId,
        s3Key: key,
        fileName: fileName || key.split('_').slice(1).join('_') || 'uploaded_file',
        extension: extension || (fileName ? fileName.split('.').pop() : 'dat'),
        mimeType: mimeType || 'application/octet-stream',
        sizeBytes: Number(size) || 1024,
        folderId: folderId || null,
        orgId: orgId || 'org-101',
      });

      res.status(201).json({ status: 'completed', file });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Abort Upload
  app.post(['/api/v1/files/upload-abort', '/api/upload/abort'], (req, res) => {
    res.json({ status: 'aborted', message: 'Multipart upload aborted in S3' });
  });

  // Search Files
  app.get('/api/v1/files/search', (req, res) => {
    const orgId = (req.query.orgId as string) || 'org-101';
    const query = (req.query.query as string) || '';
    res.json(fileService.searchFiles(orgId, query));
  });

  // Get File Versions & Rollback
  app.get('/api/v1/files/:id/versions', (req, res) => {
    res.json(fileService.getFileVersions(req.params.id));
  });

  app.post('/api/v1/files/:id/rollback', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const { versionNumber } = req.body;
      const result = fileService.rollbackFileVersion(req.params.id, Number(versionNumber), actorUserId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Pre-Signed Download URL
  app.get('/api/v1/files/:id/download', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const downloadUrl = fileService.createDownloadUrl(req.params.id, actorUserId);
      res.json({ downloadUrl });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  // Delete & Restore File
  app.delete('/api/v1/files/:id', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      fileService.deleteFile(req.params.id, actorUserId);
      res.json({ message: 'File moved to trash' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/v1/files/:id/restore', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      fileService.restoreFile(req.params.id, actorUserId);
      res.json({ message: 'File restored from trash' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 5. Sharing Routes
  app.post('/api/v1/sharing/grant', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const { fileId, folderId, granteeType, granteeId, permissionLevel } = req.body;
      const perm = sharingService.grantPermission(
        fileId || null,
        folderId || null,
        granteeType,
        granteeId,
        permissionLevel,
        actorUserId
      );
      res.status(201).json(perm);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/v1/sharing/public', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const { fileId, folderId, permissionLevel, expiresInDays, maxDownloads } = req.body;
      const share = sharingService.createPublicShare(
        fileId || null,
        folderId || null,
        actorUserId,
        permissionLevel || 'VIEW',
        expiresInDays ? Number(expiresInDays) : 7,
        maxDownloads ? Number(maxDownloads) : 100
      );
      res.status(201).json(share);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/v1/sharing/public/:token', (req, res) => {
    try {
      const share = sharingService.getPublicShare(req.params.token);
      let file = null;
      let folder = null;
      if (share.fileId) file = db.files.get(share.fileId);
      if (share.folderId) folder = db.folders.get(share.folderId);
      res.json({ share, file, folder });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  app.get('/api/v1/sharing/public/:token/download', (req, res) => {
    try {
      const share = sharingService.getPublicShare(req.params.token);
      if (!share.fileId) throw new Error('Share link does not target a file');
      const file = db.files.get(share.fileId);
      if (!file) throw new Error('File not found');

      sharingService.recordPublicDownload(req.params.token);
      const downloadUrl = s3StorageService.generatePreSignedDownloadUrl(file.s3StorageKey, file.name, 15);
      res.json({ downloadUrl, file });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 6. Audit & Notification Routes
  app.get('/api/v1/audit/logs', (req, res) => {
    const { actorId, action, limit } = req.query;
    res.json(auditService.getAuditLogs(actorId as string, action as string, limit ? Number(limit) : 50));
  });

  app.get('/api/v1/notifications', (req, res) => {
    const userId = (req.query.userId as string) || getActorUserId(req);
    res.json(auditService.getNotificationsForUser(userId));
  });

  app.patch('/api/v1/notifications/:id/read', (req, res) => {
    auditService.markNotificationAsRead(req.params.id);
    res.json({ status: 'success' });
  });

  // 7. Analytics Dashboard Route
  app.get('/api/v1/analytics/summary', (req, res) => {
    const orgId = (req.query.orgId as string) || 'org-101';
    const org = db.organizations.get(orgId);
    const files = Array.from(db.files.values()).filter((f) => f.organizationId === orgId && !f.isDeleted);
    const folders = Array.from(db.folders.values()).filter((f) => f.organizationId === orgId && !f.isDeleted);

    const fileTypeCounts: Record<string, number> = {};
    files.forEach((f) => {
      fileTypeCounts[f.extension] = (fileTypeCounts[f.extension] || 0) + 1;
    });

    const activeUsers = Array.from(db.users.values());

    res.json({
      organization: org,
      totalFiles: files.length,
      totalFolders: folders.length,
      totalStorageUsedBytes: org ? org.storageUsedBytes : 0,
      totalStorageQuotaBytes: org ? org.storageQuotaBytes : 0,
      fileTypeDistribution: fileTypeCounts,
      totalAuditEvents: db.auditLogs.length,
      activeUsersCount: activeUsers.length,
    });
  });

  // --- VITE MIDDLEWARE FOR FRONTEND SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CloudStore Enterprise Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
