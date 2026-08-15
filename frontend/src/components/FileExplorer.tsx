import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Search,
  Download,
  History,
  Share2,
  Trash2,
  Folder as FolderIcon,
  ChevronRight,
  LayoutGrid,
  List as ListIcon,
  FileCode,
  Image as ImageIcon,
  FileSpreadsheet,
  FileBox,
  ArrowUpDown,
  User as UserIcon,
  Upload,
  FolderPlus,
  FolderInput,
  AlertTriangle,
  X,
  Plus,
  Move,
  Check,
  CheckSquare,
  Square,
  GripVertical,
} from 'lucide-react';
import { FileItem, Folder } from '../types/index.ts';
import { apiClient } from '../api/client.ts';

interface FileExplorerProps {
  files: FileItem[];
  folders: Folder[];
  activeOrgId: string;
  activeFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onRefresh: () => void;
  onOpenVersions: (file: FileItem) => void;
  onOpenSharing: (file: FileItem) => void;
  onNewFolderClick?: () => void;
  searchQuery: string;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  folders,
  activeOrgId,
  activeFolderId,
  onSelectFolder,
  onRefresh,
  onOpenVersions,
  onOpenSharing,
  onNewFolderClick,
  searchQuery,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [showTrash, setShowTrash] = useState(false);
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Folder creation modal state
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  // Folder move modal & selection state
  const [selectedFolderForMove, setSelectedFolderForMove] = useState<Folder | null>(null);
  const [targetParentId, setTargetParentId] = useState<string | null>(null);
  const [isMovingFolder, setIsMovingFolder] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Drag & drop state on folders
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    applyFilter();
  }, [files, searchQuery, activeFolderId, showTrash, filterType, sortBy]);

  const applyFilter = () => {
    let result = files;

    if (showTrash) {
      result = result.filter((f) => f.isDeleted);
    } else {
      result = result.filter((f) => !f.isDeleted);
      if (activeFolderId) {
        result = result.filter((f) => f.folderId === activeFolderId);
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.extension.toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (filterType !== 'all') {
      result = result.filter((f) => {
        const ext = f.extension.toLowerCase();
        if (filterType === 'docs') return ['pdf', 'doc', 'docx', 'txt'].includes(ext);
        if (filterType === 'code') return ['json', 'ts', 'tsx', 'js', 'sql', 'py'].includes(ext);
        if (filterType === 'design') return ['figma', 'png', 'jpg', 'svg'].includes(ext);
        return true;
      });
    }

    result = [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return b.sizeBytes - a.sizeBytes;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    setFilteredFiles(result);
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

  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const fileToUpload = e.target.files[0];
    setIsUploading(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const arrayBuffer = reader.result as ArrayBuffer;

        // 1. Init
        const initRes = await fetch('/api/v1/files/upload-init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: fileToUpload.name,
            contentType: fileToUpload.type || 'application/octet-stream',
            size: fileToUpload.size,
            folderId: activeFolderId,
            orgId: activeOrgId,
          }),
        });
        const initData = await initRes.json();
        const key = initData.s3Key || initData.key;

        // 2. Upload binary
        await fetch(`/api/v1/files/upload-binary?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          body: arrayBuffer,
        });

        // 3. Complete
        await fetch('/api/v1/files/upload-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId: initData.uploadId,
            key,
            fileName: fileToUpload.name,
            size: fileToUpload.size,
            mimeType: fileToUpload.type || 'application/octet-stream',
            extension: fileToUpload.name.split('.').pop() || 'dat',
            folderId: activeFolderId,
            orgId: activeOrgId,
          }),
        });

        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        onRefresh();
      };
      reader.readAsArrayBuffer(fileToUpload);
    } catch (err: any) {
      setIsUploading(false);
      alert(`Upload Error: ${err.message}`);
    }
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const { downloadUrl } = await apiClient.getDownloadUrl(file.id);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Download Error: ${err.message}`);
    }
  };

  const handleDelete = async (file: FileItem) => {
    if (!window.confirm(`Move "${file.name}" to trash?`)) return;
    try {
      await apiClient.deleteFile(file.id);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      setIsCreatingFolder(true);
      setFolderError(null);
      await apiClient.createFolder(newFolderName.trim(), activeFolderId, activeOrgId);
      setNewFolderName('');
      setShowCreateFolderModal(false);
      onRefresh();
    } catch (err: any) {
      setFolderError(err.message || 'Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleOpenMoveModal = (folder: Folder) => {
    setSelectedFolderForMove(folder);
    setTargetParentId(folder.parentId);
    setFolderError(null);
  };

  const handleMoveFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolderForMove) return;
    try {
      setIsMovingFolder(true);
      setFolderError(null);
      await apiClient.moveFolder(selectedFolderForMove.id, targetParentId, activeOrgId);
      setSelectedFolderForMove(null);
      setSelectedFolderId(null);
      onRefresh();
    } catch (err: any) {
      setFolderError(err.message || 'Failed to move folder');
    } finally {
      setIsMovingFolder(false);
    }
  };

  const handleDeleteFolder = async (folder: Folder) => {
    if (
      !window.confirm(
        `Are you sure you want to delete folder "${folder.name}" and all contents inside it?`
      )
    )
      return;
    try {
      await apiClient.deleteFolder(folder.id, activeOrgId);
      if (selectedFolderId === folder.id) setSelectedFolderId(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete folder');
    }
  };

  // Drag & drop handlers for folder cards
  const onFolderDragStart = (e: React.DragEvent, folder: Folder) => {
    e.dataTransfer.setData('text/plain', folder.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedFolderId(folder.id);
  };

  const onFolderDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedFolderId && draggedFolderId !== targetId) {
      setDragOverFolderId(targetId);
    }
  };

  const onFolderDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFolderId(null);
  };

  const onFolderDrop = async (e: React.DragEvent, targetParentId: string) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const sourceFolderId = e.dataTransfer.getData('text/plain') || draggedFolderId;
    setDraggedFolderId(null);

    if (!sourceFolderId || sourceFolderId === targetParentId) return;
    try {
      await apiClient.moveFolder(sourceFolderId, targetParentId, activeOrgId);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to move folder');
    }
  };

  // Build Breadcrumb Path
  const getBreadcrumbs = () => {
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: 'My Drive' }];
    if (!activeFolderId) return crumbs;

    let current: Folder | undefined = folders.find((f) => f.id === activeFolderId);
    const path: { id: string | null; name: string }[] = [];

    while (current) {
      path.unshift({ id: current.id, name: current.name });
      current = folders.find((f) => f.id === current?.parentId);
    }

    return [...crumbs, ...path];
  };

  // Get File Type Icon & Google Drive Color Palette
  const getFileIcon = (ext: string) => {
    const e = ext.toLowerCase();
    if (['pdf'].includes(e)) {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    if (['json', 'ts', 'js', 'py', 'sql'].includes(e)) {
      return <FileCode className="w-5 h-5 text-blue-600" />;
    }
    if (['figma', 'png', 'jpg', 'svg'].includes(e)) {
      return <ImageIcon className="w-5 h-5 text-purple-600" />;
    }
    if (['xlsx', 'csv'].includes(e)) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
    }
    return <FileBox className="w-5 h-5 text-amber-500" />;
  };

  const currentFolderSubfolders = folders.filter((f) => f.parentId === activeFolderId);
  const selectedFolderObj = folders.find((f) => f.id === selectedFolderId);

  return (
    <div className="bg-white border border-gray-200/80 rounded-3xl p-6 space-y-6 text-gray-800 shadow-xs font-sans">
      
      {/* Top Breadcrumb & Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        
        {/* Breadcrumb Path */}
        <div className="flex items-center gap-1.5 text-sm font-medium flex-wrap">
          {getBreadcrumbs().map((crumb, idx, arr) => {
            const isLast = idx === arr.length - 1;
            return (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight className="w-4 h-4 text-gray-400" />}
                <button
                  onClick={() => onSelectFolder(crumb.id)}
                  className={`hover:text-blue-600 transition-colors flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer ${
                    isLast
                      ? 'text-gray-900 font-bold bg-gray-100/80'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {idx === 0 && <FolderIcon className="w-4 h-4 text-amber-500" />}
                  <span>{crumb.name}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* View Controls & Filter Pills */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-between md:justify-end">
          
          {/* Hidden File Input for Quick Upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleQuickUpload}
            className="hidden"
          />

          {/* Quick Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Uploading...' : 'Upload File'}</span>
          </button>

          {/* New Folder Button */}
          <button
            onClick={() => {
              setNewFolderName('');
              setFolderError(null);
              setShowCreateFolderModal(true);
            }}
            className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200/80 text-gray-700 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-gray-200/80"
          >
            <FolderPlus className="w-3.5 h-3.5 text-blue-600" />
            <span>+ Folder</span>
          </button>

          {/* File Type Filter Pills */}
          <div className="hidden lg:flex items-center bg-gray-100/80 rounded-full p-1 border border-gray-200/60 text-xs">
            {['all', 'docs', 'code', 'design'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1 rounded-full transition-all cursor-pointer capitalize font-semibold ${
                  filterType === type
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* List vs Grid Toggle */}
          <div className="flex items-center bg-gray-100/80 rounded-full p-1 border border-gray-200/60">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-blue-600 shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
              title="List View"
            >
              <ListIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-white text-blue-600 shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Trash Toggle */}
          <button
            onClick={() => setShowTrash(!showTrash)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              showTrash
                ? 'bg-red-100 text-red-700 border border-red-200'
                : 'bg-gray-100 hover:bg-gray-200/80 text-gray-700 border border-gray-200/80'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Trash</span>
          </button>
        </div>
      </div>

      {/* Selected Folder Action Toolbar */}
      {selectedFolderObj && (
        <div className="p-3 bg-[#e8f0fe] border border-blue-200 rounded-2xl flex items-center justify-between gap-3 text-xs animate-fadeIn">
          <div className="flex items-center gap-2 text-blue-900 font-bold">
            <FolderIcon className="w-4 h-4 text-amber-500" />
            <span>Selected folder:</span>
            <span className="bg-white px-2.5 py-0.5 rounded-lg border border-blue-200 font-semibold text-gray-800">
              {selectedFolderObj.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenMoveModal(selectedFolderObj)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <FolderInput className="w-3.5 h-3.5" />
              <span>Move Folder</span>
            </button>
            <button
              onClick={() => onSelectFolder(selectedFolderObj.id)}
              className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-full font-semibold transition-colors cursor-pointer"
            >
              Open
            </button>
            <button
              onClick={() => handleDeleteFolder(selectedFolderObj)}
              className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-full font-semibold transition-colors cursor-pointer"
            >
              Delete
            </button>
            <button
              onClick={() => setSelectedFolderId(null)}
              className="p-1 hover:bg-blue-100 rounded-full text-blue-800 cursor-pointer"
              title="Deselect"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Folders Cards Row (Authentic Google Drive Style with Select & Move) */}
      {!showTrash && currentFolderSubfolders.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Folders ({currentFolderSubfolders.length})
            </h3>
            <span className="text-[11px] text-gray-400">
              Click to select or open • Drag to move
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {currentFolderSubfolders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;
              const isDropTarget = dragOverFolderId === folder.id;
              const isBeingDragged = draggedFolderId === folder.id;

              return (
                <div
                  key={folder.id}
                  draggable
                  onDragStart={(e) => onFolderDragStart(e, folder)}
                  onDragOver={(e) => onFolderDragOver(e, folder.id)}
                  onDragLeave={onFolderDragLeave}
                  onDrop={(e) => onFolderDrop(e, folder.id)}
                  onClick={() => setSelectedFolderId(isSelected ? null : folder.id)}
                  onDoubleClick={() => onSelectFolder(folder.id)}
                  className={`group relative flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all border select-none ${
                    isBeingDragged ? 'opacity-40 border-2 border-dashed border-gray-300' : ''
                  } ${
                    isDropTarget
                      ? 'bg-blue-100 border-2 border-blue-500 scale-[1.02] shadow-md'
                      : isSelected
                      ? 'bg-[#c2e7ff] border-blue-400 text-[#001d35] font-bold shadow-sm'
                      : 'bg-gray-50/80 hover:bg-blue-50/40 border-gray-200/80 hover:border-blue-300 shadow-xs'
                  }`}
                  title="Click to select • Double-click to open • Drag onto another folder to move"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <FolderIcon className="w-5 h-5 text-amber-500 shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold text-gray-800 truncate group-hover:text-blue-700">
                      {folder.name}
                    </span>
                  </div>

                  {/* Action Icons on Hover */}
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0 ml-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenMoveModal(folder);
                      }}
                      title="Move this folder to another location"
                      className="p-1 hover:bg-white/80 rounded-md text-gray-500 hover:text-blue-600 cursor-pointer"
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
              );
            })}
          </div>
        </div>
      )}

      {/* Files Section Title & Sort */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          {showTrash ? 'Trash Bin' : 'Files'} ({filteredFiles.length})
        </h3>

        <div className="flex items-center gap-2 text-xs text-gray-500 font-semibold">
          <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="bg-transparent text-gray-700 font-semibold focus:outline-none cursor-pointer text-xs"
          >
            <option value="date">Sort by Date</option>
            <option value="name">Sort by Name</option>
            <option value="size">Sort by Size</option>
          </select>
        </div>
      </div>

      {/* Files Display (List or Grid) */}
      {filteredFiles.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/50 space-y-2">
          <FileText className="w-12 h-12 text-gray-300 mx-auto" />
          <p className="text-sm font-bold text-gray-700">
            {showTrash ? 'Trash bin is empty' : 'No files in this folder'}
          </p>
          <p className="text-xs text-gray-400">
            Click "+ New" on the sidebar to upload files into your cloud drive.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Cards View */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="bg-white border border-gray-200/80 hover:border-blue-300 rounded-2xl p-4 flex flex-col justify-between gap-4 transition-all hover:shadow-md group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl shrink-0">
                    {getFileIcon(file.extension)}
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-xs text-gray-800 group-hover:text-blue-600 block truncate">
                      {file.name}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium block">
                      {(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                  v{file.currentVersionNumber}
                </span>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1">
                {file.tags.map((t, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md text-[10px] font-medium"
                  >
                    #{t}
                  </span>
                ))}
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-gray-500">
                <span className="text-[10px] font-medium text-gray-400">
                  {new Date(file.updatedAt).toLocaleDateString()}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDownload(file)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-blue-600 transition-colors cursor-pointer"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onOpenVersions(file)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-blue-600 transition-colors cursor-pointer"
                    title="Version History"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onOpenSharing(file)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-blue-600 transition-colors cursor-pointer"
                    title="Share Permissions"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(file)}
                    className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="border border-gray-200/80 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200/80 text-gray-400 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4 hidden sm:table-cell">Version</th>
                <th className="py-3 px-4 hidden md:table-cell">Size</th>
                <th className="py-3 px-4 hidden lg:table-cell">Last Modified</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
              {filteredFiles.map((file) => (
                <tr key={file.id} className="hover:bg-blue-50/40 transition-colors group">
                  <td className="py-3 px-4 flex items-center gap-3">
                    <div className="p-1.5 bg-gray-50 border border-gray-100 rounded-lg shrink-0">
                      {getFileIcon(file.extension)}
                    </div>
                    <span className="font-bold text-gray-800 group-hover:text-blue-600 truncate max-w-[200px] md:max-w-xs">
                      {file.name}
                    </span>
                  </td>
                  <td className="py-3 px-4 hidden sm:table-cell">
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                      v{file.currentVersionNumber}
                    </span>
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell text-gray-500">
                    {(file.sizeBytes / (1024 * 1024)).toFixed(2)} MB
                  </td>
                  <td className="py-3 px-4 hidden lg:table-cell text-gray-400">
                    {new Date(file.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        onClick={() => handleDownload(file)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-blue-600 transition-colors cursor-pointer"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onOpenVersions(file)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-blue-600 transition-colors cursor-pointer"
                        title="Version History"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onOpenSharing(file)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-blue-600 transition-colors cursor-pointer"
                        title="Share Permissions"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(file)}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Create New Folder */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-200 p-6 max-w-sm w-full space-y-4 shadow-2xl text-gray-800 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-blue-600" />
                <span>New Folder</span>
              </h3>
              <button
                onClick={() => setShowCreateFolderModal(false)}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {folderError && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{folderError}</span>
              </div>
            )}

            <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. Project Documents"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 rounded-xl px-3.5 py-2 text-sm text-gray-800 focus:outline-none transition-all"
                />
              </div>

              <p className="text-[11px] text-gray-500 font-medium">
                Creating folder inside:{' '}
                <span className="font-bold text-gray-700">
                  {folders.find((f) => f.id === activeFolderId)?.name || 'My Drive (Root)'}
                </span>
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateFolderModal(false)}
                  disabled={isCreatingFolder}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFolder || !newFolderName.trim()}
                  className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingFolder ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Move Folder from File Explorer */}
      {selectedFolderForMove && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-gray-200 p-6 max-w-sm w-full space-y-4 shadow-2xl text-gray-800 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <FolderInput className="w-4 h-4 text-blue-600" />
                <span>Move Folder: "{selectedFolderForMove.name}"</span>
              </h3>
              <button
                onClick={() => setSelectedFolderForMove(null)}
                className="text-gray-400 hover:text-gray-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {folderError && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{folderError}</span>
              </div>
            )}

            <form onSubmit={handleMoveFolderSubmit} className="space-y-4">
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
                    .filter((f) => f.id !== selectedFolderForMove.id)
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
                  Moving: {selectedFolderForMove.name}
                </p>
                <p className="text-gray-600">
                  Destination: <span className="font-bold">{getFolderDisplayPath(targetParentId)}</span>
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedFolderForMove(null)}
                  disabled={isMovingFolder}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isMovingFolder}
                  className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isMovingFolder ? 'Moving...' : 'Confirm Move'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
