import React, { useState, useEffect, useCallback } from 'react';
import { ProviderReviewsData } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { fetchProviderReviews } from '../../services/providerService';
import { replyToReview } from '../../services/reviewService';

export const ProviderReviewsHub: React.FC = () => {
  const { token, user } = useAuth();
  const [data, setData] = useState<ProviderReviewsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Filters & Pagination
  const [selectedRating, setSelectedRating] = useState<number | undefined>(undefined);
  const [hasReplyFilter, setHasReplyFilter] = useState<boolean | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reply Composer State
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>('');
  const [isSubmittingReply, setIsSubmittingReply] = useState<boolean>(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetchProviderReviews(token, {
        page: currentPage,
        limit: 8,
        rating: selectedRating,
        hasReply: hasReplyFilter,
      });
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load reviews.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [token, currentPage, selectedRating, hasReplyFilter]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleReplySubmit = async (reviewId: string) => {
    if (!token || !replyText.trim()) return;

    if (replyText.trim().length < 10 || replyText.trim().length > 1000) {
      setReplyError('Reply must be between 10 and 1,000 characters.');
      return;
    }

    setIsSubmittingReply(true);
    setReplyError(null);
    try {
      const updated = await replyToReview(reviewId, { replyText: replyText.trim() }, token);

      // Update state locally
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          reviews: prev.reviews.map((r) => (r.id === updated.id ? updated : r)),
        };
      });

      setReplyingReviewId(null);
      setReplyText('');
      setActionSuccessMessage('Response published successfully to customer review.');
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish reply.';
      setReplyError(msg);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const totalAllReviews = data?.summary.reviewCount || 0;
  const ratingAverage = data?.summary.ratingAverage || 0;
  const distribution = data?.summary.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  return (
    <div className="space-y-6">
      {/* Header & Reputation Summary */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white border border-dwellio-mint/60 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-dwellio-mint/30">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-dwellio-teal/60">
              Verified Reputation
            </span>
            <h2 className="text-2xl font-black text-dwellio-teal tracking-tight">
              Customer Reviews Hub
            </h2>
            <p className="text-xs sm:text-sm text-dwellio-teal/70 mt-0.5">
              Verified homeowner reviews and one-time professional public replies for <strong>{user?.name}</strong>.
            </p>
          </div>

          {/* Average Rating Badge */}
          <div className="flex items-center gap-4 bg-amber-50/70 p-4 rounded-2xl border border-amber-200/80 self-start sm:self-auto">
            <div className="text-center">
              <span className="text-3xl font-black text-amber-700 block">
                {ratingAverage > 0 ? ratingAverage.toFixed(1) : '—'}
              </span>
              <div className="flex text-amber-500 font-bold text-sm justify-center">
                {'★'.repeat(Math.round(ratingAverage))}
                <span className="text-slate-300">
                  {'★'.repeat(5 - Math.round(ratingAverage))}
                </span>
              </div>
            </div>
            <div className="border-l border-amber-200/80 pl-4 text-xs text-amber-900">
              <div className="font-bold">{totalAllReviews} Total Reviews</div>
              <div className="text-[11px] text-amber-800/80">100% Verified bookings</div>
            </div>
          </div>
        </div>

        {/* Rating Breakdown Distribution */}
        {totalAllReviews > 0 && (
          <div className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = distribution[stars] || 0;
              const pct = totalAllReviews > 0 ? Math.round((count / totalAllReviews) * 100) : 0;
              return (
                <div key={stars} className="flex items-center gap-3 text-xs">
                  <span className="font-bold text-dwellio-teal w-12 flex-shrink-0">
                    {stars} ★
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 w-16 text-right flex-shrink-0">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Success Notification */}
      {actionSuccessMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={loadReviews}
            className="px-3 py-1 rounded bg-rose-600 text-white font-bold hover:bg-rose-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-dwellio-mint/60 text-xs">
        {/* Star Rating Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-dwellio-teal/70 mr-1">Rating:</span>
          <button
            type="button"
            onClick={() => {
              setSelectedRating(undefined);
              setCurrentPage(1);
            }}
            className={`px-3 py-1 rounded-xl font-bold transition ${
              selectedRating === undefined
                ? 'bg-dwellio-teal text-white shadow-xs'
                : 'bg-dwellio-ivory/50 border border-dwellio-mint text-dwellio-teal hover:bg-white'
            }`}
          >
            All Stars
          </button>
          {[5, 4, 3, 2, 1].map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => {
                setSelectedRating(rating);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-xl font-bold transition flex items-center gap-1 ${
                selectedRating === rating
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-dwellio-ivory/50 border border-dwellio-mint text-dwellio-teal hover:bg-white'
              }`}
            >
              <span>{rating}</span>
              <span className="text-amber-300">★</span>
            </button>
          ))}
        </div>

        {/* Reply Status Filters */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-dwellio-teal/70 mr-1">Status:</span>
          <button
            type="button"
            onClick={() => {
              setHasReplyFilter(undefined);
              setCurrentPage(1);
            }}
            className={`px-3 py-1 rounded-xl font-bold transition ${
              hasReplyFilter === undefined
                ? 'bg-dwellio-teal text-white shadow-xs'
                : 'bg-dwellio-ivory/50 border border-dwellio-mint text-dwellio-teal hover:bg-white'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => {
              setHasReplyFilter(false);
              setCurrentPage(1);
            }}
            className={`px-3 py-1 rounded-xl font-bold transition ${
              hasReplyFilter === false
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-dwellio-ivory/50 border border-dwellio-mint text-dwellio-teal hover:bg-white'
            }`}
          >
            Awaiting Reply
          </button>
          <button
            type="button"
            onClick={() => {
              setHasReplyFilter(true);
              setCurrentPage(1);
            }}
            className={`px-3 py-1 rounded-xl font-bold transition ${
              hasReplyFilter === true
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-dwellio-ivory/50 border border-dwellio-mint text-dwellio-teal hover:bg-white'
            }`}
          >
            Replied
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-32 bg-white/70 rounded-3xl border border-dwellio-mint/40" />
          <div className="h-32 bg-white/70 rounded-3xl border border-dwellio-mint/40" />
        </div>
      )}

      {/* Review Cards List */}
      {!isLoading && data && (
        <>
          {data.reviews.length === 0 ? (
            <div className="p-8 rounded-3xl bg-white border border-dwellio-mint/60 text-center">
              <span className="text-3xl block mb-2">⭐</span>
              <h4 className="text-base font-bold text-dwellio-teal mb-1">
                No Reviews Found
              </h4>
              <p className="text-xs text-dwellio-teal/70 max-w-sm mx-auto">
                No customer reviews match your active filter criteria. Try resetting the filters.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.reviews.map((rev) => {
                const isReplying = replyingReviewId === rev.id;

                return (
                  <div
                    key={rev.id}
                    className="p-6 rounded-3xl bg-white border border-dwellio-mint/60 shadow-xs space-y-3 text-xs"
                  >
                    {/* Review Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dwellio-mint/30 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-dwellio-teal text-sm">
                            {rev.customer?.name || 'Verified Homeowner'}
                          </span>
                          <span className="text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                            Verified Booking
                          </span>
                        </div>
                        {rev.service && (
                          <span className="text-slate-500 text-[11px] mt-0.5 block">
                            Service: <strong>{rev.service.name}</strong>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <div className="flex text-amber-500 font-bold text-sm">
                          {'★'.repeat(rev.rating)}
                          <span className="text-slate-300">{'★'.repeat(5 - rev.rating)}</span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {new Date(rev.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Customer Comment */}
                    {rev.comment ? (
                      <p className="text-dwellio-teal/90 italic leading-relaxed bg-dwellio-ivory/40 p-3 rounded-2xl border border-dwellio-mint/30">
                        &ldquo;{rev.comment}&rdquo;
                      </p>
                    ) : (
                      <p className="text-slate-400 italic text-[11px]">
                        No written comment provided.
                      </p>
                    )}

                    {/* Provider Reply Box or Action */}
                    {rev.providerReply ? (
                      <div className="pl-4 border-l-2 border-dwellio-teal/50 bg-dwellio-ivory/60 p-3 rounded-r-2xl border border-dwellio-mint/30">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-[10px] uppercase tracking-wider text-dwellio-teal">
                            Your Public Reply
                          </span>
                          <span className="text-[10px] text-dwellio-teal/60">
                            {new Date(rev.providerReply.repliedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-dwellio-teal text-xs">
                          {rev.providerReply.replyText}
                        </p>
                      </div>
                    ) : isReplying ? (
                      <div className="bg-white p-4 rounded-2xl border border-dwellio-teal/40 space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-dwellio-teal text-xs">
                            Write One-Time Public Reply:
                          </span>
                          <span className="text-[10px] text-dwellio-teal/60">
                            {replyText.trim().length} / 1,000 chars (min 10)
                          </span>
                        </div>
                        <p className="text-[11px] text-dwellio-teal/60">
                          Your response will be visible on your public reviews profile. You can reply once per verified review.
                        </p>
                        <textarea
                          rows={3}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Thank the homeowner or address their feedback professionally (10–1,000 characters)..."
                          className="w-full rounded-xl border border-dwellio-mint/80 bg-dwellio-ivory/30 p-2.5 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
                        />
                        {replyError && (
                          <div className="text-[11px] text-rose-600 font-semibold">{replyError}</div>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingReviewId(null);
                              setReplyText('');
                              setReplyError(null);
                            }}
                            className="px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isSubmittingReply || replyText.trim().length < 10 || replyText.trim().length > 1000}
                            onClick={() => handleReplySubmit(rev.id)}
                            className="px-4 py-1.5 rounded-xl bg-dwellio-teal text-white font-bold text-xs hover:bg-dwellio-teal/90 transition disabled:opacity-50"
                          >
                            {isSubmittingReply ? 'Publishing...' : 'Publish Public Reply'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingReviewId(rev.id);
                            setReplyText('');
                            setReplyError(null);
                          }}
                          className="px-3 py-1.5 rounded-xl border border-dwellio-teal/40 text-dwellio-teal font-bold text-xs hover:bg-dwellio-mint/20 transition flex items-center gap-1.5"
                        >
                          💬 Reply to Review
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Pagination Controls */}
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-dwellio-mint/60 text-xs">
                  <span className="text-slate-500">
                    Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} reviews)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={data.pagination.page <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-xl border border-dwellio-mint text-dwellio-teal font-bold hover:bg-dwellio-ivory transition disabled:opacity-40"
                    >
                      ← Previous
                    </button>
                    <button
                      type="button"
                      disabled={data.pagination.page >= data.pagination.totalPages}
                      onClick={() => setCurrentPage((p) => p + 1)}
                      className="px-3 py-1.5 rounded-xl border border-dwellio-mint text-dwellio-teal font-bold hover:bg-dwellio-ivory transition disabled:opacity-40"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
