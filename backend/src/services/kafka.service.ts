import { db } from '../db.js';
import { AuditLog, NotificationItem } from '../types.js';

export class KafkaService {
  private static instance: KafkaService;
  private listeners: Map<string, Array<(payload: any) => Promise<void>>> = new Map();

  private constructor() {
    this.registerDefaultConsumers();
  }

  public static getInstance(): KafkaService {
    if (!KafkaService.instance) {
      KafkaService.instance = new KafkaService();
    }
    return KafkaService.instance;
  }

  public subscribe(topic: string, handler: (payload: any) => Promise<void>) {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, []);
    }
    this.listeners.get(topic)!.push(handler);
  }

  public async publish(topic: string, eventKey: string, payload: any): Promise<void> {
    console.log(`[KAFKA EVENT PRODUCER] Topic: "${topic}" | Key: ${eventKey} | Event: ${payload.eventType}`);
    const handlers = this.listeners.get(topic) || [];
    for (const handler of handlers) {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`[KAFKA CONSUMER ERROR] Failed handling topic "${topic}":`, err);
      }
    }
  }

  private registerDefaultConsumers() {
    // Audit Service Consumer
    this.subscribe('file-events-topic', async (event: any) => {
      const actor = db.users.get(event.userId);
      const auditEntry: AuditLog = {
        id: 'aud-' + Math.random().toString(36).substring(2, 9),
        actorId: event.userId,
        actorEmail: actor ? actor.email : 'system@enterprise.org',
        action: event.eventType || 'FILE_EVENT',
        resourceType: 'FILE',
        resourceId: event.fileId,
        details: event.details || {},
        ipAddress: event.ipAddress || '127.0.0.1',
        createdAt: new Date().toISOString(),
      };
      db.auditLogs.unshift(auditEntry);
    });

    // Notification Service Consumer
    this.subscribe('file-events-topic', async (event: any) => {
      if (event.notifyUserIds && Array.isArray(event.notifyUserIds)) {
        for (const targetUserId of event.notifyUserIds) {
          const notif: NotificationItem = {
            id: 'notif-' + Math.random().toString(36).substring(2, 9),
            userId: targetUserId,
            title: event.title || 'Storage System Alert',
            message: event.message || 'An action occurred on a file.',
            eventType: event.eventType,
            read: false,
            createdAt: new Date().toISOString(),
          };
          db.notifications.unshift(notif);
        }
      }
    });

    // Organization & Auth Events Consumer
    this.subscribe('org-events-topic', async (event: any) => {
      const actor = db.users.get(event.userId);
      const auditEntry: AuditLog = {
        id: 'aud-' + Math.random().toString(36).substring(2, 9),
        actorId: event.userId,
        actorEmail: actor ? actor.email : 'system@enterprise.org',
        action: event.eventType,
        resourceType: 'ORG',
        resourceId: event.orgId,
        details: event.details || {},
        ipAddress: event.ipAddress || '127.0.0.1',
        createdAt: new Date().toISOString(),
      };
      db.auditLogs.unshift(auditEntry);
    });
  }
}

export const kafkaService = KafkaService.getInstance();
