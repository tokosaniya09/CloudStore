import React, { useState, useEffect } from 'react';
import { Building2, Users, HardDrive, UserPlus, CheckCircle2 } from 'lucide-react';
import { Organization, OrganizationMember } from '../types/index.ts';
import { apiClient } from '../api/client.ts';

interface OrgManagerProps {
  activeOrgId: string;
  orgs: Organization[];
  onRefresh: () => void;
}

export const OrgManager: React.FC<OrgManagerProps> = ({ activeOrgId, orgs, onRefresh }) => {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [newQuotaGb, setNewQuotaGb] = useState<number>(10);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeOrg = orgs.find((o) => o.id === activeOrgId);

  useEffect(() => {
    fetchMembers();
    if (activeOrg) {
      setNewQuotaGb(Math.round(activeOrg.storageQuotaBytes / (1024 * 1024 * 1024)));
    }
  }, [activeOrgId]);

  const fetchMembers = async () => {
    try {
      const data = await apiClient.getOrgMembers(activeOrgId);
      setMembers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    try {
      setStatusMessage(null);
      await apiClient.inviteOrgMember(activeOrgId, inviteEmail, inviteRole);
      setStatusMessage(`Invited ${inviteEmail} as ${inviteRole}. Notification sent!`);
      setInviteEmail('');
      fetchMembers();
    } catch (err: any) {
      alert(`Invite Error: ${err.message}`);
    }
  };

  const handleUpdateQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setStatusMessage(null);
      const bytes = newQuotaGb * 1024 * 1024 * 1024;
      await apiClient.updateOrgQuota(activeOrgId, bytes);
      setStatusMessage(`Updated organization storage quota to ${newQuotaGb} GB.`);
      onRefresh();
    } catch (err: any) {
      alert(`Quota Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 text-gray-800 font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            Organization & Storage Governance
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Manage enterprise membership, RBAC permissions, and team storage quotas for {activeOrg?.name}
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Quota Management Card */}
        <div className="p-6 bg-white border border-gray-200/80 rounded-3xl space-y-4 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <HardDrive className="w-5 h-5 text-blue-600" />
            <span>Storage Quota Configuration</span>
          </div>

          <div className="space-y-2 p-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-semibold">
            <div className="flex justify-between">
              <span className="text-gray-500">Current Usage:</span>
              <span className="text-gray-900">
                {((activeOrg?.storageUsedBytes || 0) / (1024 * 1024)).toFixed(1)} MB
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Assigned Quota:</span>
              <span className="text-gray-900">
                {((activeOrg?.storageQuotaBytes || 0) / (1024 * 1024 * 1024)).toFixed(0)} GB
              </span>
            </div>
          </div>

          <form onSubmit={handleUpdateQuota} className="space-y-3 pt-2">
            <label className="block text-xs font-bold text-gray-700">
              New Storage Capacity Limit (GB)
            </label>
            <div className="flex gap-3">
              <input
                type="number"
                min="1"
                max="10000"
                value={newQuotaGb}
                onChange={(e) => setNewQuotaGb(Number(e.target.value))}
                className="flex-1 bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:outline-none transition-all font-semibold"
              />
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-full shadow-xs transition-all cursor-pointer"
              >
                Save Quota
              </button>
            </div>
          </form>
        </div>

        {/* Invite Member Card */}
        <div className="p-6 bg-white border border-gray-200/80 rounded-3xl space-y-4 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <UserPlus className="w-5 h-5 text-blue-600" />
            <span>Invite Team Member</span>
          </div>

          <form onSubmit={handleInviteMember} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                User Email Address
              </label>
              <input
                type="email"
                required
                placeholder="colleague@organization.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:outline-none transition-all font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Organization Role
              </label>
              <select
                value={inviteRole}
                onChange={(e: any) => setInviteRole(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-gray-800 focus:outline-none transition-all font-medium cursor-pointer"
              >
                <option value="MEMBER">Standard Team Member</option>
                <option value="ADMIN">Organization Administrator</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-full shadow-xs transition-all cursor-pointer mt-2"
            >
              Send Invite
            </button>
          </form>
        </div>
      </div>

      {/* Organization Members Table */}
      <div className="p-6 bg-white border border-gray-200/80 rounded-3xl space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <span>Team Members ({members.length})</span>
          </h3>
        </div>

        <div className="overflow-x-auto border border-gray-200/80 rounded-2xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 font-bold text-[11px] uppercase tracking-wider bg-gray-50/60">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Joined At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-gray-800">{m.userId}</td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-bold text-[10px]">
                      {m.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-[11px]">
                    {new Date(m.joinedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
