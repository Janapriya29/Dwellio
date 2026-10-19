import React from 'react';
import { HouseRoom } from '@dwellio/shared';

interface HouseCutawayProps {
  selectedRoom: HouseRoom;
  onSelectRoom: (room: HouseRoom) => void;
}

export const HouseCutaway: React.FC<HouseCutawayProps> = ({ selectedRoom, onSelectRoom }) => {
  const handleKeyDown = (e: React.KeyboardEvent, room: HouseRoom) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectRoom(room);
    }
  };

  const getRoomFillClasses = (room: HouseRoom) => {
    const isSelected = selectedRoom === room;
    return isSelected
      ? 'fill-[#fde9dd] stroke-[#D9653B] stroke-[3px]'
      : 'fill-[#eef3ee] stroke-[#172B35] stroke-[1.5px] hover:fill-[#fde9dd] hover:stroke-[#D9653B] transition-colors duration-200';
  };

  const getGlowClasses = (room: HouseRoom) => {
    const isSelected = selectedRoom === room;
    return isSelected
      ? 'opacity-60 fill-[#f6c453] transition-opacity duration-200'
      : 'opacity-0 group-hover:opacity-40 group-focus-visible:opacity-40 fill-[#f6c453] transition-opacity duration-200';
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-white/50 backdrop-blur-sm p-4 sm:p-6 rounded-3xl border border-dwellio-mint/40 shadow-sm">
      <svg
        className="w-full h-auto select-none"
        viewBox="0 0 400 380"
        role="group"
        aria-label="Interactive cutaway of a house. Select a room to discover verified professionals."
      >
        {/* Roof */}
        <g
          className="group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D9653B] rounded"
          tabIndex={0}
          role="button"
          aria-label="Roof"
          aria-pressed={selectedRoom === 'roof'}
          onClick={() => onSelectRoom('roof')}
          onKeyDown={(e) => handleKeyDown(e, 'roof')}
        >
          <polygon className={getRoomFillClasses('roof')} points="24,112 200,20 376,112" />
          <polygon className={getGlowClasses('roof')} points="60,108 200,36 340,108" />
          <path
            className="fill-none stroke-[#172B35] stroke-[1.4px] stroke-linecap-round stroke-linejoin-round opacity-70"
            d="M120 94l80-40 80 40M150 94l50-26 50 26"
          />
          <text
            x="200"
            y="100"
            textAnchor="middle"
            className="font-sans font-semibold text-[13px] fill-[#172B35] pointer-events-none"
          >
            Roof
          </text>
        </g>

        {/* Bathroom */}
        <g
          className="group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D9653B]"
          tabIndex={0}
          role="button"
          aria-label="Bathroom"
          aria-pressed={selectedRoom === 'bath'}
          onClick={() => onSelectRoom('bath')}
          onKeyDown={(e) => handleKeyDown(e, 'bath')}
        >
          <rect className={getRoomFillClasses('bath')} x="24" y="112" width="176" height="130" />
          <rect className={getGlowClasses('bath')} x="30" y="118" width="164" height="118" />
          <path
            className="fill-none stroke-[#172B35] stroke-[1.4px] stroke-linecap-round stroke-linejoin-round opacity-70"
            d="M50 200h60v-18H50zM58 200v8M102 200v8M130 150v40M130 150h14M150 168h30v22h-30z"
          />
          <text
            x="36"
            y="136"
            className="font-sans font-semibold text-[13px] fill-[#172B35] pointer-events-none"
          >
            Bathroom
          </text>
        </g>

        {/* Living Room */}
        <g
          className="group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D9653B]"
          tabIndex={0}
          role="button"
          aria-label="Living room"
          aria-pressed={selectedRoom === 'living'}
          onClick={() => onSelectRoom('living')}
          onKeyDown={(e) => handleKeyDown(e, 'living')}
        >
          <rect className={getRoomFillClasses('living')} x="200" y="112" width="176" height="130" />
          <rect className={getGlowClasses('living')} x="206" y="118" width="164" height="118" />
          <path
            className="fill-none stroke-[#172B35] stroke-[1.4px] stroke-linecap-round stroke-linejoin-round opacity-70"
            d="M225 205h80v-22a8 8 0 0 0-8-8h-64a8 8 0 0 0-8 8zM232 205v8M298 205v8M330 150h28v28h-28zM344 150v28"
          />
          <text
            x="212"
            y="136"
            className="font-sans font-semibold text-[13px] fill-[#172B35] pointer-events-none"
          >
            Living room
          </text>
        </g>

        {/* Kitchen */}
        <g
          className="group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D9653B]"
          tabIndex={0}
          role="button"
          aria-label="Kitchen"
          aria-pressed={selectedRoom === 'kitchen'}
          onClick={() => onSelectRoom('kitchen')}
          onKeyDown={(e) => handleKeyDown(e, 'kitchen')}
        >
          <rect className={getRoomFillClasses('kitchen')} x="24" y="242" width="176" height="124" />
          <rect className={getGlowClasses('kitchen')} x="30" y="248" width="164" height="112" />
          <path
            className="fill-none stroke-[#172B35] stroke-[1.4px] stroke-linecap-round stroke-linejoin-round opacity-70"
            d="M48 340h110v-44H48zM48 318h110M70 296v-14M102 296v-14M134 296v-14M60 275h22M92 275h22M124 275h22"
          />
          <text
            x="36"
            y="266"
            className="font-sans font-semibold text-[13px] fill-[#172B35] pointer-events-none"
          >
            Kitchen
          </text>
        </g>

        {/* Garden & Outside */}
        <g
          className="group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D9653B]"
          tabIndex={0}
          role="button"
          aria-label="Garden and outside"
          aria-pressed={selectedRoom === 'garden'}
          onClick={() => onSelectRoom('garden')}
          onKeyDown={(e) => handleKeyDown(e, 'garden')}
        >
          <rect className={getRoomFillClasses('garden')} x="200" y="242" width="176" height="124" />
          <rect className={getGlowClasses('garden')} x="206" y="248" width="164" height="112" />
          <path
            className="fill-none stroke-[#172B35] stroke-[1.4px] stroke-linecap-round stroke-linejoin-round opacity-70"
            d="M230 340v-34M230 322c-14-4-18-16-18-24 12 2 18 10 18 24M230 316c12-4 16-14 16-22-10 2-16 8-16 22M300 340v-40M280 340h40M290 300c0-18 20-18 20 0"
          />
          <text
            x="212"
            y="266"
            className="font-sans font-semibold text-[13px] fill-[#172B35] pointer-events-none"
          >
            Garden &amp; outside
          </text>
        </g>
      </svg>
      <p className="text-xs text-center text-dwellio-teal/60 mt-3 font-medium">
        Tip: Click any room or use <kbd className="px-1.5 py-0.5 bg-dwellio-ivory rounded border border-dwellio-mint text-[11px]">Tab</kbd> and <kbd className="px-1.5 py-0.5 bg-dwellio-ivory rounded border border-dwellio-mint text-[11px]">Enter</kbd> to inspect verified specialists.
      </p>
    </div>
  );
};
