import { db } from '../db.js';
import { FilePermission, PublicShare, PermissionLevel, GranteeType } from '../types.js';
import { kafkaService } from './kafka.service.ts';

export class SharingService {
  /**
   * Grant direct permission to User or Organization
   */
  public grantPermission(
    fileId: string | null,
    folderId: string | null,
    granteeType: GranteeType,
    granteeId: string,
    permissionLevel: PermissionLevel,
    grantedById: string
  ): FilePermission {
    if (!fileId && !folderId) {
      throw new Error('Must specify either fileId or folderId for permission grant');
    }

    const permId = 'perm-' + Math.random().toString(36).substring(2, 9);
    const permission: FilePermission = {
      id: permId,
      fileId,
      folderId,
      granteeType,
      granteeId,
      permissionLevel,
      grantedById,
      createdAt: new Date().toISOString(),
    };

    db.filePermissions.push(permission);

    let resourceName = 'Resource';
    if (fileId) {
      const file = db.files.get(fileId);
      if (file) resourceName = file.name;
    } else if (folderId) {
      const folder = db.folders.get(folderId);
      if (folder) resourceName = folder.name;
    }

    kafkaService.publish('file-events-topic', fileId || folderId || 'perm', {
      eventType: 'FileShared',
      fileId: fileId || folderId,
      userId: grantedById,
      notifyUserIds: granteeType === 'USER' ? [granteeId] : [],
      title: 'Item Shared With You',
      message: `"${resourceName}" was shared with you (${permissionLevel} permission).`,
      details: { granteeType, granteeId, permissionLevel },
    });

    return permission;
  }

  /**
   * Create public shareable link with expiration & download cap
   */
  public createPublicShare(
    fileId: string | null,
    folderId: string | null,
    createdById: string,
    permissionLevel: PermissionLevel = 'VIEW',
    expiresInDays: number | null = 7,
    maxDownloads: number | null = 100
  ): PublicShare {
    const token = 'tok_' + Math.random().toString(36).substring(2, 12);
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null;

    const publicShare: PublicShare = {
      id: 'pub-' + Math.random().toString(36).substring(2, 9),
      shareToken: token,
      fileId,
      folderId,
      createdById,
      permissionLevel,
      passwordHash: null,
      expiresAt,
      maxDownloads,
      downloadCount: 0,
      createdAt: new Date().toISOString(),
    };

    db.publicShares.set(token, publicShare);

    kafkaService.publish('file-events-topic', fileId || folderId || token, {
      eventType: 'PublicShareCreated',
      fileId: fileId || folderId,
      userId: createdById,
      details: { token, expiresAt, maxDownloads },
    });

    return publicShare;
  }

  /**
   * Validate public share token & retrieve target resource
   */
  public getPublicShare(token: string): PublicShare {
    const share = db.publicShares.get(token);
    if (!share) {
      throw new Error('Public share link not found or expired');
    }

    if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
      throw new Error('Public share link has expired');
    }

    if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
      throw new Error('Maximum download limit reached for this share link');
    }

    return share;
  }

  public recordPublicDownload(token: string): void {
    const share = db.publicShares.get(token);
    if (share) {
      share.downloadCount += 1;
    }
  }

  public getPermissionsForResource(fileId?: string, folderId?: string): FilePermission[] {
    return db.filePermissions.filter((p) => (fileId && p.fileId === fileId) || (folderId && p.folderId === folderId));
  }
}

export const sharingService = new SharingService();
