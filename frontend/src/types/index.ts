export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  systemRole: 'USER' | 'ADMIN' | 'ORGANIZATION_ADMIN';
  isActive: boolean;
  createdAt: string;
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
  orgRole: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
  user?: User;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  organizationId: string;
  ownerId: string;
  materializedPath: string;
  isDeleted: boolean;
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

export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail?: string;
  action: string;
  resourceType: string;
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
  eventType: string;
  read: boolean;
  createdAt: string;
}

export interface PublicShare {
  id: string;
  shareToken: string;
  fileId: string | null;
  folderId: string | null;
  createdById: string;
  permissionLevel: string;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  createdAt: string;
}

export interface AnalyticsSummary {
  organization: Organization;
  totalFiles: number;
  totalFolders: number;
  totalStorageUsedBytes: number;
  totalStorageQuotaBytes: number;
  fileTypeDistribution: Record<string, number>;
  totalAuditEvents: number;
  activeUsersCount: number;
}

export type NavigationTab = 
  | 'drive' 
  | 'shared' 
  | 'recent' 
  | 'starred' 
  | 'trash' 
  | 'uploader' 
  | 'orgs' 
  | 'analytics' 
  | 'audit';
