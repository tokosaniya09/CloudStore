import { db } from '../db.js';
import { AuditLog } from '../types.js';

export class AuditService {
  public getAuditLogs(actorId?: string, action?: string, limit: number = 50): AuditLog[] {
    let logs = [...db.auditLogs];

    if (actorId) {
      logs = logs.filter((l) => l.actorId === actorId);
    }

    if (action) {
      logs = logs.filter((l) => l.action.toLowerCase() === action.toLowerCase());
    }

    return logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
  }

  public getNotificationsForUser(userId: string) {
    return db.notifications.filter((n) => n.userId === userId);
  }

  public markNotificationAsRead(notifId: string): void {
    const notif = db.notifications.find((n) => n.id === notifId);
    if (notif) notif.read = true;
  }
}

export const auditService = new AuditService();
