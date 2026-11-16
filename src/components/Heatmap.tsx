import { todayISO, WEEKDAYS, type Session } from '../model';
import { valid } from '../stats';
import type { ReactNode } from 'react';
import { Card } from './ui';

const WEEKS = 18;

export default function Heatmap({ sessions }: { sessions: Session[] }) {
  const volume = new Map<string, number>();
  for (const s of sessions) {
    const v = Object.values(s.sets).reduce((a, x) => a + valid(x).reduce((b, [w, r]) => b + w * r, 0), 0);
    if (v > 0) volume.set(s.date, (volume.get(s.date) ?? 0) + v);
  }
  const max = Math.max(1, ...volume.values());

  const now = new Date();
  const wd = (now.getDay() + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - wd - (WEEKS - 1) * 7);
  const today = todayISO();

  const cols = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => todayISO(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d))),
  );

  const monthLabels = cols.map((col) => {
    const first = col.find((d) => d.endsWith('-01'));
    if (!first) return '';
    const [y, m] = first.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
  });

  const total = [...volume.keys()].filter((d) => d >= cols[0][0]).length;

  const color = (d: string) => {
    if (d > today) return 'transparent';
    const v = volume.get(d);
    if (!v) return '#1e1e27';
    const t = v / max;
    return t > 0.75 ? '#C6F432' : t > 0.5 ? '#C6F432bb' : t > 0.25 ? '#C6F43277' : '#C6F43244';
  };

  return (
    <Card className="mb-5">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Активность</div>
        <div className="num text-xs text-muted">
          <span className="font-bold text-fg">{total}</span> трен. за {WEEKS} нед.
        </div>
      </div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `18px repeat(${WEEKS}, minmax(0, 1fr))` }}>
        <div />
        {cols.map((_, i) => (
          <div key={`m${i}`} className="relative h-3.5">
            <span className="absolute left-0 top-0 whitespace-nowrap text-[9px] text-muted">{monthLabels[i]}</span>
          </div>
        ))}
        {WEEKDAYS.map((w, d) => (
          <Row key={w} label={d % 2 === 0 ? w : ''}>
            {cols.map((col) => (
              <div
                key={col[d]}
                title={col[d]}
                className={`aspect-square w-full rounded-[3px] ${col[d] === today ? 'ring-1 ring-fg/60' : ''}`}
                style={{ background: color(col[d]) }}
              />
            ))}
          </Row>
        ))}
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <div className="flex items-center text-[9px] text-muted">{label}</div>
      {children}
    </>
  );
}
