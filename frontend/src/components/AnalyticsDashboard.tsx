import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  HardDrive,
  FileText,
  Users,
  ShieldAlert,
  Activity,
  PieChart,
  Folder,
} from 'lucide-react';
import { AnalyticsSummary } from '../types/index.ts';
import { apiClient } from '../api/client.ts';

interface AnalyticsDashboardProps {
  activeOrgId: string;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ activeOrgId }) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [activeOrgId]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const summary = await apiClient.getAnalyticsSummary(activeOrgId);
      setData(summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-8 text-center text-slate-500 font-mono text-xs">
        Aggregating system analytics from PostgreSQL and Audit Logs...
      </div>
    );
  }

  const usedMb = (data.totalStorageUsedBytes / (1024 * 1024)).toFixed(1);
  const quotaGb = (data.totalStorageQuotaBytes / (1024 * 1024 * 1024)).toFixed(1);
  const usagePct = Math.min(
    100,
    Math.round((data.totalStorageUsedBytes / data.totalStorageQuotaBytes) * 100)
  );

  return (
    <div className="space-y-6 text-slate-100">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-400" />
            Storage Analytics & Capacity Planning
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Real-time metric telemetry for {data.organization?.name}
          </p>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono">Storage Consumption</span>
            <HardDrive className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-xl font-bold text-white font-mono">{usedMb} MB</p>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-500 h-1.5 rounded-full"
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500 font-mono block">
            {usagePct}% of {quotaGb} GB quota
          </span>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono">Total Stored Objects</span>
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-white font-mono">{data.totalFiles}</p>
          <span className="text-[10px] text-slate-500 font-mono block">
            Across {data.totalFolders} materialized subdirectories
          </span>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono">Kafka Audit Events</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-white font-mono">{data.totalAuditEvents}</p>
          <span className="text-[10px] text-slate-500 font-mono block">
            Immutable log trail records
          </span>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2 shadow-xl">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-mono">Active Users</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-xl font-bold text-white font-mono">{data.activeUsersCount}</p>
          <span className="text-[10px] text-slate-500 font-mono block">
            Authenticated session accounts
          </span>
        </div>
      </div>

      {/* File Type Distribution */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <PieChart className="w-4 h-4 text-indigo-400" />
          MIME / File Extension Breakdown
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(data.fileTypeDistribution).map(([ext, count]) => (
            <div
              key={ext}
              className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl font-mono text-xs flex justify-between items-center"
            >
              <span className="text-slate-400 uppercase font-bold text-[11px]">.{ext}</span>
              <span className="text-indigo-400 font-bold bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-900">
                {count} {count === 1 ? 'file' : 'files'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
