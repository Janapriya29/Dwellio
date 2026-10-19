import React, { useState } from 'react';
import { BookingData, ReviewData } from '@dwellio/shared';
import { useAuth } from '../../context/AuthContext';
import { createBookingReview } from '../../services/reviewService';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: BookingData;
  onReviewSuccess?: (review: ReviewData) => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  booking,
  onReviewSuccess,
}) => {
  const { token } = useAuth();
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [comment, setComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const displayRating = hoverRating !== null ? hoverRating : rating;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!rating || rating < 1 || rating > 5) {
      setErrorMessage('Please select a star rating from 1 to 5.');
      return;
    }

    const trimmed = comment.trim();
    if (trimmed.length > 0 && trimmed.length < 10) {
      setErrorMessage('If providing written feedback, please enter at least 10 characters.');
      return;
    }

    if (trimmed.length > 1000) {
      setErrorMessage('Review comments cannot exceed 1000 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const createdReview = await createBookingReview(
        booking.id,
        {
          rating,
          comment: trimmed.length > 0 ? trimmed : undefined,
        },
        token || ''
      );

      setIsSuccess(true);
      if (onReviewSuccess) {
        onReviewSuccess(createdReview);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit review.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dwellio-teal/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-dwellio-mint animate-in fade-in zoom-in-95 duration-150">
        {/* Success View */}
        {isSuccess ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 id="review-modal-title" className="text-2xl font-bold text-dwellio-teal mb-2">
              Review Submitted!
            </h3>
            <p className="text-sm text-dwellio-teal/70 max-w-sm mx-auto mb-6">
              Thank you for reviewing <strong>{booking.provider?.displayName || 'the technician'}</strong>. Your feedback helps our community maintain high service standards.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex items-center justify-center px-5 py-3 rounded-xl bg-dwellio-teal text-white font-bold text-sm hover:bg-dwellio-teal/90 shadow transition"
            >
              Done &amp; Return to Bookings
            </button>
          </div>
        ) : (
          /* Review Form */
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-dwellio-mint/30 pb-4 mb-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-dwellio-teal/60">
                  Verified Service Review
                </span>
                <h3 id="review-modal-title" className="text-xl sm:text-2xl font-black text-dwellio-teal">
                  Rate Your Experience
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition"
                aria-label="Close review modal"
              >
                ✕
              </button>
            </div>

            {/* Service & Provider summary card */}
            <div className="bg-dwellio-ivory rounded-2xl p-4 mb-5 border border-dwellio-mint/60 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-dwellio-teal">{booking.service?.name || 'Completed Home Service'}</p>
                <p className="text-[11px] text-dwellio-teal/70">
                  Technician: <strong>{booking.provider?.displayName || 'Verified Professional'}</strong>
                </p>
                <p className="text-[10px] text-dwellio-teal/50 mt-0.5">
                  Ref #{booking.id.slice(-6).toUpperCase()} • Completed on {new Date(booking.scheduledStartTime).toLocaleDateString()}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                Verified Job
              </span>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {errorMessage}
              </div>
            )}

            {/* Star Rating Selector */}
            <div className="mb-6 text-center">
              <label id="star-rating-label" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider mb-2">
                Overall Quality &amp; Punctuality *
              </label>

              <div
                role="radiogroup"
                aria-labelledby="star-rating-label"
                className="flex items-center justify-center gap-2 py-1"
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={rating === star}
                    aria-label={`${star} star${star > 1 ? 's' : ''}`}
                    tabIndex={0}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    onFocus={() => setHoverRating(star)}
                    onBlur={() => setHoverRating(null)}
                    className="p-1 focus:outline-none focus:ring-2 focus:ring-dwellio-teal rounded-lg transition-transform hover:scale-110"
                  >
                    <svg
                      className={`w-9 h-9 ${
                        star <= displayRating
                          ? 'text-amber-400 fill-amber-400 drop-shadow-xs'
                          : 'text-slate-300 fill-transparent stroke-current'
                      } transition-colors`}
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                      />
                    </svg>
                  </button>
                ))}
              </div>

              <span className="text-xs font-bold text-dwellio-teal/80 block mt-1">
                {displayRating === 5 && '⭐️⭐️⭐️⭐️⭐️ Outstanding Service'}
                {displayRating === 4 && '⭐️⭐️⭐️⭐️ Very Good Experience'}
                {displayRating === 3 && '⭐️⭐️⭐️ Satisfactory Job'}
                {displayRating === 2 && '⭐️⭐️ Below Expectations'}
                {displayRating === 1 && '⭐️ Poor Quality'}
              </span>
            </div>

            {/* Written Comment Field */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="review-comment" className="block text-xs font-bold text-dwellio-teal uppercase tracking-wider">
                  Written Feedback (Optional)
                </label>
                <span className={`text-[10px] font-mono ${comment.length > 1000 ? 'text-rose-600 font-bold' : 'text-dwellio-teal/50'}`}>
                  {comment.length} / 1000
                </span>
              </div>
              <textarea
                id="review-comment"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience (punctuality, neatness of work, technical competence)..."
                className="w-full rounded-2xl border border-dwellio-mint/80 bg-white p-3 text-xs text-dwellio-teal focus:outline-none focus:ring-2 focus:ring-dwellio-teal"
              />
              <p className="text-[10px] text-dwellio-teal/50 mt-1">
                If entering written comments, please enter at least 10 characters.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-dwellio-mint/30">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-[#D9653B] text-white text-xs font-bold hover:bg-[#c4562f] shadow transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting Review...
                  </>
                ) : (
                  'Publish Verified Review'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
