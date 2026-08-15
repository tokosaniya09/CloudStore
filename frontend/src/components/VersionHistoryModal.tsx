import React, { useState, useEffect } from 'react';
import { History, RotateCcw, X, Check, Clock, Database, AlertCircle } from 'lucide-react';
import { FileItem, FileVersion } from '../types/index.ts';
import { apiClient } from '../api/client.ts';

interface VersionHistoryModalProps {
  file: FileItem | null;
  onClose: () => void;
  onVersionRolledBack: () => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  file,
  onClose,
  onVersionRolledBack,
}) => {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollingBackVersion, setRollingBackVersion] = useState<number | null>(null);
  const [rollbackConfirm, setRollbackConfirm] = useState<number | null>(null);

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

  if (!file) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-3xl p-6 w-full max-w-xl shadow-2xl space-y-4 text-gray-800 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-2xl">
              <History className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 tracking-tight">Version Lineage & History</h3>
              <p className="text-xs text-gray-500 font-medium truncate max-w-xs sm:max-w-md">{file.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
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
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {versions.map((ver) => {
              const isCurrent = ver.versionNumber === file.currentVersionNumber;
              return (
                <div
                  key={ver.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isCurrent
                      ? 'bg-blue-50/50 border-blue-200 text-gray-900 shadow-2xs'
                      : 'bg-gray-50/50 border-gray-200/80 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs px-2.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-800 shadow-2xs">
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

                    <div className="flex items-center gap-1 text-[11px] text-gray-400 truncate max-w-sm">
                      <Database className="w-3 h-3 shrink-0" />
                      <span className="truncate">{ver.s3StorageKey}</span>
                    </div>
                  </div>

                  {!isCurrent && (
                    <div className="flex items-center gap-2 shrink-0">
                      {rollbackConfirm === ver.versionNumber ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleRollback(ver.versionNumber)}
                            disabled={rollingBackVersion === ver.versionNumber}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-full text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                          >
                            {rollingBackVersion === ver.versionNumber ? 'Restoring...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setRollbackConfirm(null)}
                            className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRollbackConfirm(ver.versionNumber)}
                          className="px-3.5 py-1.5 bg-white hover:bg-amber-50 text-gray-700 hover:text-amber-800 border border-gray-200 hover:border-amber-300 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                          <span>Rollback</span>
                        </button>
                      )}
                    </div>
                  )}
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
