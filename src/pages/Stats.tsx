import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Chip, Empty, Header, Stat } from '../components/ui';
import { formatDate } from '../model';
import { exerciseHistory, fmtW, records, type ExercisePoint } from '../stats';
import { useStore } from '../store';

type Metric = 'maxWeight' | 'best1rm' | 'volume';
const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: 'maxWeight', label: 'Макс. вес', unit: 'кг' },
  { id: 'best1rm', label: '1ПМ', unit: 'кг' },
  { id: 'volume', label: 'Объём', unit: 'кг' },
];

export default function StatsPage() {
  const { program, sessions } = useStore();

  const exercises = useMemo(() => {
    const all = program.days.flatMap((d) => d.exercises.map((e) => ({ ...e, dayName: d.name })));
    const logged = new Set(sessions.flatMap((s) => Object.keys(s.sets)));
    return all.filter((e) => !e.archived || logged.has(e.id));
  }, [program, sessions]);

  const [exId, setExId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('maxWeight');
  const selected = exercises.find((e) => e.id === exId) ?? exercises[0];

  const history = useMemo(() => (selected ? exerciseHistory(sessions, selected.id) : []), [sessions, selected]);
  const rec = records(history);
  const last = history[history.length - 1];
  const first = history[0];
  const delta = last && first && history.length > 1 ? last.maxWeight - first.maxWeight : 0;

  if (!exercises.length) {
    return (
      <div className="fade-up">
        <Header title="Статистика" subtitle="Прогресс" />
        <Empty icon="📈" title="Нет данных" text="Добавь упражнения в программу и проведи первую тренировку — здесь появятся графики." />
      </div>
    );
  }

  const m = METRICS.find((x) => x.id === metric)!;

  return (
    <div className="fade-up">
      <Header title="Статистика" subtitle="Прогресс" />

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {exercises.map((e) => (
          <Chip key={e.id} active={selected?.id === e.id} onClick={() => setExId(e.id)}>
            {e.name}
          </Chip>
        ))}
      </div>

      {selected && (
        <>
          <Card className="mb-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">{selected.dayName}</div>
                <div className="text-lg font-extrabold">{selected.name}</div>
              </div>
              {history.length > 1 && (
                <div className={`rounded-lg px-2 py-1 text-sm font-bold ${delta >= 0 ? 'bg-accent/15 text-accent' : 'bg-danger/15 text-danger'}`}>
                  {delta >= 0 ? '+' : ''}
                  {fmtW(delta)} кг
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-1 rounded-xl bg-card2 p-1">
              {METRICS.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setMetric(x.id)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${metric === x.id ? 'bg-bg text-fg' : 'text-muted'}`}
                >
                  {x.label}
                </button>
              ))}
            </div>

            {history.length ? <Chart data={history} metric={metric} unit={m.unit} /> : (
              <div className="py-12 text-center text-sm text-muted">Ещё нет записей по этому упражнению</div>
            )}
          </Card>

          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat label="Рекорд" value={fmtW(rec.maxWeight)} unit="кг" />
            <Stat label="1ПМ" value={fmtW(rec.best1rm)} unit="кг" />
            <Stat label="Трен." value={rec.sessions} />
          </div>

          {history.length > 0 && (
            <Card className="!p-0">
              <div className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">Последние тренировки</div>
              {[...history].reverse().slice(0, 12).map((h) => (
                <div key={h.date} className="flex items-center gap-3 border-t border-line px-4 py-3">
                  <div className="w-16 shrink-0 text-sm text-muted">{formatDate(h.date)}</div>
                  <div className="num flex flex-1 flex-wrap gap-x-2 gap-y-0.5 text-sm">
                    {h.sets.map(([w, r], i) => (
                      <span key={i} className={w === rec.maxWeight ? 'font-bold text-accent' : ''}>
                        {fmtW(w)}×{r}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Chart({ data, metric, unit }: { data: ExercisePoint[]; metric: Metric; unit: string }) {
  const rows = data.map((d) => ({ date: formatDate(d.date), value: d[metric] }));
  return (
    <div className="-ml-3 mt-4 h-52">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C6F432" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#C6F432" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#26262F" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#8A8A99', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis
            tick={{ fill: '#8A8A99', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
            domain={['dataMin - 5', 'dataMax + 5']}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: '#C6F432', strokeOpacity: 0.3 }}
            contentStyle={{ background: '#1E1E27', border: '1px solid #26262F', borderRadius: 12, color: '#F2F2F5' }}
            labelStyle={{ color: '#8A8A99' }}
            formatter={(v: number) => [`${fmtW(v)} ${unit}`, '']}
            separator=""
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#C6F432"
            strokeWidth={2.5}
            fill="url(#fill)"
            dot={{ r: 3, fill: '#0B0B0F', stroke: '#C6F432', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: '#C6F432' }}
            isAnimationActive
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
