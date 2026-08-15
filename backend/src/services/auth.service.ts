import { db } from '../db.js';
import { User, SystemRole } from '../types.js';
import { kafkaService } from './kafka.service.ts';

export class AuthService {
  public login(email: string, passwordHash: string): { user: User; token: string; refreshToken: string } {
    const user = Array.from(db.users.values()).find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !user.isActive) {
      throw new Error('Invalid credentials or inactive account');
    }

    const token = `jwt_access_${user.id}_${Date.now()}`;
    const refreshToken = `jwt_refresh_${user.id}_${Date.now()}`;

    // Log auth event
    kafkaService.publish('org-events-topic', user.id, {
      eventType: 'UserLoggedIn',
      orgId: 'auth',
      userId: user.id,
      details: { email: user.email, systemRole: user.systemRole },
    });

    return { user, token, refreshToken };
  }

  public register(email: string, firstName: string, lastName: string, systemRole: SystemRole = 'USER'): User {
    const existing = Array.from(db.users.values()).find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      throw new Error('User with this email already exists');
    }

    const userId = 'usr-' + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();
    const user: User = {
      id: userId,
      email,
      passwordHash: 'hashed_password_' + userId,
      firstName,
      lastName,
      systemRole,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    db.users.set(user.id, user);
    db.saveUser(user);

    // Auto-create personal enterprise workspace for new user
    const orgId = 'org-' + Math.random().toString(36).substring(2, 9);
    const org = {
      id: orgId,
      name: `${firstName}'s Drive Workspace`,
      ownerId: user.id,
      storageQuotaBytes: 10 * 1024 * 1024 * 1024, // 10 GB
      storageUsedBytes: 0,
      createdAt: now,
      updatedAt: now,
    };
    db.organizations.set(org.id, org);
    db.organizationMembers.push({
      organizationId: org.id,
      userId: user.id,
      orgRole: 'OWNER',
      joinedAt: now,
    });

    kafkaService.publish('org-events-topic', user.id, {
      eventType: 'UserRegistered',
      orgId: org.id,
      userId: user.id,
      details: { email: user.email, role: systemRole },
    });

    return user;
  }

  public getUserById(userId: string): User | undefined {
    return db.users.get(userId);
  }

  public getAllUsers(): User[] {
    return Array.from(db.users.values());
  }
}

export const authService = new AuthService();
