import React, { useState, useEffect } from 'react';
import {
  Folder as FolderIcon,
  FolderPlus,
  FolderInput,
  Trash2,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Move,
  Check,
  ChevronsUpDown,
  FolderOpen,
} from 'lucide-react';
import { Folder } from '../types/index.ts';
import { apiClient } from '../api/client.ts';

interface FolderTreeProps {
  folders: Folder[];
  activeFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  activeOrgId: string;
  onFolderChange: () => void;
  showCreateModal?: boolean;
  onCloseCreateModal?: () => void;
  onOpenCreateModal?: () => void;
}

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  activeFolderId,
  onSelectFolder,
  activeOrgId,
  onFolderChange,
  showCreateModal: externalShowCreateModal,
  onCloseCreateModal,
  onOpenCreateModal,
}) => {
  const [isTreeCollapsed, setIsTreeCollapsed] = useState<boolean>(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [internalShowCreateModal, setInternalShowCreateModal] = useState<boolean>(false);
  const [createParentId, setCreateParentId] = useState<string | null>(activeFolderId);
  const [showMoveModal, setShowMoveModal] = useState<Folder | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [targetParentId, setTargetParentId] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Drag and drop state
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null | 'ROOT'>(null);

  const isCreateModalOpen = externalShowCreateModal || internalShowCreateModal;

  // Auto-expand ancestors when an active folder is selected so it is always visible
  useEffect(() => {
    if (!activeFolderId) return;
    const parentIdsToExpand: string[] = [];
    let current = folders.find((f) => f.id === activeFolderId);
    while (current && current.parentId) {
      parentIdsToExpand.push(current.parentId);
      current = folders.find((f) => f.id === current?.parentId);
    }
    if (parentIdsToExpand.length > 0) {
      setCollapsedFolders((prev) => {
        const next = { ...prev };
        let changed = false;
        parentIdsToExpand.forEach((id) => {
          if (next[id]) {
            delete next[id];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [activeFolderId, folders]);

  const toggleFolderCollapse = (folderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const handleExpandAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedFolders({});
  };

  const handleCollapseAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    const allParentFolders = folders.filter((f) =>
      folders.some((child) => child.parentId === f.id)
    );
    const newCollapsed: Record<string, boolean> = {};
    allParentFolders.forEach((f) => {
      newCollapsed[f.id] = true;
    });
    setCollapsedFolders(newCollapsed);
  };

  const handleOpenCreate = (parentId: string | null = activeFolderId) => {
    setCreateParentId(parentId);
    setNewFolderName('');
    setErrorMessage(null);
    setInternalShowCreateModal(true);
    if (onOpenCreateModal) onOpenCreateModal();
  };

  const handleCloseCreate = () => {
    setInternalShowCreateModal(false);
    setNewFolderName('');
    setErrorMessage(null);
    if (onCloseCreateModal) onCloseCreateModal();
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await apiClient.createFolder(newFolderName.trim(), createParentId, activeOrgId);
      // Auto expand parent if created inside a folder
      if (createParentId) {
        setCollapsedFolders((prev) => {
          const next = { ...prev };
          delete next[createParentId];
          return next;
        });
      }
      setNewFolderName('');
      handleCloseCreate();
      onFolderChange();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create folder');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenMove = (folder: Folder) => {
    setShowMoveModal(folder);
    setTargetParentId(folder.parentId);
    setErrorMessage(null);
  };

  const handleMoveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showMoveModal) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await apiClient.moveFolder(showMoveModal.id, targetParentId, activeOrgId);
      setShowMoveModal(null);
      onFolderChange();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to move folder');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirectMove = async (folderId: string, destinationParentId: string | null) => {
    if (folderId === destinationParentId) return;
    try {
      setErrorMessage(null);
      await apiClient.moveFolder(folderId, destinationParentId, activeOrgId);
      if (destinationParentId) {
        setCollapsedFolders((prev) => {
          const next = { ...prev };
          delete next[destinationParentId];
          return next;
        });
      }
      onFolderChange();
    } catch (err: any) {
      alert(err.message || 'Failed to move folder');
    }
  };

  const handleDeleteFolder = (folder: Folder) => {
    setFolderToDelete(folder);
  };

  const handleConfirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    try {
      setIsSubmitting(true);
      await apiClient.deleteFolder(folderToDelete.id, activeOrgId);
      if (activeFolderId === folderToDelete.id) onSelectFolder(null);
      setFolderToDelete(null);
      onFolderChange();
    } catch (err: any) {
      alert(err.message || 'Failed to delete folder');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to compute clean, human-readable directory paths without technical IDs
  const getFolderDisplayPath = (folderId: string | null): string => {
    if (!folderId) return 'My Drive (Root)';
    const pathParts: string[] = [];
    let current: Folder | undefined = folders.find((f) => f.id === folderId);
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      pathParts.unshift(current.name);
      current = current.parentId ? folders.find((f) => f.id === current!.parentId) : undefined;
    }

    return pathParts.length > 0 ? '/' + pathParts.join('/') : 'My Drive (Root)';
  };

  const activeFolderObj = folders.find((f) => f.id === activeFolderId);
  const rootFolders = folders.filter((f) => f.parentId === null);
  const hasSubfoldersExist = folders.some((f) => folders.some((child) => child.parentId === f.id));

  // Drag & drop handlers
  const onDragStart = (e: React.DragEvent, folder: Folder) => {
    e.dataTransfer.setData('text/plain', folder.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedFolderId(folder.id);
  };

  const onDragOver = (e: React.DragEvent, targetId: string | null | 'ROOT') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedFolderId && draggedFolderId !== targetId) {
      setDragOverFolderId(targetId);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFolderId(null);
  };

  const onDrop = async (e: React.DragEvent, targetParentId: string | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const sourceFolderId = e.dataTransfer.getData('text/plain') || draggedFolderId;
    setDraggedFolderId(null);

    if (!sourceFolderId || sourceFolderId === targetParentId) return;
    await handleDirectMove(sourceFolderId, targetParentId);
  };

  const renderFolderNode = (folder: Folder, depth: number = 0) => {
    const children = folders.filter((f) => f.parentId === folder.id);
    const hasChildren = children.length > 0;
    const isFolderCollapsed = !!collapsedFolders[folder.id];
    const isSelected = activeFolderId === folder.id;
    const isDropTarget = dragOverFolderId === folder.id;
    const isBeingDragged = draggedFolderId === folder.id;

    return (
      <div key={folder.id} className="space-y-0.5">
        <div
          draggable
          onDragStart={(e) => onDragStart(e, folder)}
          onDragOver={(e) => onDragOver(e, folder.id)}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(e, folder.id)}
          onDoubleClick={() => {
            if (hasChildren) toggleFolderCollapse(folder.id);
          }}
          className={`group flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none ${
            isBeingDragged ? 'opacity-40 border-2 border-dashed border-gray-300' : ''
          } ${
            isDropTarget
              ? 'bg-blue-100 border-2 border-blue-500 text-blue-900 shadow-sm scale-[1.01]'
              : isSelected
              ? 'bg-[#c2e7ff] text-[#001d35] font-bold shadow-2xs'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {/* Expand / Collapse Chevron Button */}
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleFolderCollapse(folder.id, e)}
                title={isFolderCollapsed ? 'Expand subfolders' : 'Collapse subfolders'}
                className="p-0.5 hover:bg-gray-200/80 rounded text-gray-500 hover:text-gray-900 transition-colors shrink-0 cursor-pointer"
              >
                {isFolderCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-600" />
                )}
              </button>
            ) : (
              <span className="w-4 h-4 shrink-0" />
            )}

            {/* Drag Handle */}
            <GripVertical className="w-3 h-3 text-gray-300 group-hover:text-gray-500 cursor-grab shrink-0" />

            {/* Folder Icon & Name */}
            <div
              onClick={() => onSelectFolder(folder.id)}
              className="flex items-center gap-2 flex-1 min-w-0 truncate"
            >
              {hasChildren && !isFolderCollapsed ? (
                <FolderOpen
                  className={`w-4 h-4 shrink-0 ${
                    isSelected ? 'text-[#001d35]' : 'text-amber-500'
                  }`}
                />
              ) : (
                <FolderIcon
                  className={`w-4 h-4 shrink-0 ${
                    isSelected ? 'text-[#001d35]' : 'text-amber-500'
                  }`}
                />
              )}
              <span className="truncate">{folder.name}</span>
              {hasChildren && (
                <span className="text-[10px] text-gray-400 font-normal shrink-0">
                  ({children.length})
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0 ml-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenCreate(folder.id);
              }}
              title="Add subfolder inside this folder"
              className="p-1 hover:bg-gray-200 rounded-md text-gray-500 hover:text-blue-600 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleOpenMove(folder);
              }}
              title="Move folder (Select new parent)"
              className="p-1 hover:bg-gray-200 rounded-md text-gray-500 hover:text-blue-600 cursor-pointer"
            >
              <FolderInput className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder);
              }}
              title="Delete folder"
              className="p-1 hover:bg-red-100 rounded-md text-gray-400 hover:text-red-600 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Nested Children (Collapsible) */}
        {hasChildren && !isFolderCollapsed && (
          <div className="space-y-0.5 animate-fadeIn">
            {children.map((child) => renderFolderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-200/80 rounded-3xl p-4 space-y-3 text-gray-800 shadow-xs font-sans transition-all">
      {/* Header with Collapsible Toggle */}
      <div className="flex items-center justify-between pb-2.5 border-b border-gray-100 px-1">
        <button
          onClick={() => setIsTreeCollapsed(!isTreeCollapsed)}
          className="flex items-center gap-2 group cursor-pointer text-left focus:outline-none"
          title={isTreeCollapsed ? 'Expand Folders Directory' : 'Collapse Folders Directory'}
        >
          {isTreeCollapsed ? (
            <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-900 transition-transform" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500 group-hover:text-gray-900 transition-transform" />
          )}
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider group-hover:text-blue-600 transition-colors">
            Folders Directory
          </span>
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-full">
            {folders.length}
          </span>
        </button>

        <div className="flex items-center gap-1">
          {/* Quick Expand All / Collapse All when subfolders exist */}
          {!isTreeCollapsed && hasSubfoldersExist && (
            <div className="flex items-center text-[10px] text-gray-400 mr-1">
              <button
                onClick={handleExpandAll}
                className="hover:text-blue-600 px-1 py-0.5 rounded transition-colors cursor-pointer font-semibold"
                title="Expand all nested folders"
              >
                Expand all
              </button>
              <span>•</span>
              <button
                onClick={handleCollapseAll}
                className="hover:text-blue-600 px-1 py-0.5 rounded transition-colors cursor-pointer font-semibold"
                title="Collapse all nested folders"
              >
                Collapse all
              </button>
            </div>
          )}

          {/* Move Selected Folder Button if an active folder is selected */}
          {activeFolderObj && (
            <button
              onClick={() => handleOpenMove(activeFolderObj)}
              title={`Move selected folder "${activeFolderObj.name}"`}
              className="px-2 py-1 text-[11px] font-bold text-gray-600 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
            >
              <Move className="w-3 h-3 text-blue-600" />
              <span className="hidden sm:inline">Move</span>
            </button>
          )}

          <button
            onClick={() => handleOpenCreate(activeFolderId)}
            className="text-xs text-blue-600 hover:text-blue-800 font-bold transition-colors cursor-pointer flex items-center gap-1 hover:underline px-1 py-0.5"
            title="Create a new subfolder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>+ Subfolder</span>
          </button>
        </div>
      </div>

      {/* Collapsed State Summary */}
      {isTreeCollapsed ? (
        <div className="flex items-center justify-between p-2.5 bg-gray-50/80 rounded-2xl border border-gray-100 text-xs">
          <div className="flex items-center gap-2 truncate text-gray-600">
            <FolderIcon className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="truncate font-semibold">
              {activeFolderObj ? activeFolderObj.name : 'My Drive (Root)'}
            </span>
          </div>
          <button
            onClick={() => setIsTreeCollapsed(false)}
            className="text-xs font-bold text-blue-600 hover:underline shrink-0 ml-2 cursor-pointer"
          >
            Expand
          </button>
        </div>
      ) : (
        /* Expanded Tree View */
        <div className="space-y-0.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
          <div
            onDragOver={(e) => onDragOver(e, 'ROOT')}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, null)}
            onClick={() => onSelectFolder(null)}
            className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              dragOverFolderId === 'ROOT'
                ? 'bg-blue-100 border-2 border-blue-500 text-blue-900 shadow-sm'
                : activeFolderId === null
                ? 'bg-[#c2e7ff] text-[#001d35] shadow-2xs'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <FolderIcon className="w-4 h-4 text-amber-500 shrink-0" />
              <span>My Drive (Root)</span>
            </div>
            {dragOverFolderId === 'ROOT' && (
              <span className="text-[10px] text-blue-700 font-bold">Drop here</span>
            )}
          </div>

          {rootFolders.map((f) => renderFolderNode(f, 0))}

          {folders.length === 0 && (
            <p className="text-center py-4 text-xs text-gray-400">
              No folders yet. Click + Subfolder to organize files.
            </p>
          )}

          <div className="pt-2 px-1 text-[11px] text-gray-400 flex items-center justify-between border-t border-gray-100 mt-2">
            <span>Tip: Drag folders to move them • Click chevron to collapse</span>
          </div>
        </div>
      )}

      {/* Modal: Create Folder */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-200 p-6 max-w-sm w-full space-y-4 shadow-2xl text-gray-800 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-blue-600" />
                <span>New Folder</span>
              </h3>
              <button
                onClick={handleCloseCreate}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleCreateFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. Marketing Assets"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Location (Parent Folder)
                </label>
                <select
                  value={createParentId || ''}
                  onChange={(e) => setCreateParentId(e.target.value || null)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-gray-800 focus:outline-none transition-all cursor-pointer font-medium"
                >
                  <option value="">My Drive (Root)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {getFolderDisplayPath(f.id)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseCreate}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newFolderName.trim()}
                  className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Move Subtree / Select Destination */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-200 p-6 max-w-sm w-full space-y-4 shadow-2xl text-gray-800 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <FolderInput className="w-4 h-4 text-blue-600" />
                <span>Move Folder: "{showMoveModal.name}"</span>
              </h3>
              <button
                onClick={() => setShowMoveModal(null)}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleMoveFolder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Select Destination (New Parent)
                </label>
                <select
                  value={targetParentId || ''}
                  onChange={(e) => setTargetParentId(e.target.value || null)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-gray-800 focus:outline-none transition-all cursor-pointer font-medium"
                >
                  <option value="">My Drive (Root)</option>
                  {folders
                    .filter((f) => f.id !== showMoveModal.id)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {getFolderDisplayPath(f.id)}
                      </option>
                    ))}
                </select>
              </div>

              <div className="p-3 bg-blue-50/60 rounded-2xl text-[11px] text-blue-800 space-y-1 border border-blue-100">
                <p className="font-bold flex items-center gap-1">
                  <Move className="w-3 h-3 text-blue-600" />
                  Moving: {showMoveModal.name}
                </p>
                <p className="text-gray-600">
                  Target location: <span className="font-bold">{getFolderDisplayPath(targetParentId)}</span>
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMoveModal(null)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? 'Moving...' : 'Confirm Move'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Folder */}
      {folderToDelete && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-200 p-6 max-w-sm w-full space-y-4 shadow-2xl text-gray-800 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Delete Folder</span>
              </h3>
              <button
                onClick={() => setFolderToDelete(null)}
                disabled={isSubmitting}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-gray-600">
              <p>Are you sure you want to delete this folder?</p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
                <FolderIcon className="w-5 h-5 text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">{folderToDelete.name}</p>
                  <p className="text-[11px] text-amber-800">All nested subfolders and files inside will be permanently deleted.</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setFolderToDelete(null)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-full text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteFolder}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Deleting...' : 'Delete Folder'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
