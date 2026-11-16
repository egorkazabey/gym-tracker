const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const IconToday = () => (
  <svg {...base}><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" /></svg>
);
export const IconChart = () => (
  <svg {...base}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 6-7" /></svg>
);
export const IconHistory = () => (
  <svg {...base}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
);
export const IconList = () => (
  <svg {...base}><path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
);
export const IconPlus = ({ size = 18 }: { size?: number }) => (
  <svg {...base} width={size} height={size}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconTrash = () => (
  <svg {...base} width={18} height={18}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
);
export const IconChevron = ({ dir = 'right' }: { dir?: 'right' | 'up' | 'down' | 'left' }) => {
  const r = { right: 0, down: 90, left: 180, up: 270 }[dir];
  return (
    <svg {...base} width={18} height={18} style={{ transform: `rotate(${r}deg)` }}><path d="m9 6 6 6-6 6" /></svg>
  );
};
export const IconTimer = () => (
  <svg {...base} width={18} height={18}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></svg>
);
export const IconCheck = () => (
  <svg {...base} width={18} height={18}><path d="m5 12 5 5L20 7" /></svg>
);
