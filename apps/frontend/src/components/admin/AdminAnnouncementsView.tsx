import React, { useState, useEffect, useCallback } from 'react';
import { AnnouncementData, PaginationMeta, CreateAnnouncementPayload } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import {
  fetchAdminAnnouncements,
  createAdminAnnouncement,
} from '../../services/adminService';

export const AdminAnnouncementsView: React.FC = () => {
  const { token } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementData[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [broadcastSuccessMessage, setBroadcastSuccessMessage] = useState<string | null>(null);

  // Composer Form State
  const [title, setTitle] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [audience, setAudience] = useState<'all' | 'customers' | 'providers'>('all');
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const loadAnnouncements = useCallback(
    async (pageToLoad = 1) => {
      if (!token) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetchAdminAnnouncements(token, {
          page: pageToLoad,
          limit: 10,
        });
        setAnnouncements(res.items);
        setPagination(res.pagination);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load announcements.');
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadAnnouncements(1);
  }, [loadAnnouncements]);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (title.trim().length < 3) {
      setComposerError('Announcement title must be at least 3 characters.');
      return;
    }
    if (message.trim().length < 5) {
      setComposerError('Announcement message must be at least 5 characters.');
      return;
    }

    setIsBroadcasting(true);
    setComposerError(null);
    try {
      const payload: CreateAnnouncementPayload = {
        title: title.trim(),
        message: message.trim(),
        audience,
      };

      const result = await createAdminAnnouncement(token, payload);
      setBroadcastSuccessMessage(
        `Broadcast dispatched to ${result.recipientCount} ${audience} recipients successfully!`
      );

      // Reset form
      setTitle('');
      setMessage('');
      setAudience('all');
      loadAnnouncements(1);

      setTimeout(() => setBroadcastSuccessMessage(null), 6000);
    } catch (err: any) {
      setComposerError(err.message || 'Failed to dispatch broadcast announcement.');
    } finally {
      setIsBroadcasting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-dwellio-teal flex items-center gap-2">
          <span>📢</span> Platform Broadcast Announcements
        </h2>
        <p className="text-xs text-dwellio-teal/70">
          Broadcast instant real-time alerts and persistent notifications to all users, customers, or service professionals.
        </p>
      </div>

      {broadcastSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl shadow-xs">
          ✓ {broadcastSuccessMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl shadow-xs">
          ✕ {errorMessage}
        </div>
      )}

      {/* Composer Section */}
      <div className="bg-white rounded-3xl border border-dwellio-mint/40 p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-dwellio-teal flex items-center gap-2">
          <span>✍️</span> Compose New Broadcast Alert
        </h3>

        {composerError && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl">
            ✕ {composerError}
          </div>
        )}

        <form onSubmit={handleBroadcast} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-dwellio-teal mb-1">
                Announcement Title <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="E.g., Scheduled Maintenance Window / Holiday Schedule"
                className="w-full p-2.5 text-xs border border-dwellio-mint/40 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-dwellio-teal mb-1">Target Audience *</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as any)}
                className="w-full p-2.5 text-xs border border-dwellio-mint/60 rounded-xl focus:outline-hidden font-bold"
              >
                <option value="all">All Platform Users</option>
                <option value="customers">Customers Only</option>
                <option value="providers">Verified Providers Only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-dwellio-teal mb-1">
              Broadcast Message <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={3}
              required
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter message text that will appear in user notifications..."
              className="w-full p-2.5 text-xs border border-dwellio-mint/40 rounded-xl focus:outline-hidden focus:border-dwellio-teal"
            />
            <div className="flex justify-between text-[10px] text-dwellio-teal/60 mt-1">
              <span>Dispatched instantly via Server-Sent Events (SSE) and persistent storage</span>
              <span>{message.length} / 500 characters</span>
            </div>
          </div>

          {/* Live Preview Card */}
          {(title || message) && (
            <div className="p-3 bg-dwellio-ivory rounded-2xl border border-dwellio-mint/50 space-y-1">
              <div className="text-[10px] font-bold text-dwellio-teal/70 uppercase tracking-wider">
                Live Notification Preview ({audience})
              </div>
              <div className="font-bold text-xs text-dwellio-teal">
                📢 {title || 'Announcement Title'}
              </div>
              <div className="text-xs text-dwellio-teal/80">
                {message || 'Broadcast message content will appear here...'}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isBroadcasting}
              className="px-5 py-2.5 bg-dwellio-teal hover:bg-dwellio-teal/90 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
            >
              {isBroadcasting ? 'Broadcasting...' : '📢 Send Broadcast Now'}
            </button>
          </div>
        </form>
      </div>

      {/* Broadcast History Table */}
      <div className="bg-white rounded-2xl border border-dwellio-mint/40 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-dwellio-mint/30 flex items-center justify-between">
          <h3 className="text-sm font-bold text-dwellio-teal">Broadcast History &amp; Logs</h3>
          <span className="text-xs text-dwellio-teal/60">{pagination.total} broadcasts sent</span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-dwellio-teal/70">
            Loading broadcast records...
          </div>
        ) : announcements.length === 0 ? (
          <div className="py-12 text-center text-xs text-dwellio-teal/60 italic">
            No platform announcements broadcasted yet.
          </div>
        ) : (
          <div className="divide-y divide-dwellio-mint/20">
            {announcements.map((a) => (
              <div key={a.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-dwellio-teal">{a.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-dwellio-ivory text-dwellio-teal border border-dwellio-mint/50">
                      {a.audience}
                    </span>
                    <span className="text-[11px] text-dwellio-teal/60 font-semibold">
                      ({a.recipientCount} recipients)
                    </span>
                  </div>
                  <p className="text-dwellio-teal/80">{a.message}</p>
                </div>
                <div className="text-dwellio-teal/60 sm:text-right shrink-0 whitespace-nowrap text-[11px]">
                  {new Date(a.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="p-3 bg-dwellio-ivory/50 border-t border-dwellio-mint/30 flex items-center justify-between text-xs">
            <span className="text-dwellio-teal/70">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadAnnouncements(pagination.page - 1)}
                className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
              >
                &larr; Prev
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadAnnouncements(pagination.page + 1)}
                className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
