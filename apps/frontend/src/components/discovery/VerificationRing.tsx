import React from 'react';

interface VerificationRingProps {
  passedChecks?: number;
  totalChecks?: number;
  providerName: string;
}

const STAGES = ['Identity Verified', 'Skill Verified', 'Background Checked', 'Admin Approved'];

export const VerificationRing: React.FC<VerificationRingProps> = ({
  passedChecks = 4,
  totalChecks = 4,
  providerName,
}) => {
  const verifiedStages = STAGES.slice(0, passedChecks).join(', ');

  return (
    <div className="relative flex-shrink-0" title={`${providerName}: ${passedChecks}/${totalChecks} checks (${verifiedStages})`}>
      <svg
        className="w-12 h-12 transform -rotate-90 select-none"
        viewBox="0 0 52 52"
        role="img"
        aria-label={`${providerName}: ${passedChecks} of ${totalChecks} verification checks passed`}
      >
        <title>{`Verified: ${verifiedStages}`}</title>
        {Array.from({ length: totalChecks }).map((_, i) => {
          const offset = -i * 25;
          const isPassed = i < passedChecks;
          return (
            <React.Fragment key={i}>
              {/* Background slot */}
              <circle
                cx="26"
                cy="26"
                r="21"
                fill="none"
                stroke="#C9D6D1"
                strokeWidth="4"
                strokeLinecap="round"
                pathLength="100"
                strokeDasharray="21 79"
                strokeDashoffset={offset}
              />
              {/* Passed fill */}
              {isPassed && (
                <circle
                  cx="26"
                  cy="26"
                  r="21"
                  fill="none"
                  stroke="#2E9E6B"
                  strokeWidth="4"
                  strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray="21 79"
                  strokeDashoffset={offset}
                  className="transition-all duration-300 ease-out"
                />
              )}
            </React.Fragment>
          );
        })}
      </svg>
      {/* Central check badge */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[10px] font-bold text-dwellio-teal">
          {passedChecks}/{totalChecks}
        </span>
      </div>
    </div>
  );
};
