export type SystemRole = 'USER' | 'ADMIN' | 'ORGANIZATION_ADMIN';
export type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type PermissionLevel = 'VIEW' | 'EDIT' | 'OWNER';
export type GranteeType = 'USER' | 'ORGANIZATION';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  systemRole: SystemRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  organizationId: string;
  userId: string;
  orgRole: OrgRole;
  joinedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  organizationId: string;
  ownerId: string;
  materializedPath: string; // e.g. "/root_id/parent_id/self_id/"
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileItem {
  id: string;
  name: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
  organizationId: string;
  ownerId: string;
  currentVersionNumber: number;
  s3StorageKey: string;
  tags: string[];
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FileVersion {
  id: string;
  fileId: string;
  versionNumber: number;
  s3StorageKey: string;
  sizeBytes: number;
  uploadedById: string;
  createdAt: string;
}

export interface FilePermission {
  id: string;
  fileId: string | null;
  folderId: string | null;
  granteeType: GranteeType;
  granteeId: string;
  permissionLevel: PermissionLevel;
  grantedById: string;
  createdAt: string;
}

export interface PublicShare {
  id: string;
  shareToken: string;
  fileId: string | null;
  folderId: string | null;
  createdById: string;
  permissionLevel: PermissionLevel;
  passwordHash: string | null;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail?: string;
  action: string;
  resourceType: 'FILE' | 'FOLDER' | 'ORG' | 'AUTH' | 'PERMISSION';
  resourceId: string;
  details: Record<string, any>;
  ipAddress: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  eventType: 'FileUploaded' | 'FileDeleted' | 'FileShared' | 'FolderCreated' | 'UserInvited';
  read: boolean;
  createdAt: string;
}

export interface FileUploadInitRequest {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  folderId: string | null;
  orgId: string;
}

export interface FileUploadCompleteRequest {
  uploadId: string;
  s3Key: string;
  fileName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
  orgId: string;
}

export interface ChunkPresignRequest {
  uploadId: string;
  s3Key: string;
  partNumber: number;
}
