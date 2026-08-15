import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  setLogLevel,
  doc,
  setDoc,
  getDocs,
  collection,
  deleteDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

import {
  User,
  Organization,
  OrganizationMember,
  Folder,
  FileItem,
  FileVersion,
  FilePermission,
  PublicShare,
  AuditLog,
  NotificationItem,
} from './types.js';

// Mute SDK-internal stream disconnect/reconnect trace messages
setLogLevel('error');

const firebaseApp = initializeApp(firebaseConfig);
export const firestoreDb = initializeFirestore(
  firebaseApp,
  {
    experimentalAutoDetectLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

// In-Memory Normalized PostgreSQL Tables backed by Firebase Firestore persistence
class DatabaseStore {
  public users: Map<string, User> = new Map();
  public organizations: Map<string, Organization> = new Map();
  public organizationMembers: OrganizationMember[] = [];
  public folders: Map<string, Folder> = new Map();
  public files: Map<string, FileItem> = new Map();
  public fileVersions: FileVersion[] = [];
  public filePermissions: FilePermission[] = [];
  public publicShares: Map<string, PublicShare> = new Map();
  public auditLogs: AuditLog[] = [];
  public notifications: NotificationItem[] = [];

  // Redis-like key-value cache
  public redisCache: Map<string, { value: any; expiresAt: number }> = new Map();
  // Rate limiting map
  public rateLimitTracker: Map<string, { count: number; windowStart: number }> = new Map();

  private initialized = false;

  constructor() {
    this.seedInitialData();
  }

  public async init() {
    if (this.initialized) return;
    try {
      await this.syncFromFirestore();
      this.initialized = true;
      console.log('DatabaseStore successfully initialized with Firestore persistent backend.');
    } catch (err) {
      console.error('Failed to sync from Firestore, falling back to local state:', err);
    }
  }

  private async syncFromFirestore() {
    try {
      // 1. Fetch Users
      const usersSnap = await getDocs(collection(firestoreDb, 'users'));
      if (!usersSnap.empty) {
        this.users.clear();
        usersSnap.forEach((d) => {
          const u = d.data() as User;
          this.users.set(u.id, u);
        });
      }

      // 2. Fetch Organizations
      const orgsSnap = await getDocs(collection(firestoreDb, 'organizations'));
      if (!orgsSnap.empty) {
        this.organizations.clear();
        orgsSnap.forEach((d) => {
          const o = d.data() as Organization;
          this.organizations.set(o.id, o);
        });
      }

      // 3. Fetch Folders
      const foldersSnap = await getDocs(collection(firestoreDb, 'folders'));
      if (!foldersSnap.empty) {
        this.folders.clear();
        foldersSnap.forEach((d) => {
          const f = d.data() as Folder;
          this.folders.set(f.id, f);
        });
      }

      // 4. Fetch Files
      const filesSnap = await getDocs(collection(firestoreDb, 'files'));
      if (!filesSnap.empty) {
        this.files.clear();
        filesSnap.forEach((d) => {
          const fl = d.data() as FileItem;
          this.files.set(fl.id, fl);
        });
      }

      // 5. Fetch File Versions
      const versionsSnap = await getDocs(collection(firestoreDb, 'fileVersions'));
      if (!versionsSnap.empty) {
        const vMap = new Map<string, FileVersion>();
        versionsSnap.forEach((d) => {
          const v = d.data() as FileVersion;
          vMap.set(v.id, v);
        });
        this.fileVersions = Array.from(vMap.values());
      }

      // 6. Fetch Audit Logs
      const auditSnap = await getDocs(collection(firestoreDb, 'auditLogs'));
      if (!auditSnap.empty) {
        this.auditLogs = [];
        auditSnap.forEach((d) => {
          this.auditLogs.push(d.data() as AuditLog);
        });
      }

      // 7. Fetch Notifications
      const notifSnap = await getDocs(collection(firestoreDb, 'notifications'));
      if (!notifSnap.empty) {
        this.notifications = [];
        notifSnap.forEach((d) => {
          this.notifications.push(d.data() as NotificationItem);
        });
      }

      // If Firestore was empty, seed initial data into Firestore
      if (usersSnap.empty && orgsSnap.empty && filesSnap.empty) {
        console.log('Firestore is empty. Seeding initial enterprise dataset into Firestore...');
        await this.seedToFirestore();
      }
    } catch (err) {
      console.error('Error in syncFromFirestore:', err);
    }
  }

  private async seedToFirestore() {
    try {
      for (const u of this.users.values()) {
        await setDoc(doc(firestoreDb, 'users', u.id), u);
      }
      for (const o of this.organizations.values()) {
        await setDoc(doc(firestoreDb, 'organizations', o.id), o);
      }
      for (const f of this.folders.values()) {
        await setDoc(doc(firestoreDb, 'folders', f.id), f);
      }
      for (const fl of this.files.values()) {
        await setDoc(doc(firestoreDb, 'files', fl.id), fl);
      }
      for (const v of this.fileVersions) {
        await setDoc(doc(firestoreDb, 'fileVersions', v.id), v);
      }
      for (const a of this.auditLogs) {
        await setDoc(doc(firestoreDb, 'auditLogs', a.id), a);
      }
      for (const n of this.notifications) {
        await setDoc(doc(firestoreDb, 'notifications', n.id), n);
      }
      console.log('Successfully seeded enterprise dataset to Firestore.');
    } catch (err) {
      console.error('Error seeding to Firestore:', err);
    }
  }

  public async saveUser(user: User) {
    this.users.set(user.id, user);
    try {
      await setDoc(doc(firestoreDb, 'users', user.id), user);
    } catch (err) {
      console.error('Error saving user to Firestore:', err);
    }
  }

  public async saveOrg(org: Organization) {
    this.organizations.set(org.id, org);
    try {
      await setDoc(doc(firestoreDb, 'organizations', org.id), org);
    } catch (err) {
      console.error('Error saving org to Firestore:', err);
    }
  }

  public async saveFolder(folder: Folder) {
    this.folders.set(folder.id, folder);
    try {
      await setDoc(doc(firestoreDb, 'folders', folder.id), folder);
    } catch (err) {
      console.error('Error saving folder to Firestore:', err);
    }
  }

  public async removeFolder(folderId: string) {
    this.folders.delete(folderId);
    try {
      await deleteDoc(doc(firestoreDb, 'folders', folderId));
    } catch (err) {
      console.error('Error removing folder from Firestore:', err);
    }
  }

  public async saveFile(file: FileItem) {
    this.files.set(file.id, file);
    try {
      await setDoc(doc(firestoreDb, 'files', file.id), file);
    } catch (err) {
      console.error('Error saving file to Firestore:', err);
    }
  }

  public async removeFile(fileId: string) {
    this.files.delete(fileId);
    try {
      await deleteDoc(doc(firestoreDb, 'files', fileId));
    } catch (err) {
      console.error('Error removing file from Firestore:', err);
    }
  }

  public async clearAllData() {
    try {
      for (const fileId of Array.from(this.files.keys())) {
        await deleteDoc(doc(firestoreDb, 'files', fileId)).catch(() => {});
      }
      this.files.clear();

      for (const folderId of Array.from(this.folders.keys())) {
        await deleteDoc(doc(firestoreDb, 'folders', folderId)).catch(() => {});
      }
      this.folders.clear();

      for (const ver of this.fileVersions) {
        await deleteDoc(doc(firestoreDb, 'fileVersions', ver.id)).catch(() => {});
      }
      this.fileVersions = [];

      for (const org of this.organizations.values()) {
        org.storageUsedBytes = 0;
        await setDoc(doc(firestoreDb, 'organizations', org.id), org).catch(() => {});
      }

      console.log('Successfully cleared all drive data.');
    } catch (err) {
      console.error('Error in clearAllData:', err);
    }
  }

  public async saveFileVersion(version: FileVersion) {
    const idx = this.fileVersions.findIndex((v) => v.id === version.id);
    if (idx >= 0) {
      this.fileVersions[idx] = version;
    } else {
      this.fileVersions.push(version);
    }
    try {
      await setDoc(doc(firestoreDb, 'fileVersions', version.id), version);
    } catch (err) {
      console.error('Error saving file version to Firestore:', err);
    }
  }

  public async saveAuditLog(log: AuditLog) {
    this.auditLogs.unshift(log);
    try {
      await setDoc(doc(firestoreDb, 'auditLogs', log.id), log);
    } catch (err) {
      console.error('Error saving audit log to Firestore:', err);
    }
  }

  public async saveNotification(notif: NotificationItem) {
    this.notifications.unshift(notif);
    try {
      await setDoc(doc(firestoreDb, 'notifications', notif.id), notif);
    } catch (err) {
      console.error('Error saving notification to Firestore:', err);
    }
  }

  public async savePublicShare(share: PublicShare) {
    const key = share.id || share.shareToken;
    this.publicShares.set(share.shareToken, share);
    try {
      await setDoc(doc(firestoreDb, 'publicShares', key), share);
    } catch (err) {
      console.error('Error saving public share to Firestore:', err);
    }
  }

  private seedInitialData() {
    // No mock seed users or organizations
  }
}

export const db = new DatabaseStore();
