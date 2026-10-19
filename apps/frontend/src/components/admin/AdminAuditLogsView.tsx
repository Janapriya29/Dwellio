import React, { useState, useEffect, useCallback } from 'react';
import { AuditLogData, AuditLogAction, PaginationMeta } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { fetchAdminAuditLogs } from '../../services/adminService';

const AUDIT_ACTIONS: { label: string; value?: AuditLogAction }[] = [
  { label: 'All Actions' },
  { label: 'Provider Approved', value: 'PROVIDER_APPLICATION_APPROVED' },
  { label: 'Provider Rejected', value: 'PROVIDER_APPLICATION_REJECTED' },
  { label: 'Category Created', value: 'CATEGORY_CREATED' },
  { label: 'Category Updated', value: 'CATEGORY_UPDATED' },
  { label: 'Category Status Changed', value: 'CATEGORY_STATUS_CHANGED' },
  { label: 'Service Created', value: 'SERVICE_CREATED' },
  { label: 'Service Updated', value: 'SERVICE_UPDATED' },
  { label: 'Service Status Changed', value: 'SERVICE_STATUS_CHANGED' },
  { label: 'Review Moderated', value: 'REVIEW_MODERATED' },
];

const getActionBadge = (action: AuditLogAction) => {
  if (action.includes('APPROVED')) return 'bg-emerald-50 text-emerald-800 border-emerald-300';
  if (action.includes('REJECTED')) return 'bg-rose-50 text-rose-800 border-rose-300';
  if (action.includes('MODERATED')) return 'bg-amber-50 text-amber-800 border-amber-300';
  if (action.includes('STATUS')) return 'bg-purple-50 text-purple-800 border-purple-300';
  if (action.includes('CREATED')) return 'bg-sky-50 text-sky-800 border-sky-300';
  return 'bg-slate-50 text-slate-800 border-slate-300';
};

export const AdminAuditLogsView: React.FC = () => {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLogData[]>([]);
  const [selectedAction, setSelectedAction] = useState<AuditLogAction | undefined>(undefined);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAuditLogs = useCallback(
    async (pageToLoad = pagination.page) => {
      if (!token) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetchAdminAuditLogs(token, {
          page: pageToLoad,
          limit: 10,
          action: selectedAction,
        });
        setLogs(res.items);
        setPagination(res.pagination);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load audit logs.');
      } finally {
        setIsLoading(false);
      }
    },
    [token, selectedAction, pagination.page]
  );

  useEffect(() => {
    loadAuditLogs(1);
  }, [selectedAction]);

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-dwellio-teal">Immutable Platform Audit Logs</h2>
          <p className="text-xs text-dwellio-teal/70">
            Append-only record of all administrative approvals, catalog modifications, and moderation decisions.
          </p>
        </div>

        {/* Action Filter Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-dwellio-teal">Action:</span>
          <select
            value={selectedAction || ''}
            onChange={(e) => setSelectedAction((e.target.value as AuditLogAction) || undefined)}
            className="text-xs p-2 bg-white border border-dwellio-mint/60 rounded-xl focus:outline-hidden"
          >
            {AUDIT_ACTIONS.map((a) => (
              <option key={a.label} value={a.value || ''}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Explanatory Banner */}
      <div className="p-3.5 bg-dwellio-ivory border border-dwellio-mint/60 rounded-2xl flex items-center gap-3 text-xs text-dwellio-teal/80">
        <span className="text-xl">📜</span>
        <div>
          <strong className="text-dwellio-teal">Compliance & Security Guarantee:</strong> All platform
          administrative actions are recorded immutably with the administrator's identity, timestamp, target
          entity, and change payload.
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
          {errorMessage}
        </div>
      )}

      {/* Table / List */}
      {isLoading ? (
        <div className="py-16 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-dwellio-teal border-t-transparent mb-3" />
          <p className="text-sm font-semibold text-dwellio-teal/70">Loading audit trail...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dwellio-mint/40">
          <p className="text-sm font-bold text-dwellio-teal">No audit records found</p>
          <p className="text-xs text-dwellio-teal/60 mt-1">
            No administrative events match the selected filter.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dwellio-mint/40 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-dwellio-teal">
              <thead className="bg-dwellio-ivory/50 border-b border-dwellio-mint/30 font-bold">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Administrator</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dwellio-mint/20 font-mono text-[11px]">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-dwellio-ivory/20 transition">
                    <td className="py-3 px-4 font-sans text-dwellio-teal/70 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <div className="font-bold text-dwellio-teal">
                        {log.adminName || 'Admin User'}
                      </div>
                      {log.adminEmail && (
                        <div className="text-[10px] text-dwellio-teal/60">{log.adminEmail}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadge(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <span className="font-semibold text-dwellio-teal">{log.targetType}</span>
                      <div className="font-mono text-[10px] text-dwellio-teal/60">
                        #{log.targetId.slice(-6)}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] text-dwellio-teal/80 max-w-xs truncate">
                      {log.details ? (
                        <span title={JSON.stringify(log.details, null, 2)}>
                          {JSON.stringify(log.details)}
                        </span>
                      ) : (
                        <span className="text-dwellio-teal/40 italic font-sans">&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="p-3 border-t border-dwellio-mint/30 flex items-center justify-between text-xs text-dwellio-teal/70 bg-dwellio-ivory/20 font-sans">
              <span>
                Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => loadAuditLogs(pagination.page - 1)}
                  className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadAuditLogs(pagination.page + 1)}
                  className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
