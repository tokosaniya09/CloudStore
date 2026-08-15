import React, { useState } from 'react';
import {
  HardDrive,
  Users,
  Clock,
  Star,
  Trash2,
  Building2,
  BarChart3,
  ShieldCheck,
  Upload,
  FolderPlus,
  Cloud,
  Plus,
} from 'lucide-react';
import { NavigationTab, Organization, User } from '../types/index.ts';

interface SidebarProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  onNewFolderClick: () => void;
  onUploadClick: () => void;
  activeOrg?: Organization;
  activeUser: User | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onNewFolderClick,
  onUploadClick,
  activeOrg,
  activeUser,
}) => {
  const [showNewMenu, setShowNewMenu] = useState(false);

  const mainDriveItems: { id: NavigationTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'drive', label: 'My Drive', icon: HardDrive },
    { id: 'shared', label: 'Shared with me', icon: Users },
    { id: 'recent', label: 'Recent', icon: Clock },
    { id: 'starred', label: 'Starred', icon: Star },
    { id: 'trash', label: 'Trash', icon: Trash2 },
  ];

  const adminItems: { id: NavigationTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'orgs', label: 'Organization & Quota', icon: Building2 },
    { id: 'analytics', label: 'Storage Analytics', icon: BarChart3 },
    { id: 'audit', label: 'Activity Logs', icon: ShieldCheck },
  ];

  const usedBytes = activeOrg?.storageUsedBytes || 0;
  const quotaBytes = activeOrg?.storageQuotaBytes || 10737418240;
  const usagePercentage = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));

  const isAdminOrOrgAdmin = activeUser?.systemRole === 'ADMIN' || activeUser?.systemRole === 'ORGANIZATION_ADMIN';

  return (
    <aside className="w-64 bg-[#f8f9fa] border-r border-gray-200/80 text-gray-700 p-4 flex flex-col justify-between shrink-0 min-h-[calc(100vh-57px)] font-sans">
      <div className="space-y-6">
        
        {/* Modern CloudStore "+ New" Button */}
        <div className="relative">
          <button
            onClick={() => setShowNewMenu(!showNewMenu)}
            className="flex items-center gap-2.5 px-5 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold text-sm shadow-md shadow-blue-500/15 hover:shadow-lg transition-all cursor-pointer group"
          >
            <div className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center">
              <Plus className="w-4 h-4 text-white stroke-[2.5] group-hover:scale-110 transition-transform" />
            </div>
            <span className="text-white font-medium text-sm">New</span>
          </button>

          {showNewMenu && (
            <div
              className="absolute left-0 mt-2 w-56 bg-white border border-gray-200 rounded-2xl shadow-xl p-2 z-50 text-xs space-y-1 animate-fadeIn"
              onMouseLeave={() => setShowNewMenu(false)}
            >
              <button
                onClick={() => {
                  setShowNewMenu(false);
                  onNewFolderClick();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-700 hover:bg-gray-100 font-medium transition-colors text-left cursor-pointer"
              >
                <FolderPlus className="w-4 h-4 text-blue-600" />
                <span>New folder</span>
              </button>
              <button
                onClick={() => {
                  setShowNewMenu(false);
                  onUploadClick();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-700 hover:bg-gray-100 font-medium transition-colors text-left cursor-pointer"
              >
                <Upload className="w-4 h-4 text-blue-600" />
                <span>File upload</span>
              </button>
            </div>
          )}
        </div>

        {/* Core Google Drive Menu List */}
        <div className="space-y-1">
          {mainDriveItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#c2e7ff] text-[#001d35] font-bold shadow-xs'
                    : 'text-gray-700 hover:bg-[#e9eef6]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#001d35]' : 'text-gray-600'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Admin Console & Analytics Section */}
        {isAdminOrOrgAdmin && (
          <div className="space-y-1 pt-3 border-t border-gray-200/80">
            <div className="px-4 py-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Admin & Governance
            </div>
            {adminItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center gap-3.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#c2e7ff] text-[#001d35] font-bold shadow-xs'
                      : 'text-gray-700 hover:bg-[#e9eef6]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#001d35]' : 'text-gray-600'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Storage Gauge Anchored at Bottom */}
      <div className="pt-4 border-t border-gray-200 space-y-2">
        <div className="flex items-center justify-between text-xs text-gray-700 font-semibold">
          <span className="flex items-center gap-1.5">
            <Cloud className="w-4 h-4 text-blue-600" />
            Storage
          </span>
          <span className="text-[11px] text-gray-500 font-medium">{usagePercentage}% full</span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              usagePercentage > 90
                ? 'bg-red-500'
                : usagePercentage > 75
                ? 'bg-amber-500'
                : 'bg-blue-600'
            }`}
            style={{ width: `${usagePercentage}%` }}
          />
        </div>

        <p className="text-[11px] text-gray-500 font-medium">
          {(usedBytes / (1024 * 1024)).toFixed(0)} MB of {(quotaBytes / (1024 * 1024 * 1024)).toFixed(0)} GB used
        </p>

        <button
          onClick={() => onTabChange('orgs')}
          className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors block cursor-pointer"
        >
          Manage enterprise storage
        </button>
      </div>
    </aside>
  );
};
