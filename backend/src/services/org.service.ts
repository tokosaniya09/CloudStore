import { db } from '../db.js';
import { Organization, OrganizationMember, OrgRole } from '../types.js';
import { kafkaService } from './kafka.service.ts';

export class OrgService {
  public getOrganizationById(orgId: string): Organization | undefined {
    return db.organizations.get(orgId);
  }

  public getAllOrganizations(): Organization[] {
    return Array.from(db.organizations.values());
  }

  public getOrgMembers(orgId: string): Array<OrganizationMember & { user?: any }> {
    return db.organizationMembers
      .filter((m) => m.organizationId === orgId)
      .map((m) => ({
        ...m,
        user: db.users.get(m.userId),
      }));
  }

  public inviteMember(orgId: string, email: string, role: OrgRole, actorUserId: string): OrganizationMember {
    const org = db.organizations.get(orgId);
    if (!org) throw new Error('Organization not found');

    const user = Array.from(db.users.values()).find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      throw new Error(`User with email "${email}" not found in system`);
    }

    const existing = db.organizationMembers.find((m) => m.organizationId === orgId && m.userId === user.id);
    if (existing) {
      throw new Error(`User is already a member of this organization`);
    }

    const member: OrganizationMember = {
      organizationId: orgId,
      userId: user.id,
      orgRole: role,
      joinedAt: new Date().toISOString(),
    };

    db.organizationMembers.push(member);

    kafkaService.publish('org-events-topic', orgId, {
      eventType: 'UserInvited',
      orgId,
      userId: actorUserId,
      notifyUserIds: [user.id],
      title: 'Organization Invitation',
      message: `You were added to organization "${org.name}" as ${role}.`,
      details: { invitedUser: user.email, role },
    });

    return member;
  }

  public updateStorageQuota(orgId: string, newQuotaBytes: number, actorUserId: string): Organization {
    const org = db.organizations.get(orgId);
    if (!org) throw new Error('Organization not found');

    const oldQuota = org.storageQuotaBytes;
    org.storageQuotaBytes = newQuotaBytes;
    org.updatedAt = new Date().toISOString();
    db.saveOrg(org);

    kafkaService.publish('org-events-topic', orgId, {
      eventType: 'StorageQuotaUpdated',
      orgId,
      userId: actorUserId,
      details: { oldQuotaBytes: oldQuota, newQuotaBytes },
    });

    return org;
  }
}

export const orgService = new OrgService();
