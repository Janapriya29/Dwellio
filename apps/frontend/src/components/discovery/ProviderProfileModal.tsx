import React, { useState, useEffect } from 'react';
import { PublicProviderData, PublicReviewData, ProviderRatingSummary } from '@dwellio/shared';
import { fetchProviderReviews } from '../../services/reviewService';
import { VerificationRing } from './VerificationRing';

interface ProviderProfileModalProps {
  isOpen: boolean;
  provider: PublicProviderData;
  onClose: () => void;
  onBook: (provider: PublicProviderData) => void;
}

export const ProviderProfileModal: React.FC<ProviderProfileModalProps> = ({
  isOpen,
  provider,
  onClose,
  onBook,
}) => {
  const [reviews, setReviews] = useState<PublicReviewData[]>([]);
  const [ratingSummary, setRatingSummary] = useState<ProviderRatingSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !provider?.id) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    fetchProviderReviews(provider.id, 1, 10)
      .then((data) => {
        if (isMounted) {
          setReviews(data.reviews || []);
          setRatingSummary(data.summary || null);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Unable to load reviews';
          setError(msg);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, provider.id]);

  const effectiveRating = ratingSummary?.ratingAverage ?? provider.ratingAverage ?? 0;
  const effectiveReviewCount = ratingSummary?.reviewCount ?? provider.reviewCount ?? 0;

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="provider-profile-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dwellio-teal/70 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-dwellio-mint/40 relative my-8 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-dwellio-ivory flex items-center justify-center text-dwellio-teal/60 hover:text-dwellio-teal hover:bg-dwellio-mint/30 transition"
          aria-label="Close dialog"
        >
          ✕
        </button>

        {/* Header: Identity, Verification & Rating */}
        <div className="border-b border-dwellio-mint/30 pb-5 pr-8">
          <div className="flex items-start sm:items-center gap-4">
            <VerificationRing providerName={provider.displayName} status={provider.verificationStatus} />

            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 id="provider-profile-title" className="text-2xl font-black text-dwellio-teal tracking-tight">
                  {provider.displayName}
                </h2>
                {provider.verificationStatus === 'approved' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Dwellio Admin Verified Specialist
                  </span>
                ) : provider.verificationStatus === 'pending' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Pending Verification
                  </span>
                ) : null}
              </div>

              {/* Rating & Review Counter */}
              <div className="flex items-center gap-2 text-sm">
                {effectiveReviewCount > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-500 font-bold text-base">★</span>
                    <span className="font-extrabold text-dwellio-teal">
                      {Number(effectiveRating).toFixed(1)}
                    </span>
                    <span className="text-dwellio-teal/60 text-xs font-medium">
                      ({effectiveReviewCount} verified {effectiveReviewCount === 1 ? 'review' : 'reviews'})
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-dwellio-teal/50 italic">New specialist • No reviews yet</span>
                )}
                {provider.serviceArea && (
                  <>
                    <span className="text-dwellio-teal/30">•</span>
                    <span className="text-xs text-dwellio-teal/70 font-medium">
                      📍 Serving {provider.serviceArea}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Admin Verification Clearance Note */}
          {provider.verificationStatus === 'approved' && (
            <div className="mt-4 p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/70 flex items-center gap-2.5 text-xs text-emerald-900">
              <span className="text-base flex-shrink-0">🛡️</span>
              <div>
                <p className="font-bold">Dwellio Admin Verified Specialist</p>
                <p className="text-[11px] text-emerald-800/80">
                  This service professional has been reviewed and cleared by Dwellio administration to provide services.
                </p>
              </div>
            </div>
          )}

          {provider.verificationStatus === 'pending' && (
            <div className="mt-4 p-3 rounded-2xl bg-amber-50/70 border border-amber-200/70 flex items-center gap-2.5 text-xs text-amber-900">
              <span className="text-base flex-shrink-0">⏳</span>
              <div>
                <p className="font-bold">Pending Administrative Review</p>
                <p className="text-[11px] text-amber-800/80">
                  This provider application is currently awaiting administrator verification.
                </p>
              </div>
            </div>
          )}

          {/* Skills & Trades */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-dwellio-teal/60 mr-1">Specialties:</span>
            {provider.skills.map((skill, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-dwellio-mint/20 text-dwellio-teal border border-dwellio-mint/60"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Scrollable Content: Customer Reviews */}
        <div className="flex-1 overflow-y-auto py-5 space-y-4 pr-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-dwellio-teal">
              Verified Customer Reviews ({reviews.length})
            </h3>
            <span className="text-[11px] text-dwellio-teal/60">
              Only submitted after completed bookings
            </span>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="space-y-3 animate-pulse py-4">
              {[1, 2].map((i) => (
                <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-1/4" />
                  <div className="h-3 bg-slate-200 rounded w-3/4" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              {error}
            </div>
          )}

          {/* Empty Reviews */}
          {!isLoading && !error && reviews.length === 0 && (
            <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-dwellio-mint/60 bg-dwellio-ivory/30">
              <span className="text-2xl mb-1 block">⭐</span>
              <p className="text-sm font-bold text-dwellio-teal">No verified reviews yet</p>
              <p className="text-xs text-dwellio-teal/60 mt-0.5 max-w-sm mx-auto">
                This verified specialist is ready for service requests. Book an appointment and share your feedback after the job is completed!
              </p>
            </div>
          )}

          {/* Reviews List */}
          {!isLoading && reviews.length > 0 && (
            <div className="space-y-3">
              {reviews.map((rev) => (
                <div
                  key={rev.id}
                  className="p-4 rounded-2xl bg-dwellio-ivory/40 border border-dwellio-mint/40 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-dwellio-teal text-sm">{rev.customerName}</span>
                      <div className="flex text-amber-500 font-bold text-xs" aria-label={`${rev.rating} out of 5 stars`}>
                        {'★'.repeat(rev.rating)}
                        <span className="text-slate-300">{'★'.repeat(Math.max(0, 5 - rev.rating))}</span>
                      </div>
                    </div>
                    <span className="text-[11px] text-dwellio-teal/50">
                      {new Date(rev.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  {rev.serviceName && (
                    <span className="inline-block px-2 py-0.5 rounded bg-white border border-dwellio-mint/60 text-[10px] font-semibold text-dwellio-teal/70">
                      Service: {rev.serviceName}
                    </span>
                  )}

                  {rev.comment ? (
                    <p className="text-dwellio-teal/85 leading-relaxed bg-white/70 p-2.5 rounded-xl border border-dwellio-mint/20">
                      &ldquo;{rev.comment}&rdquo;
                    </p>
                  ) : (
                    <p className="text-dwellio-teal/50 italic text-[11px]">No written comment provided.</p>
                  )}

                  {/* Provider Reply */}
                  {rev.providerReply && (
                    <div className="mt-2 pl-3 border-l-2 border-dwellio-teal/60 bg-white/90 p-2.5 rounded-r-xl border border-dwellio-mint/30">
                      <div className="flex items-center justify-between text-[10px] font-bold text-dwellio-teal mb-0.5">
                        <span>Response from {provider.displayName}</span>
                        <span className="text-dwellio-teal/50">
                          {new Date(rev.providerReply.repliedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-dwellio-teal/80 text-[11px] leading-relaxed">
                        {rev.providerReply.replyText}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer: Action CTAs */}
        <div className="border-t border-dwellio-mint/30 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-dwellio-teal/70">
            <span>Indicative diagnostic visit from <strong>₹499</strong>. Final quotation provided after inspection.</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-dwellio-mint text-dwellio-teal font-bold text-xs hover:bg-dwellio-ivory transition"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => onBook(provider)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#D9653B] text-white font-extrabold text-xs hover:bg-[#c4562f] shadow-xs hover:shadow transition"
            >
              Book {provider.displayName} &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
