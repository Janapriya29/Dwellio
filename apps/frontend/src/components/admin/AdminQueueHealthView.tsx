import React, { useEffect, useState, useCallback } from 'react';
import { QueueSystemHealthData, QueueMetrics } from '@dwellio/shared';
import { getAdminQueueMetrics } from '../../services/adminQueueService';

interface AdminQueueHealthViewProps {
  token: string;
}

export const AdminQueueHealthView: React.FC<AdminQueueHealthViewProps> = ({ token }) => {
  const [data, setData] = useState<QueueSystemHealthData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchMetrics = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAdminQueueMetrics(token);
      setData(result);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch queue metrics');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const queueDescriptions: Record<string, string> = {
    'dwellio-notifications': 'Processes asynchronous broadcast announcements and in-app system notifications.',
    'dwellio-booking-lifecycle': 'Automates appointment reminders (24h/2h), request expiry, overdue job detection, and conversation auto-locking.',
    'dwellio-maintenance': 'Handles unpaid booking expiration sweeps and stale payment webhook lease recovery.',
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Background Processing & Queues</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time BullMQ queue metrics, Redis message broker status, and automated background jobs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Last updated: {lastRefreshed.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchMetrics}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-xs disabled:opacity-50"
          >
            <svg
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchMetrics} className="text-xs font-semibold underline ml-3">
            Retry
          </button>
        </div>
      )}

      {/* Platform & Broker Status Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Redis Connection</p>
            <p className="text-lg font-bold text-slate-800 capitalize mt-0.5">
              {data?.redisStatus === 'connected' ? 'Connected' : data?.redisStatus === 'mock' ? 'Mock (In-Memory)' : 'Unavailable'}
            </p>
          </div>
          <span
            className={`w-3 h-3 rounded-full ${
              data?.redisStatus === 'connected' || data?.redisStatus === 'mock'
                ? 'bg-emerald-500 ring-4 ring-emerald-100'
                : 'bg-rose-500 ring-4 ring-rose-100'
            }`}
          />
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Worker Supervisor</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5">
              {data ? `${data.activeWorkers} Active Supervisor` : '—'}
            </p>
          </div>
          <span className="w-3 h-3 rounded-full bg-blue-500 ring-4 ring-blue-100" />
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Managed Queues</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5">
              {data ? Object.keys(data.queues).length : 3} Queues Active
            </p>
          </div>
          <span className="w-3 h-3 rounded-full bg-purple-500 ring-4 ring-purple-100" />
        </div>
      </div>

      {/* Queues Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {data &&
          Object.entries(data.queues).map(([queueName, metrics]: [string, QueueMetrics]) => (
            <div
              key={queueName}
              className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col"
            >
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800 text-sm font-mono truncate max-w-[200px]" title={queueName}>
                    {queueName}
                  </h3>
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                      metrics.paused
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {metrics.paused ? 'Paused' : 'Active'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {queueDescriptions[queueName] || 'BullMQ managed background processing queue.'}
                </p>
              </div>

              <div className="p-5 flex-1 grid grid-cols-2 gap-3 text-center">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Waiting</p>
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{metrics.waiting}</p>
                </div>
                <div className="p-3 bg-blue-50/60 rounded-lg">
                  <p className="text-xs text-blue-600 font-medium">Active</p>
                  <p className="text-lg font-bold text-blue-700 mt-0.5">{metrics.active}</p>
                </div>
                <div className="p-3 bg-purple-50/60 rounded-lg">
                  <p className="text-xs text-purple-600 font-medium">Delayed</p>
                  <p className="text-lg font-bold text-purple-700 mt-0.5">{metrics.delayed}</p>
                </div>
                <div className="p-3 bg-emerald-50/60 rounded-lg">
                  <p className="text-xs text-emerald-600 font-medium">Completed</p>
                  <p className="text-lg font-bold text-emerald-700 mt-0.5">{metrics.completed}</p>
                </div>
              </div>

              {metrics.failed > 0 && (
                <div className="px-5 py-2.5 bg-rose-50 border-t border-rose-100 flex items-center justify-between text-xs text-rose-700">
                  <span>Failed Jobs:</span>
                  <span className="font-bold">{metrics.failed}</span>
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
};
