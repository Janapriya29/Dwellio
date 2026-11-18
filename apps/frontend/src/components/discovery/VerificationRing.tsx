import React from 'react';
import { ProviderVerificationStatus } from '@dwellio/shared';

interface VerificationRingProps {
  passedChecks?: number;
  totalChecks?: number;
  status?: ProviderVerificationStatus;
  providerName: string;
}

export const VerificationRing: React.FC<VerificationRingProps> = ({
  status = 'approved',
  providerName,
}) => {
  const isApproved = status === 'approved';
  const isPending = status === 'pending';

  const label = isApproved
    ? `${providerName}: Dwellio Admin Verified Specialist`
    : isPending
    ? `${providerName}: Verification Pending Admin Review`
    : `${providerName}: Unverified`;

  return (
    <div className="relative flex-shrink-0" title={label}>
      <svg
        className="w-12 h-12 transform -rotate-90 select-none"
        viewBox="0 0 52 52"
        role="img"
        aria-label={label}
      >
        <title>{label}</title>
        {/* Background track */}
        <circle
          cx="26"
          cy="26"
          r="21"
          fill="none"
          stroke="#C9D6D1"
          strokeWidth="4"
        />
        {/* Active Ring */}
        {isApproved && (
          <circle
            cx="26"
            cy="26"
            r="21"
            fill="none"
            stroke="#2E9E6B"
            strokeWidth="4"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray="100 0"
            className="transition-all duration-300 ease-out"
          />
        )}
        {isPending && (
          <circle
            cx="26"
            cy="26"
            r="21"
            fill="none"
            stroke="#D97706"
            strokeWidth="4"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray="50 50"
            className="transition-all duration-300 ease-out"
          />
        )}
      </svg>
      {/* Central icon */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {isApproved ? (
          <span className="text-sm font-black text-emerald-700">✓</span>
        ) : isPending ? (
          <span className="text-xs font-bold text-amber-700">⏳</span>
        ) : (
          <span className="text-xs font-bold text-slate-400">—</span>
        )}
      </div>
    </div>
  );
};
