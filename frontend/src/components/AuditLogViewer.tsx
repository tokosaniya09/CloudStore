import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search, Filter, Terminal, Clock, User, HardDrive } from 'lucide-react';
import { AuditLog } from '../types/index.ts';
import { apiClient } from '../api/client.ts';

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getAuditLogs(100);
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = actionFilter
    ? logs.filter((l) => l.action.toLowerCase().includes(actionFilter.toLowerCase()))
    : logs;

  return (
    <div className="space-y-6 text-slate-100">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            Audit Logging & Compliance Service
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Immutable Activity Trail powered by Kafka Consumer Service
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Filter action (e.g. FILE_UPLOADED)..."
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        {loading ? (
          <div className="py-8 text-center text-slate-500 font-mono text-xs">
            Querying audit log stream from database...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase">
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor Email</th>
                  <th className="py-2.5 px-3">Action Type</th>
                  <th className="py-2.5 px-3">Resource Type</th>
                  <th className="py-2.5 px-3">Details Payload</th>
                  <th className="py-2.5 px-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-indigo-300 font-semibold">
                      {log.actorEmail || log.actorId}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold text-[10px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{log.resourceType}</td>
                    <td className="py-2.5 px-3 text-slate-400 text-[10px]">
                      {JSON.stringify(log.details)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[10px]">{log.ipAddress}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
