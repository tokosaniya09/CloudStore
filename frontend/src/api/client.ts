import {
  User,
  Organization,
  OrganizationMember,
  Folder,
  FileItem,
  FileVersion,
  AuditLog,
  NotificationItem,
  PublicShare,
  AnalyticsSummary,
} from '../types/index.ts';

const BASE_URL = '/api/v1';

export class ApiClient {
  private activeUserId: string = localStorage.getItem('cloudstore_active_user_id') || '';

  public setActiveUser(userId: string) {
    this.activeUserId = userId;
    if (userId) {
      localStorage.setItem('cloudstore_active_user_id', userId);
    } else {
      localStorage.removeItem('cloudstore_active_user_id');
    }
  }

  public getActiveUser(): string {
    return this.activeUserId;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer jwt_access_${this.activeUserId}_${Date.now()}`,
      ...(options.headers || {}),
    };

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'HTTP Request Failed' }));
      throw new Error(errorData.error || `Request failed with status ${res.status}`);
    }

    return res.json();
  }

  // Users & Auth
  public getUsers(): Promise<User[]> {
    return this.request<User[]>('/auth/users');
  }

  public getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  public async login(email: string, password?: string): Promise<{ user: User; token: string }> {
    const data = await this.request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: password || 'hashed_pass' }),
    });
    this.setActiveUser(data.user.id);
    return data;
  }

  public async register(email: string, firstName: string, lastName: string, systemRole: string = 'USER'): Promise<User> {
    const user = await this.request<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, firstName, lastName, systemRole }),
    });
    this.setActiveUser(user.id);
    return user;
  }

  // Organizations
  public getOrgs(): Promise<Organization[]> {
    return this.request<Organization[]>('/orgs');
  }

  public getOrgMembers(orgId: string): Promise<OrganizationMember[]> {
    return this.request<OrganizationMember[]>(`/orgs/${orgId}/members`);
  }

  public inviteOrgMember(orgId: string, email: string, role: string): Promise<OrganizationMember> {
    return this.request<OrganizationMember>(`/orgs/${orgId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  public updateOrgQuota(orgId: string, storageQuotaBytes: number): Promise<Organization> {
    return this.request<Organization>(`/orgs/${orgId}/quota`, {
      method: 'PATCH',
      body: JSON.stringify({ storageQuotaBytes }),
    });
  }

  // Folders
  public getFolders(orgId: string): Promise<Folder[]> {
    return this.request<Folder[]>(`/folders?orgId=${orgId}`);
  }

  public createFolder(name: string, parentId: string | null, orgId: string): Promise<Folder> {
    return this.request<Folder>('/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parentId, orgId }),
    });
  }

  public moveFolder(folderId: string, targetParentId: string | null, orgId: string): Promise<Folder> {
    return this.request<Folder>(`/folders/${folderId}/move`, {
      method: 'POST',
      body: JSON.stringify({ targetParentId, orgId }),
    });
  }

  public deleteFolder(folderId: string, orgId: string): Promise<{ message: string; deletedFolders: number; deletedFiles: number }> {
    return this.request<{ message: string; deletedFolders: number; deletedFiles: number }>(`/folders/${folderId}?orgId=${orgId}`, {
      method: 'DELETE',
    });
  }

  public restoreFolder(folderId: string, orgId: string): Promise<{ message: string; restoredFolders: number; restoredFiles: number }> {
    return this.request<{ message: string; restoredFolders: number; restoredFiles: number }>(`/folders/${folderId}/restore`, {
      method: 'POST',
      body: JSON.stringify({ orgId }),
    });
  }

  public permanentDeleteFolder(folderId: string, orgId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/folders/${folderId}/permanent?orgId=${orgId}`, {
      method: 'DELETE',
    });
  }

  // Files
  public searchFiles(orgId: string, query: string): Promise<FileItem[]> {
    return this.request<FileItem[]>(`/files/search?orgId=${orgId}&query=${encodeURIComponent(query)}`);
  }

  public getFileVersions(fileId: string): Promise<FileVersion[]> {
    return this.request<FileVersion[]>(`/files/${fileId}/versions`);
  }

  public rollbackFileVersion(fileId: string, versionNumber: number): Promise<{ file: FileItem; newVersion: FileVersion }> {
    return this.request<{ file: FileItem; newVersion: FileVersion }>(`/files/${fileId}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ versionNumber }),
    });
  }

  public getDownloadUrl(fileId: string): Promise<{ downloadUrl: string }> {
    return this.request<{ downloadUrl: string }>(`/files/${fileId}/download`);
  }

  public deleteFile(fileId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/files/${fileId}`, {
      method: 'DELETE',
    });
  }

  public restoreFile(fileId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/files/${fileId}/restore`, {
      method: 'POST',
    });
  }

  public permanentDeleteFile(fileId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/files/${fileId}/permanent`, {
      method: 'DELETE',
    });
  }

  // Trash & Retention
  public getTrash(orgId: string): Promise<{ files: FileItem[]; folders: Folder[] }> {
    return this.request<{ files: FileItem[]; folders: Folder[] }>(`/trash?orgId=${orgId}`);
  }

  public emptyTrash(orgId: string): Promise<{ message: string; deletedFiles: number; deletedFolders: number }> {
    return this.request<{ message: string; deletedFiles: number; deletedFolders: number }>('/trash/empty', {
      method: 'POST',
      body: JSON.stringify({ orgId }),
    });
  }

  // Sharing
  public grantPermission(fileId: string | null, folderId: string | null, granteeType: string, granteeId: string, permissionLevel: string) {
    return this.request('/sharing/grant', {
      method: 'POST',
      body: JSON.stringify({ fileId, folderId, granteeType, granteeId, permissionLevel }),
    });
  }

  public createPublicShare(fileId: string | null, folderId: string | null, permissionLevel: string = 'VIEW', expiresInDays: number = 7, maxDownloads: number = 100): Promise<PublicShare> {
    return this.request<PublicShare>('/sharing/public', {
      method: 'POST',
      body: JSON.stringify({ fileId, folderId, permissionLevel, expiresInDays, maxDownloads }),
    });
  }

  public getPublicShare(token: string): Promise<{ share: PublicShare; file?: FileItem; folder?: Folder }> {
    return this.request<{ share: PublicShare; file?: FileItem; folder?: Folder }>(`/sharing/public/${token}`);
  }

  // Audit & Notifications
  public getAuditLogs(limit: number = 50): Promise<AuditLog[]> {
    return this.request<AuditLog[]>(`/audit/logs?limit=${limit}`);
  }

  public getNotifications(): Promise<NotificationItem[]> {
    return this.request<NotificationItem[]>(`/notifications?userId=${this.activeUserId}`);
  }

  public markNotificationAsRead(id: string): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/notifications/${id}/read`, {
      method: 'PATCH',
    });
  }

  // Analytics
  public getAnalyticsSummary(orgId: string): Promise<AnalyticsSummary> {
    return this.request<AnalyticsSummary>(`/analytics/summary?orgId=${orgId}`);
  }

  // Clear Data
  public clearAllData(): Promise<{ status: string; message: string }> {
    return this.request<{ status: string; message: string }>('/data/clear', {
      method: 'POST',
    });
  }
}

export const apiClient = new ApiClient();
