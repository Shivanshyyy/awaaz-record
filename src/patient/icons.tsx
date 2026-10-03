import type { Timing } from '../record/schema';

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

// Printed in black and white too, so each icon also carries its word.
function Svg({ children, size }: { children: React.ReactNode; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" {...base}>
      {children}
    </svg>
  );
}

export function TimingIcon({ slot, size = 40 }: { slot: Timing | 'needed'; size?: number }) {
  switch (slot) {
    case 'morning':
      return (
        <Svg size={size}>
          <path d="M4 24h24M9 24a7 7 0 0 1 14 0M16 6v4M6 12l3 3M26 12l-3 3" />
        </Svg>
      );
    case 'afternoon':
      return (
        <Svg size={size}>
          <circle cx="16" cy="16" r="5.5" />
          <path d="M16 3.5v3.5M16 25v3.5M3.5 16H7M25 16h3.5M7.2 7.2l2.4 2.4M22.4 22.4l2.4 2.4M24.8 7.2l-2.4 2.4M9.6 22.4l-2.4 2.4" />
        </Svg>
      );
    case 'night':
      return (
        <Svg size={size}>
          <path d="M25 19.5A10 10 0 0 1 12.5 7a10 10 0 1 0 12.5 12.5z" />
        </Svg>
      );
    case 'needed':
      return (
        <Svg size={size}>
          <rect x="3" y="11" width="26" height="10" rx="5" />
          <path d="M16 11v10" />
        </Svg>
      );
  }
}

export const SLOT_WORD: Record<Timing | 'needed', string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  night: 'Night',
  needed: 'When needed',
};
