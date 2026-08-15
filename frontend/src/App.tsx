import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { FolderTree } from './components/FolderTree.tsx';
import { FileExplorer } from './components/FileExplorer.tsx';
import { ChunkedUploader } from './components/ChunkedUploader.tsx';
import { VersionHistoryModal } from './components/VersionHistoryModal.tsx';
import { SharingModal } from './components/SharingModal.tsx';
import { OrgManager } from './components/OrgManager.tsx';
import { AnalyticsDashboard } from './components/AnalyticsDashboard.tsx';
import { AuditLogViewer } from './components/AuditLogViewer.tsx';
import { AuthModal } from './components/AuthModal.tsx';

import { User, Organization, Folder, FileItem, NavigationTab } from './types/index.ts';
import { apiClient } from './api/client.ts';

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string>('org-101');

  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavigationTab>('drive');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFolderModal, setShowFolderModal] = useState<boolean>(false);

  // Modals
  const [versionModalFile, setVersionModalFile] = useState<FileItem | null>(null);
  const [sharingModalFile, setSharingModalFile] = useState<FileItem | null>(null);

  useEffect(() => {
    initApp();
  }, []);

  useEffect(() => {
    if (activeOrgId) {
      fetchOrgData();
    }
  }, [activeOrgId]);

  const initApp = async () => {
    try {
      const uList = await apiClient.getUsers();
      setUsers(uList);

      const savedUserId = localStorage.getItem('cloudstore_active_user_id');
      let currentU: User | null = null;

      if (savedUserId && uList.length > 0) {
        currentU = uList.find((u) => u.id === savedUserId) || null;
      }

      if (currentU) {
        setActiveUser(currentU);
        apiClient.setActiveUser(currentU.id);
      } else {
        setActiveUser(null);
        setShowAuthModal(true);
      }

      const oList = await apiClient.getOrgs();
      setOrgs(oList);
      if (oList.length > 0) {
        setActiveOrgId(oList[0].id);
      }
    } catch (err) {
      console.error('Failed initializing app state:', err);
      setShowAuthModal(true);
    }
  };

  const fetchOrgData = async () => {
    try {
      const [fldList, fileList, oList] = await Promise.all([
        apiClient.getFolders(activeOrgId),
        apiClient.searchFiles(activeOrgId, ''),
        apiClient.getOrgs(),
      ]);
      setFolders(fldList);
      setFiles(fileList);
      setOrgs(oList);
    } catch (err) {
      console.error('Failed fetching org items:', err);
    }
  };

  const handleSelectUser = async (user: User) => {
    setActiveUser(user);
    apiClient.setActiveUser(user.id);
    setShowAuthModal(false);

    // Refresh users & organizations for the newly signed in / registered user
    try {
      const [uList, oList] = await Promise.all([
        apiClient.getUsers(),
        apiClient.getOrgs(),
      ]);
      setUsers(uList);
      setOrgs(oList);
      if (oList.length > 0) {
        const userOrg = oList.find((o) => o.ownerId === user.id) || oList[0];
        setActiveOrgId(userOrg.id);
      }
    } catch (e) {
      console.error('Error loading data for user:', e);
    }
  };

  const handleSignOut = () => {
    setActiveUser(null);
    apiClient.setActiveUser('');
    setShowAuthModal(true);
  };

  const handleOrgChange = (oId: string) => {
    setActiveOrgId(oId);
    setActiveFolderId(null);
  };

  const handleCreateFolderClick = () => {
    setActiveTab('drive');
    setShowFolderModal(true);
  };

  const handleFileUploadClick = () => {
    setActiveTab('uploader');
  };

  const activeOrg = orgs.find((o) => o.id === activeOrgId);
  const isDriveView = ['drive', 'shared', 'recent', 'starred', 'trash', 'explorer'].includes(activeTab);

  return (
    <div className="h-screen bg-[#f8f9fa] text-gray-800 font-sans flex flex-col antialiased overflow-hidden">
      {/* Top Navbar */}
      <Navbar
        users={users}
        activeUser={activeUser}
        onSignOut={handleSignOut}
        onOpenAuthModal={() => setShowAuthModal(true)}
        orgs={orgs}
        activeOrgId={activeOrgId}
        onOrgChange={handleOrgChange}
        activeOrg={activeOrg}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="flex flex-1 w-full max-w-[1800px] mx-auto overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onNewFolderClick={handleCreateFolderClick}
          onUploadClick={handleFileUploadClick}
          activeOrg={activeOrg}
          activeUser={activeUser}
        />

        {/* Main Workspace Canvas */}
        <main className="flex-1 p-4 md:p-6 min-w-0 overflow-y-auto h-full">
          {isDriveView && (
            <div className="flex flex-col gap-6 w-full">
              {/* Directory Navigation Tree */}
              <div className="w-full">
                <FolderTree
                  folders={folders}
                  activeFolderId={activeFolderId}
                  onSelectFolder={setActiveFolderId}
                  activeOrgId={activeOrgId}
                  onFolderChange={fetchOrgData}
                  showCreateModal={showFolderModal}
                  onCloseCreateModal={() => setShowFolderModal(false)}
                />
              </div>

              {/* File Explorer */}
              <div className="w-full">
                <FileExplorer
                  files={files}
                  folders={folders}
                  activeOrgId={activeOrgId}
                  activeFolderId={activeFolderId}
                  onSelectFolder={setActiveFolderId}
                  onRefresh={fetchOrgData}
                  onOpenVersions={(file) => setVersionModalFile(file)}
                  onOpenSharing={(file) => setSharingModalFile(file)}
                  onNewFolderClick={() => setShowFolderModal(true)}
                  searchQuery={searchQuery}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />
              </div>
            </div>
          )}

          {activeTab === 'uploader' && (
            <div className="max-w-4xl mx-auto py-2">
              <ChunkedUploader
                activeOrgId={activeOrgId}
                activeFolderId={activeFolderId}
                onUploadSuccess={() => {
                  fetchOrgData();
                  setActiveTab('drive');
                }}
              />
            </div>
          )}

          {activeTab === 'orgs' && (
            <OrgManager
              activeOrgId={activeOrgId}
              orgs={orgs}
              onRefresh={fetchOrgData}
            />
          )}

          {activeTab === 'analytics' && <AnalyticsDashboard activeOrgId={activeOrgId} />}

          {activeTab === 'audit' && <AuditLogViewer />}
        </main>
      </div>

      {/* Auth & Role Persona Selector Modal */}
      <AuthModal
        users={users}
        orgs={orgs}
        onSelectUser={handleSelectUser}
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* File Version History Modal */}
      <VersionHistoryModal
        file={versionModalFile}
        onClose={() => setVersionModalFile(null)}
        onVersionRolledBack={fetchOrgData}
      />

      {/* File Access & Public Sharing Modal */}
      <SharingModal
        file={sharingModalFile}
        onClose={() => setSharingModalFile(null)}
      />
    </div>
  );
}
