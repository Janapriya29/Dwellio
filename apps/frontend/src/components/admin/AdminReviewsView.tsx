import React, { useState, useEffect, useCallback } from 'react';
import { AdminReviewItem, PaginationMeta } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { fetchAdminReviews, moderateAdminReview } from '../../services/adminService';

export const AdminReviewsView: React.FC = () => {
  const { token } = useAuth();
  const [reviews, setReviews] = useState<AdminReviewItem[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'published' | 'hidden'>('all');
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Moderation modal states
  const [hidingReview, setHidingReview] = useState<AdminReviewItem | null>(null);
  const [moderationReason, setModerationReason] = useState<string>('');
  const [restoringReview, setRestoringReview] = useState<AdminReviewItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadReviews = useCallback(
    async (pageToLoad = pagination.page) => {
      if (!token) return;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const isPublished =
          filterMode === 'published' ? true : filterMode === 'hidden' ? false : undefined;
        const res = await fetchAdminReviews(token, {
          page: pageToLoad,
          limit: 10,
          isPublished,
        });
        setReviews(res.items);
        setPagination(res.pagination);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load reviews.');
      } finally {
        setIsLoading(false);
      }
    },
    [token, filterMode, pagination.page]
  );

  useEffect(() => {
    loadReviews(1);
  }, [filterMode]);

  const handleHideConfirm = async () => {
    if (!token || !hidingReview) return;
    const trimmed = moderationReason.trim();
    if (trimmed.length < 5 || trimmed.length > 500) {
      setModalError('Please enter a moderation reason between 5 and 500 characters.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);
    try {
      await moderateAdminReview(token, hidingReview.id, {
        isPublished: false,
        moderationReason: trimmed,
      });
      setActionSuccessMessage(
        'Review was hidden. Provider rating aggregate and review count have been safely recalculated.'
      );
      setHidingReview(null);
      setModerationReason('');
      await loadReviews();
    } catch (err: any) {
      setModalError(err.message || 'Failed to hide review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestoreConfirm = async () => {
    if (!token || !restoringReview) return;
    setIsSubmitting(true);
    setModalError(null);
    try {
      await moderateAdminReview(token, restoringReview.id, {
        isPublished: true,
      });
      setActionSuccessMessage(
        'Review was restored. Provider rating aggregate and review count have been safely recalculated.'
      );
      setRestoringReview(null);
      await loadReviews();
    } catch (err: any) {
      setModalError(err.message || 'Failed to restore review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-dwellio-teal">Review Moderation</h2>
          <p className="text-xs text-dwellio-teal/70">
            Moderate inappropriate reviews and uphold high trust standards across the Dwellio community.
          </p>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-dwellio-mint/50">
          {(['all', 'published', 'hidden'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition capitalize ${
                filterMode === mode
                  ? 'bg-dwellio-teal text-white shadow-xs'
                  : 'text-dwellio-teal/70 hover:text-dwellio-teal'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Explanatory Banner */}
      <div className="p-3.5 bg-dwellio-ivory border border-dwellio-mint/60 rounded-2xl flex items-center gap-3 text-xs text-dwellio-teal/80">
        <span className="text-xl">⚖️</span>
        <div>
          <strong className="text-dwellio-teal">Automatic Aggregate Recalculation:</strong> When a
          review is hidden or restored, Dwellio's recalculation engine automatically updates the
          provider's overall star rating average and verified review count with optimistic concurrency safety.
        </div>
      </div>

      {/* Action Success Alert */}
      {actionSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs text-emerald-900">
          <span>{actionSuccessMessage}</span>
          <button
            type="button"
            onClick={() => setActionSuccessMessage(null)}
            className="font-bold hover:underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
          {errorMessage}
        </div>
      )}

      {/* Reviews List */}
      {isLoading ? (
        <div className="py-16 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-dwellio-teal border-t-transparent mb-3" />
          <p className="text-sm font-semibold text-dwellio-teal/70">Loading reviews...</p>
        </div>
      ) : reviews.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dwellio-mint/40">
          <p className="text-sm font-bold text-dwellio-teal">No reviews found</p>
          <p className="text-xs text-dwellio-teal/60 mt-1">
            No reviews match the current "{filterMode}" filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div
              key={r.id}
              className={`p-4 bg-white rounded-2xl border ${
                r.isPublished ? 'border-dwellio-mint/40' : 'border-rose-300 bg-rose-50/20'
              } shadow-xs space-y-3`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dwellio-mint/20 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex text-amber-500 text-sm">
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i}>{i < r.rating ? '★' : '☆'}</span>
                    ))}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-dwellio-teal">{r.serviceName}</span>
                    <span className="text-xs text-dwellio-teal/60 ml-1">
                      for <strong className="text-dwellio-teal">{r.providerDisplayName}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      r.isPublished
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-rose-50 text-rose-800 border-rose-300'
                    }`}
                  >
                    {r.isPublished ? 'Published' : 'Hidden (Moderated)'}
                  </span>
                  <span className="text-[11px] text-dwellio-teal/50">
                    {new Date(r.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              {/* Review Comment */}
              <div className="text-xs text-dwellio-teal/90">
                <span className="font-semibold text-dwellio-teal">{r.customerName}: </span>
                <span className="italic">{r.comment || '(No written comment)'}</span>
              </div>

              {/* Provider Reply if present */}
              {r.providerReply && (
                <div className="p-3 bg-dwellio-ivory/50 rounded-xl border border-dwellio-mint/30 text-xs">
                  <span className="font-bold text-dwellio-teal">Provider Reply: </span>
                  <span className="text-dwellio-teal/80 italic">{r.providerReply.replyText}</span>
                </div>
              )}

              {/* Moderation Details if hidden */}
              {!r.isPublished && (
                <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-900">
                  <span className="font-bold">Moderation Reason: </span>
                  <span>{r.moderationReason || 'Violated platform terms.'}</span>
                  {r.moderatedAt && (
                    <span className="text-[10px] text-rose-700/80 ml-2">
                      ({new Date(r.moderatedAt).toLocaleString()})
                    </span>
                  )}
                </div>
              )}

              {/* Moderation Action Buttons */}
              <div className="flex justify-end pt-1">
                {r.isPublished ? (
                  <button
                    type="button"
                    onClick={() => {
                      setHidingReview(r);
                      setModerationReason('');
                      setModalError(null);
                    }}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold rounded-xl transition"
                  >
                    Hide Review
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRestoringReview(r);
                      setModalError(null);
                    }}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold rounded-xl transition"
                  >
                    Restore Review
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="p-3 bg-white border border-dwellio-mint/40 rounded-2xl flex items-center justify-between text-xs text-dwellio-teal/70 shadow-xs">
              <span>
                Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => loadReviews(pagination.page - 1)}
                  className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => loadReviews(pagination.page + 1)}
                  className="px-3 py-1 bg-white border border-dwellio-mint/50 rounded-lg font-bold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hide Review Modal */}
      {hidingReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-dwellio-mint/40 space-y-4">
            <h3 className="text-base font-bold text-dwellio-teal">Hide Review</h3>
            <p className="text-xs text-dwellio-teal/70">
              Hiding this review will remove it from public view and automatically exclude its score from{' '}
              <strong className="text-dwellio-teal">{hidingReview.providerDisplayName}</strong>'s overall
              star rating.
            </p>

            <div>
              <label className="block text-xs font-bold text-dwellio-teal mb-1">
                Moderation Reason (5–500 characters) *
              </label>
              <textarea
                value={moderationReason}
                onChange={(e) => setModerationReason(e.target.value)}
                placeholder="e.g., Inappropriate content, profanity, or spam."
                rows={3}
                className="w-full text-xs p-3 border border-dwellio-mint/60 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-rose-500/30"
              />
              <div className="text-[11px] text-dwellio-teal/50 text-right mt-1">
                {moderationReason.length}/500 characters
              </div>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setHidingReview(null)}
                className="px-4 py-2 border border-dwellio-mint/50 rounded-xl text-xs font-bold text-dwellio-teal hover:bg-dwellio-ivory transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleHideConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {isSubmitting ? 'Hiding...' : 'Confirm Hide'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Review Modal */}
      {restoringReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-dwellio-mint/40 space-y-4">
            <h3 className="text-base font-bold text-dwellio-teal">Restore Review</h3>
            <p className="text-xs text-dwellio-teal/70">
              Restoring this review will make it publicly visible again and include its rating in{' '}
              <strong className="text-dwellio-teal">{restoringReview.providerDisplayName}</strong>'s
              aggregate score.
            </p>

            {modalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                {modalError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setRestoringReview(null)}
                className="px-4 py-2 border border-dwellio-mint/50 rounded-xl text-xs font-bold text-dwellio-teal hover:bg-dwellio-ivory transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleRestoreConfirm}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
              >
                {isSubmitting ? 'Restoring...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
