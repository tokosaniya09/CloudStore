import { db } from '../db.js';
import { Folder } from '../types.js';
import { kafkaService } from './kafka.service.ts';

export class FolderService {
  /**
   * Create new folder with Materialized Path computation
   */
  public createFolder(name: string, parentId: string | null, orgId: string, ownerId: string): Folder {
    // Check name duplicate in same parent folder
    const existing = Array.from(db.folders.values()).find(
      (f) => f.organizationId === orgId && f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase() && !f.isDeleted
    );
    if (existing) {
      throw new Error(`A folder named "${name}" already exists in this directory.`);
    }

    let parentPath = '/';
    if (parentId) {
      const parent = db.folders.get(parentId);
      if (!parent || parent.organizationId !== orgId || parent.isDeleted) {
        throw new Error('Parent folder not found or deleted');
      }
      parentPath = parent.materializedPath;
    }

    const folderId = 'fld-' + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();
    const materializedPath = `${parentPath}${folderId}/`;

    const folder: Folder = {
      id: folderId,
      name,
      parentId,
      organizationId: orgId,
      ownerId,
      materializedPath,
      isDeleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    db.folders.set(folder.id, folder);
    db.saveFolder(folder);

    // Emit Kafka event
    kafkaService.publish('file-events-topic', folder.id, {
      eventType: 'FolderCreated',
      fileId: folder.id,
      userId: ownerId,
      details: { folderName: folder.name, path: folder.materializedPath, orgId },
    });

    return folder;
  }

  /**
   * Move a folder and all its subfolders/files using single atomic path replacement
   */
  public moveFolder(folderId: string, targetParentId: string | null, orgId: string, actorUserId: string): Folder {
    const folder = db.folders.get(folderId);
    if (!folder || folder.organizationId !== orgId || folder.isDeleted) {
      throw new Error('Source folder not found');
    }

    const oldPathPrefix = folder.materializedPath; // e.g. /fld-001/fld-002/

    let newParentPathPrefix = '/';
    if (targetParentId) {
      if (folderId === targetParentId) {
        throw new Error('Cannot move a folder into itself.');
      }
      const targetParent = db.folders.get(targetParentId);
      if (!targetParent || targetParent.organizationId !== orgId || targetParent.isDeleted) {
        throw new Error('Target parent folder not found');
      }

      // Cyclic validation: Target parent cannot be a descendant of source folder
      if (targetParent.materializedPath.startsWith(oldPathPrefix)) {
        throw new Error('Cannot move a folder into one of its own subfolders.');
      }

      newParentPathPrefix = targetParent.materializedPath;
    }

    // Duplicate check at destination
    const collision = Array.from(db.folders.values()).find(
      (f) => f.organizationId === orgId && f.parentId === targetParentId && f.name.toLowerCase() === folder.name.toLowerCase() && f.id !== folderId && !f.isDeleted
    );
    if (collision) {
      throw new Error(`A folder named "${folder.name}" already exists at the destination.`);
    }

    const newPathPrefix = `${newParentPathPrefix}${folder.id}/`;
    const now = new Date().toISOString();

    // 1. Update source folder
    folder.parentId = targetParentId;
    folder.materializedPath = newPathPrefix;
    folder.updatedAt = now;
    db.saveFolder(folder);

    // 2. Atomic SQL bulk path replacement simulation for all descendant subtrees
    let updatedDescendants = 0;
    for (const descendant of db.folders.values()) {
      if (descendant.id !== folderId && descendant.materializedPath.startsWith(oldPathPrefix) && descendant.organizationId === orgId && !descendant.isDeleted) {
        // Replace old prefix with new prefix
        descendant.materializedPath = descendant.materializedPath.replace(oldPathPrefix, newPathPrefix);
        descendant.updatedAt = now;
        db.saveFolder(descendant);
        updatedDescendants++;
      }
    }

    kafkaService.publish('file-events-topic', folder.id, {
      eventType: 'FolderMoved',
      fileId: folder.id,
      userId: actorUserId,
      details: { folderName: folder.name, oldPathPrefix, newPathPrefix, updatedDescendants },
    });

    return folder;
  }

  /**
   * Cascade soft-delete all folders and files in a subtree
   */
  public deleteFolderRecursive(folderId: string, orgId: string, actorUserId: string): { deletedFolders: number; deletedFiles: number } {
    const targetFolder = db.folders.get(folderId);
    if (!targetFolder || targetFolder.organizationId !== orgId || targetFolder.isDeleted) {
      throw new Error('Folder not found or already deleted');
    }

    const targetPrefix = targetFolder.materializedPath;
    const now = new Date().toISOString();

    let deletedFoldersCount = 0;
    let deletedFilesCount = 0;

    // 1. Soft-delete all subfolders matching path prefix
    for (const folder of db.folders.values()) {
      if (folder.materializedPath.startsWith(targetPrefix) && folder.organizationId === orgId && !folder.isDeleted) {
        folder.isDeleted = true;
        folder.deletedAt = now;
        folder.updatedAt = now;
        db.saveFolder(folder);
        deletedFoldersCount++;
      }
    }

    // 2. Soft-delete all files belonging to folders in this path prefix
    for (const file of db.files.values()) {
      if (file.organizationId === orgId && !file.isDeleted && file.folderId) {
        const fileFolder = db.folders.get(file.folderId);
        if (fileFolder && fileFolder.materializedPath.startsWith(targetPrefix)) {
          file.isDeleted = true;
          file.deletedAt = now;
          file.updatedAt = now;
          db.saveFile(file);
          deletedFilesCount++;
        }
      }
    }

    kafkaService.publish('file-events-topic', folderId, {
      eventType: 'FolderDeleted',
      fileId: folderId,
      userId: actorUserId,
      details: { folderName: targetFolder.name, deletedFoldersCount, deletedFilesCount },
    });

    return { deletedFolders: deletedFoldersCount, deletedFiles: deletedFilesCount };
  }

  public getFoldersInOrg(orgId: string): Folder[] {
    return Array.from(db.folders.values()).filter((f) => f.organizationId === orgId && !f.isDeleted);
  }
}

export const folderService = new FolderService();
