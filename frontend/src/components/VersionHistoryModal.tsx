import React, { useState, useEffect } from 'react';
import { History, RotateCcw, X, FileText, Check, Clock, User } from 'lucide-react';
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
      setVersions(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (versionNumber: number) => {
    if (!file) return;
    if (
      !window.confirm(
        `Are you sure you want to rollback "${file.name}" to Version ${versionNumber}? This creates a new version entry.`
      )
    )
      return;

    try {
      await apiClient.rollbackFileVersion(file.id, versionNumber);
      fetchVersions();
      onVersionRolledBack();
    } catch (err: any) {
      alert(`Rollback failed: ${err.message}`);
    }
  };

  if (!file) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-xl shadow-2xl space-y-4 text-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Version History</h3>
              <p className="text-xs text-slate-400 font-mono">{file.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-500 font-mono text-xs">
            Fetching version lineage from PostgreSQL...
          </div>
        ) : error ? (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs">
            {error}
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {versions.map((ver) => {
              const isCurrent = ver.versionNumber === file.currentVersionNumber;
              return (
                <div
                  key={ver.id}
                  className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                    isCurrent
                      ? 'bg-indigo-950/40 border-indigo-700/60 text-slate-100'
                      : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 border border-slate-700">
                        Version {ver.versionNumber}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1 font-mono">
                          <Check className="w-3 h-3" /> Current Active
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {new Date(ver.createdAt).toLocaleString()}
                      </span>
                      <span>•</span>
                      <span>{(ver.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono block">
                      S3 Key: {ver.s3StorageKey}
                    </span>
                  </div>

                  {!isCurrent && (
                    <button
                      onClick={() => handleRollback(ver.versionNumber)}
                      className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-600/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Rollback
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
