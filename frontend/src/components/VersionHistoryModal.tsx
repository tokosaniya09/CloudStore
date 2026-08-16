import React, { useState, useEffect } from 'react';
import { History, RotateCcw, X, Check, Clock, Database, AlertCircle, Eye, Download } from 'lucide-react';
import { FileItem, FileVersion } from '../types/index.ts';
import { apiClient } from '../api/client.ts';

interface VersionHistoryModalProps {
  file: FileItem | null;
  onClose: () => void;
  onPreviewVersion?: (file: FileItem) => void;
  onVersionRolledBack: () => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  file,
  onClose,
  onPreviewVersion,
  onVersionRolledBack,
}) => {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollingBackVersion, setRollingBackVersion] = useState<number | null>(null);
  const [rollbackConfirm, setRollbackConfirm] = useState<number | null>(null);
  const [downloadingVersion, setDownloadingVersion] = useState<number | null>(null);

  useEffect(() => {
    if (file) {
      fetchVersions();
    }
  }, [file]);

  const fetchVersions = async () => {
    if (!file) return;
    try {
      setLoading(true);
      const data = await apiClient.getFileVersions(file.id);
      
      // Strict client-side deduplication safeguard
      const map = new Map<string, FileVersion>();
      for (const v of data) {
        const key = `${v.fileId}-v${v.versionNumber}`;
        if (!map.has(key)) {
          map.set(key, v);
        }
      }
      setVersions(Array.from(map.values()).sort((a, b) => b.versionNumber - a.versionNumber));
    } catch (err: any) {
      setError(err.message || 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (versionNumber: number) => {
    if (!file) return;
    try {
      setRollingBackVersion(versionNumber);
      await apiClient.rollbackFileVersion(file.id, versionNumber);
      setRollbackConfirm(null);
      await fetchVersions();
      onVersionRolledBack();
    } catch (err: any) {
      alert(`Rollback failed: ${err.message}`);
    } finally {
      setRollingBackVersion(null);
    }
  };

  const handleDownloadVersion = async (versionNumber: number) => {
    if (!file) return;
    try {
      setDownloadingVersion(versionNumber);
      const res = await fetch(`/api/v1/files/${file.id}/download?version=${versionNumber}&download=true`);
      if (!res.ok) throw new Error('Failed to generate download link');
      const data = await res.json();
      if (data.downloadUrl) {
        const link = document.createElement('a');
        link.href = data.downloadUrl;
        link.download = `${file.name.replace(/\.[^/.]+$/, '')}_v${versionNumber}.${file.extension}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    } finally {
      setDownloadingVersion(null);
    }
  };

  const handlePreview = (ver: FileVersion) => {
    if (!file || !onPreviewVersion) return;
    const versionedFile: FileItem = {
      ...file,
      currentVersionNumber: ver.versionNumber,
      s3StorageKey: ver.s3StorageKey,
      sizeBytes: ver.sizeBytes,
    };
    onPreviewVersion(versionedFile);
  };

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-gray-200 p-6 max-w-xl w-full space-y-4 shadow-2xl text-gray-800 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Version History</h3>
              <p className="text-xs text-gray-500 truncate max-w-xs">{file.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-12 text-center text-gray-400 text-xs flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span>Fetching version lineage...</span>
          </div>
        ) : error ? (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : versions.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-xs">
            No previous versions available for this file.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {versions.map((ver) => {
              const isCurrent = ver.versionNumber === file.currentVersionNumber;
              return (
                <div
                  key={ver.id}
                  onClick={() => handlePreview(ver)}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group hover:shadow-md ${
                    isCurrent
                      ? 'bg-blue-50/60 border-blue-300 text-gray-900 shadow-2xs'
                      : 'bg-gray-50/70 border-gray-200 text-gray-700 hover:bg-blue-50/20 hover:border-blue-200'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs px-2.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-800 shadow-2xs group-hover:border-blue-300">
                        Version {ver.versionNumber}
                      </span>
                      {isCurrent && (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-600" /> Current Active
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 text-xs text-gray-500 font-medium">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {new Date(ver.createdAt).toLocaleString()}
                      </span>
                      <span>•</span>
                      <span>{(ver.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-gray-400 truncate max-w-sm font-mono">
                      <Database className="w-3 h-3 shrink-0" />
                      <span className="truncate">{ver.s3StorageKey}</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Preview Eye Icon Button */}
                    <button
                      type="button"
                      onClick={() => handlePreview(ver)}
                      className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-all cursor-pointer shadow-xs"
                      title={`Preview version ${ver.versionNumber}`}
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {/* Download Button */}
                    <button
                      type="button"
                      onClick={() => handleDownloadVersion(ver.versionNumber)}
                      disabled={downloadingVersion === ver.versionNumber}
                      className="p-2 hover:bg-gray-200 text-gray-600 hover:text-gray-900 rounded-full border border-gray-200 bg-white transition-colors cursor-pointer"
                      title={`Download version ${ver.versionNumber}`}
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    {!isCurrent && (
                      <div>
                        {rollbackConfirm === ver.versionNumber ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleRollback(ver.versionNumber)}
                              disabled={rollingBackVersion === ver.versionNumber}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-full text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                            >
                              {rollingBackVersion === ver.versionNumber ? 'Restoring...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setRollbackConfirm(null)}
                              className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRollbackConfirm(ver.versionNumber)}
                            className="px-3 py-1.5 bg-white hover:bg-amber-50 text-gray-700 hover:text-amber-800 border border-gray-200 hover:border-amber-300 rounded-full text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                            title="Rollback to this version"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                            <span>Rollback</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer info */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>Total versions: {versions.length}</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-full text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
