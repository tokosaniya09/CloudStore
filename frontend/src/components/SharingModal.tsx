import React, { useState } from 'react';
import { Share2, Link2, Copy, Check, Lock, Globe, Clock, ShieldCheck, X } from 'lucide-react';
import { FileItem } from '../types/index.ts';
import { apiClient } from '../api/client.ts';

interface SharingModalProps {
  file: FileItem | null;
  onClose: () => void;
}

export const SharingModal: React.FC<SharingModalProps> = ({ file, onClose }) => {
  const [permissionLevel, setPermissionLevel] = useState('VIEW');
  const [granteeEmail, setGranteeEmail] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [maxDownloads, setMaxDownloads] = useState(100);
  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!file) return null;

  const handleGrantUserAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!granteeEmail) return;
    try {
      setStatusMessage(null);
      await apiClient.grantPermission(file.id, null, 'USER', granteeEmail, permissionLevel);
      setStatusMessage(`Granted ${permissionLevel} access to ${granteeEmail}`);
      setGranteeEmail('');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleGeneratePublicLink = async () => {
    try {
      setStatusMessage(null);
      const share = await apiClient.createPublicShare(file.id, null, permissionLevel, expiresInDays, maxDownloads);
      const url = `${window.location.origin}/share/${share.shareToken}`;
      setPublicLink(url);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const copyToClipboard = () => {
    if (publicLink) {
      navigator.clipboard.writeText(publicLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5 text-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Access & Public Links</h3>
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

        {statusMessage && (
          <div className="p-2.5 bg-emerald-950/60 border border-emerald-800 rounded-xl text-emerald-300 text-xs">
            {statusMessage}
          </div>
        )}

        {/* Section 1: Internal Sharing */}
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase font-mono">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span>Grant Internal Access</span>
          </div>

          <form onSubmit={handleGrantUserAccess} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="User email (e.g. sarah.designer@enterprise.org)"
                value={granteeEmail}
                onChange={(e) => setGranteeEmail(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <select
                value={permissionLevel}
                onChange={(e) => setPermissionLevel(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-200 font-mono"
              >
                <option value="VIEW">VIEW</option>
                <option value="EDIT">EDIT</option>
                <option value="OWNER">OWNER</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
            >
              Grant Permission & Dispatch Kafka Alert
            </button>
          </form>
        </div>

        {/* Section 2: Secure Public Links */}
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase font-mono">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>Generate Secure Public Link</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1 font-mono text-[10px]">Expires In</label>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
              >
                <option value={1}>1 Day</option>
                <option value={7}>7 Days</option>
                <option value={30}>30 Days</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1 font-mono text-[10px]">Max Downloads</label>
              <input
                type="number"
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          <button
            onClick={handleGeneratePublicLink}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            Generate Public Share Token
          </button>

          {publicLink && (
            <div className="mt-3 p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
              <span className="text-[10px] text-slate-400 font-mono block">Public Shareable URL:</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicLink}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-indigo-300 font-mono"
                />
                <button
                  onClick={copyToClipboard}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
