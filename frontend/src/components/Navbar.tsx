import React, { useState, useEffect } from 'react';
import {
  Search,
  Bell,
  Building2,
  HardDrive,
  UserCheck,
  Shield,
  LogOut,
  User as UserIcon,
  HelpCircle,
  Settings,
  Grid,
  Trash2,
  Sparkles,
  Cloud,
} from 'lucide-react';
import { User, Organization, NotificationItem } from '../types/index.ts';
import { apiClient } from '../api/client.ts';

interface NavbarProps {
  users: User[];
  activeUser: User | null;
  onSignOut: () => void;
  onOpenAuthModal: () => void;
  orgs: Organization[];
  activeOrgId: string;
  onOrgChange: (orgId: string) => void;
  activeOrg?: Organization;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  users,
  activeUser,
  onSignOut,
  onOpenAuthModal,
  orgs,
  activeOrgId,
  onOrgChange,
  activeOrg,
  searchQuery,
  onSearchChange,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (activeUser) {
      fetchNotifications();
    }
  }, [activeUser?.id]);

  const fetchNotifications = async () => {
    try {
      const data = await apiClient.getNotifications();
      setNotifications(data);
    } catch (e) {
      console.error(e);
    }
  };

  const markRead = async (id: string) => {
    try {
      await apiClient.markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (e) {
      console.error(e);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const usedBytes = activeOrg?.storageUsedBytes || 0;
  const quotaBytes = activeOrg?.storageQuotaBytes || 10737418240;
  const usagePercentage = Math.min(100, parseFloat(((usedBytes / quotaBytes) * 100).toFixed(1)));

  const roleLabel = activeUser?.systemRole === 'ORGANIZATION_ADMIN'
    ? 'Org Admin'
    : activeUser?.systemRole === 'ADMIN'
    ? 'System Admin'
    : 'Member';

  const roleBadgeColor = activeUser?.systemRole === 'ORGANIZATION_ADMIN'
    ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
    : activeUser?.systemRole === 'ADMIN'
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : 'bg-blue-100 text-blue-700 border-blue-200';

  return (
    <header className="bg-white border-b border-gray-200 text-gray-800 sticky top-0 z-40 px-4 py-2.5 shadow-xs">
      <div className="max-w-[1700px] mx-auto flex items-center justify-between gap-4 md:gap-6">
        
        {/* Left: CloudStore Brand Logo & Title */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-blue-500/15 group-hover:scale-105 transition-transform">
              <Cloud className="w-5 h-5 text-white stroke-[2.2]" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xl text-gray-900 tracking-tight font-sans">CloudStore</span>
            </div>
          </div>
        </div>

        {/* Center: Search Bar */}
        <div className="flex-1 max-w-2xl hidden md:block">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-4 pointer-events-none" />
            <input
              type="text"
              placeholder="Search files, folders, tags..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-gray-100/80 focus:bg-white border border-transparent focus:border-blue-300 focus:ring-2 focus:ring-blue-100 rounded-xl pl-11 pr-10 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3.5 text-xs font-semibold text-gray-500 hover:text-gray-800 bg-gray-200 hover:bg-gray-300 rounded-full w-5 h-5 flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right Controls: Org, Storage, Notifications, Account Menu */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          
          {/* Organization Switcher */}
          <div className="hidden lg:flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-200/80 transition-colors">
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
            <select
              value={activeOrgId}
              onChange={(e) => onOrgChange(e.target.value)}
              className="bg-transparent text-gray-800 font-semibold text-xs focus:outline-none cursor-pointer pr-1"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id} className="bg-white text-gray-800">
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {/* Storage Quota Gauge */}
          <div className="hidden sm:flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5 text-xs text-gray-700">
            <HardDrive className="w-3.5 h-3.5 text-gray-500" />
            <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
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
            <span className="text-gray-700 font-semibold text-[11px]">
              {(usedBytes / (1024 * 1024)).toFixed(2)} MB
            </span>
          </div>

          {/* Activity Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors relative cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white font-bold text-[10px] rounded-full flex items-center justify-center ring-2 ring-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 z-50 text-xs">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
                  <span className="font-bold text-gray-900">Activity & Event Logs</span>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                    {unreadCount} unread
                  </span>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-gray-400 text-center py-4">No recent activity logs</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markRead(n.id)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                          n.read
                            ? 'bg-gray-50/50 border-gray-100 text-gray-500'
                            : 'bg-blue-50/50 border-blue-100 text-gray-800'
                        }`}
                      >
                        <div className="font-semibold text-gray-900 flex items-center justify-between">
                          <span>{n.title}</span>
                          {!n.read && <span className="w-2 h-2 bg-blue-600 rounded-full" />}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-gray-600">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Account / Sign In / Avatar Dropdown */}
          {activeUser ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer border border-transparent hover:border-gray-200"
              >
                <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-xs shadow-xs">
                  {activeUser.firstName[0]}
                </div>
                <div className="text-left hidden lg:block pr-1">
                  <span className="text-xs font-bold text-gray-800 block leading-tight">
                    {activeUser.firstName} {activeUser.lastName}
                  </span>
                  <span className="text-[10px] text-gray-500 font-medium block leading-none">
                    {roleLabel}
                  </span>
                </div>
              </button>

              {showUserMenu && (
                <div
                  className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 z-50 text-xs text-gray-800 space-y-3"
                  onMouseLeave={() => setShowUserMenu(false)}
                >
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 text-white font-bold rounded-full flex items-center justify-center text-sm shadow-xs">
                      {activeUser.firstName[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900 truncate">
                        {activeUser.firstName} {activeUser.lastName}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">{activeUser.email}</p>
                      <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${roleBadgeColor}`}>
                        {roleLabel}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenAuthModal();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-gray-700 hover:bg-gray-100 font-medium transition-colors text-left"
                    >
                      <UserIcon className="w-4 h-4 text-blue-600" />
                      <span>Switch Account</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onSignOut();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-600 hover:bg-red-50 font-medium transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4 text-red-500" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold text-xs shadow-sm hover:shadow transition-all cursor-pointer flex items-center gap-2"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}

        </div>
      </div>
    </header>
  );
};
