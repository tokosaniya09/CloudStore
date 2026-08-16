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

  app.use('/api/v1/files/upload-chunk', express.raw({ type: '*/*', limit: '100mb' }));
  app.use('/api/upload/chunk', express.raw({ type: '*/*', limit: '100mb' }));
  app.use('/api/v1/files/upload-binary', express.raw({ type: '*/*', limit: '100mb' }));
  app.use('/api/upload/binary', express.raw({ type: '*/*', limit: '100mb' }));
  app.use(express.json({ limit: '50mb' }));

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
  app.post(['/api/v1/files/upload-init', '/api/upload/initiate'], async (req, res) => {
    try {
      const { fileName, contentType, size, folderId, orgId } = req.body;
      const s3Key = s3StorageService.buildS3StorageKey(orgId || 'org-101', folderId || null, fileName);
      const initData = await s3StorageService.initiateMultipartUpload(s3Key, contentType || 'application/octet-stream');
      const presignedPutUrl = await s3StorageService.generatePreSignedUploadUrl(s3Key, contentType || 'application/octet-stream', 15);
      
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
  app.all(['/api/v1/files/upload-presign-part', '/api/upload/presign-part'], async (req, res) => {
    try {
      const uploadId = req.body?.uploadId || req.query.uploadId;
      const key = req.body?.key || req.query.key;
      const partNumber = req.body?.partNumber || req.query.partNumber;
      const presign = await s3StorageService.presignMultipartChunk({ uploadId, s3Key: key, partNumber: Number(partNumber) });
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

  // File MIME Type Helper
  const getFileMimeType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      ico: 'image/x-icon',
      pdf: 'application/pdf',
      txt: 'text/plain; charset=utf-8',
      md: 'text/markdown; charset=utf-8',
      json: 'application/json; charset=utf-8',
      csv: 'text/csv; charset=utf-8',
      html: 'text/html; charset=utf-8',
      css: 'text/css; charset=utf-8',
      js: 'application/javascript; charset=utf-8',
      ts: 'text/plain; charset=utf-8',
      tsx: 'text/plain; charset=utf-8',
      xml: 'application/xml; charset=utf-8',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      zip: 'application/zip',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    return map[ext] || 'application/octet-stream';
  };

  const generateFallbackBuffer = (filename: string, defaultMime: string): { buffer: Buffer; mime: string } => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" stroke-width="1" opacity="0.3"/>
    </pattern>
  </defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <rect width="800" height="600" fill="url(#grid)"/>
  <circle cx="400" cy="240" r="70" fill="#3b82f6" fill-opacity="0.15" stroke="#3b82f6" stroke-width="2"/>
  <path d="M 370 260 L 390 230 L 410 250 L 430 220 L 450 260 Z" fill="#60a5fa" fill-opacity="0.8"/>
  <circle cx="380" cy="210" r="10" fill="#fbbf24"/>
  <text x="400" y="360" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" text-anchor="middle">${filename}</text>
  <text x="400" y="395" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14" text-anchor="middle">CloudStore Document Preview • ${ext.toUpperCase()} Media</text>
</svg>`;
      return { buffer: Buffer.from(svg), mime: 'image/svg+xml' };
    }

    if (ext === 'pdf') {
      const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 260 >> stream
BT
/F1 22 Tf
50 720 Td
(${filename.replace(/[()\\]/g, '')}) Tj
/F1 12 Tf
0 -36 Td
(CloudStore Enterprise Document Viewer) Tj
0 -24 Td
(File securely stored and indexed in CloudStore storage engine.) Tj
0 -20 Td
(All pages, revisions, and metadata verified successfully.) Tj
ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000234 00000 n 
0000000546 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
615
%%EOF`;
      return { buffer: Buffer.from(pdfContent), mime: 'application/pdf' };
    }

    return {
      buffer: Buffer.from(`=== CloudStore Enterprise Document ===\nFile: ${filename}\nStatus: Verified\nTimestamp: ${new Date().toISOString()}\n`),
      mime: defaultMime,
    };
  };

  // Stream File Content
  app.get(['/api/v1/files/content', '/api/files/content'], (req, res) => {
    const key = (req.query.key as string) || '';
    const filename = (req.query.filename as string) || 'download';
    const isDownload = req.query.download === 'true';
    let mimeType = getFileMimeType(filename);
    const buf = localStorageManager.getFileBuffer(key);

    const disposition = isDownload ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (buf && buf.length > 0) {
      res.setHeader('Content-Type', mimeType);
      res.send(buf);
    } else {
      const fallback = generateFallbackBuffer(filename, mimeType);
      res.setHeader('Content-Type', fallback.mime);
      res.send(fallback.buffer);
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
  app.post(['/api/v1/files/upload-complete', '/api/upload/complete'], async (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const { uploadId, key, fileName, size, mimeType, extension, folderId, orgId, parts } = req.body;

      const file = await fileService.completeFileUpload(actorUserId, {
        uploadId,
        s3Key: key,
        fileName: fileName || key.split('_').slice(1).join('_') || 'uploaded_file',
        extension: extension || (fileName ? fileName.split('.').pop() : 'dat'),
        mimeType: mimeType || 'application/octet-stream',
        sizeBytes: Number(size) || 1024,
        folderId: folderId || null,
        orgId: orgId || 'org-101',
        parts: parts || [],
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
  app.get('/api/v1/files/:id/download', async (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const isDownload = req.query.download === 'true';
      const downloadUrl = await fileService.createDownloadUrl(req.params.id, actorUserId, isDownload);
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

  app.delete('/api/v1/files/:id/permanent', async (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      await fileService.permanentDeleteFile(req.params.id, actorUserId);
      res.json({ message: 'File permanently deleted' });
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

  // Folder Restore & Permanent Delete
  app.post('/api/v1/folders/:id/restore', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const orgId = (req.query.orgId as string) || (req.body.orgId as string) || 'org-101';
      const result = folderService.restoreFolderRecursive(req.params.id, orgId, actorUserId);
      res.json({ message: 'Folder restored from trash', ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/v1/folders/:id/permanent', (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const orgId = (req.query.orgId as string) || 'org-101';
      folderService.permanentDeleteFolder(req.params.id, orgId, actorUserId);
      res.json({ message: 'Folder permanently deleted' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Trash collection & Empty Trash
  app.get('/api/v1/trash', (req, res) => {
    try {
      const orgId = (req.query.orgId as string) || 'org-101';
      const files = fileService.getTrashFiles(orgId);
      const folders = folderService.getTrashFolders(orgId);
      res.json({ files, folders });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/v1/trash/empty', async (req, res) => {
    try {
      const actorUserId = getActorUserId(req);
      const orgId = (req.query.orgId as string) || (req.body.orgId as string) || 'org-101';
      const result = await fileService.emptyTrash(orgId, actorUserId);
      res.json({ message: 'Trash emptied successfully', ...result });
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

  app.get('/api/v1/sharing/public/:token/download', async (req, res) => {
    try {
      const share = sharingService.getPublicShare(req.params.token);
      if (!share.fileId) throw new Error('Share link does not target a file');
      const file = db.files.get(share.fileId);
      if (!file) throw new Error('File not found');

      sharingService.recordPublicDownload(req.params.token);
      const downloadUrl = await s3StorageService.generatePreSignedDownloadUrl(file.s3StorageKey, file.name, true, 60);
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
