import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Chip, Empty, Header, Input, Stat } from '../components/ui';
import { formatDate, todayISO, WEEKDAYS } from '../model';
import { exerciseHistory, fmtW, records, sessionSummary, streakWeeks, valid, weeklyVolume, type ExercisePoint } from '../stats';
import { useStore } from '../store';
import BodyWeightCard from '../components/BodyWeightCard';

type Metric = 'maxWeight' | 'best1rm' | 'volume';
const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: 'maxWeight', label: 'Макс. вес', unit: 'кг' },
  { id: 'best1rm', label: '1ПМ', unit: 'кг' },
  { id: 'volume', label: 'Объём', unit: 'кг' },
];

export default function StatsPage() {
  const { program, sessions } = useStore();
  const [view, setView] = useState<'overview' | 'exercises'>('overview');

  const days = useMemo(() => [...program.days].sort((a, b) => a.weekday - b.weekday), [program]);

  const allExercises = useMemo(() => {
    const all = days.flatMap((d) => d.exercises.map((e) => ({ ...e, dayId: d.id, dayName: d.name, weekday: d.weekday })));
    const logged = new Set(sessions.flatMap((s) => Object.keys(s.sets)));
    return all.filter((e) => !e.archived || logged.has(e.id));
  }, [days, sessions]);

  const [dayFilter, setDayFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const exercises = allExercises.filter(
    (e) => (dayFilter === 'all' || e.dayId === dayFilter) && e.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const [exId, setExId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('maxWeight');
  const selected = exercises.find((e) => e.id === exId) ?? exercises[0];

  const history = useMemo(() => (selected ? exerciseHistory(sessions, selected.id) : []), [sessions, selected]);
  const rec = records(history);
  const last = history[history.length - 1];
  const first = history[0];
  const delta = last && first && history.length > 1 ? last.maxWeight - first.maxWeight : 0;


  const m = METRICS.find((x) => x.id === metric)!;

  const toggle = (
    <div className="mb-4 flex gap-1 rounded-2xl border border-line bg-card p-1">
      {(
        [
          ['overview', 'Обзор'],
          ['exercises', 'Упражнения'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          onClick={() => setView(id)}
          className={`flex-1 rounded-xl py-2 text-sm font-bold transition ${view === id ? 'bg-accent text-black' : 'text-muted'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (view === 'overview') {
    return (
      <div className="fade-up">
        <Header title="Статистика" subtitle="Прогресс" />
        {toggle}
        <Overview />
      </div>
    );
  }

  return (
    <div className="fade-up">
      <Header title="Статистика" subtitle="Прогресс" />
      {toggle}

      <div className="relative mb-3">
        <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <Input className="!pl-9" placeholder="Найти упражнение" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 text-muted">
            ✕
          </button>
        )}
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Тренировочный день</div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Chip active={dayFilter === 'all'} onClick={() => setDayFilter('all')}>
          Все
        </Chip>
        {days.map((d) => (
          <Chip key={d.id} active={dayFilter === d.id} onClick={() => setDayFilter(d.id)}>
            <span className="opacity-60">{WEEKDAYS[d.weekday - 1]}</span> {d.name}
          </Chip>
        ))}
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Упражнение <span className="normal-case tracking-normal">· {exercises.length}</span>
      </div>
      {exercises.length ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {exercises.map((e) => (
            <Chip key={e.id} active={selected?.id === e.id} onClick={() => setExId(e.id)}>
              {e.name}
            </Chip>
          ))}
        </div>
      ) : (
        <div className="mb-4 rounded-2xl border border-dashed border-line py-6 text-center text-sm text-muted">Ничего не найдено</div>
      )}

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

function Overview() {
  const { sessions, program } = useStore();
  const today = todayISO();
  const logged = sessions.filter((s) => Object.values(s.sets).some((x) => valid(x).length));
  const streak = streakWeeks(sessions, today);
  const weeks = weeklyVolume(sessions, today, 12);
  const month = today.slice(0, 7);
  const monthCount = logged.filter((s) => s.date.startsWith(month)).length;
  const totalVolume = logged.reduce((a, s) => a + sessionSummary(s, []).volume, 0);
  const exName = new Map(program.days.flatMap((d) => d.exercises.map((e) => [e.id, e.name] as const)));

  const recentPRs = useMemo(
    () =>
      logged
        .slice(0, 40)
        .flatMap((s) => sessionSummary(s, sessions).prs.map((p) => ({ ...p, date: s.date })))
        .slice(0, 6),
    [logged, sessions],
  );

  if (!logged.length) {
    return (
      <div className="space-y-3">
        <BodyWeightCard />
        <Empty icon="🔥" title="Начни первую тренировку" text="После первой записанной тренировки здесь появятся стрик, объём по неделям и рекорды." />
      </div>
    );
  }

  const fmtTons = (kg: number) => (kg >= 10000 ? `${(kg / 1000).toFixed(1)}` : kg.toLocaleString('ru-RU'));

  return (
    <div className="fade-up space-y-3">
      <div className="relative overflow-hidden rounded-[24px] border border-accent/30 bg-gradient-to-br from-[#1c2410] via-card to-card p-5">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/20 blur-3xl" />
        <div className="flex items-center gap-4">
          <div className="text-5xl">{streak ? '🔥' : '🧊'}</div>
          <div>
            <div className="num text-4xl font-extrabold leading-none">
              {streak}
              <span className="ml-1.5 text-base font-semibold text-muted">{plural(streak, 'неделя', 'недели', 'недель')}</span>
            </div>
            <div className="mt-1 text-sm text-muted">{streak ? 'подряд с тренировками — не сбавляй!' : 'Потренируйся на этой неделе, чтобы начать стрик'}</div>
          </div>
        </div>
      </div>

      <BodyWeightCard />

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Всего" value={logged.length} />
        <Stat label="В месяце" value={monthCount} />
        <Stat label="Поднято" value={fmtTons(totalVolume)} unit={totalVolume >= 10000 ? 'т' : 'кг'} />
      </div>

      <Card>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Объём по неделям</div>
        <div className="text-sm text-muted">
          Эта неделя: <span className="num font-bold text-fg">{weeks[weeks.length - 1].volume.toLocaleString('ru-RU')} кг</span>
        </div>
        <div className="-ml-3 mt-3 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks.map((w) => ({ ...w, label: formatDate(w.week) }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#26262F" strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#8A8A99', fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
              <YAxis
                tick={{ fill: '#8A8A99', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}т` : String(v))}
              />
              <Tooltip
                cursor={{ fill: '#ffffff08' }}
                contentStyle={{ background: '#1E1E27', border: '1px solid #26262F', borderRadius: 12, color: '#F2F2F5' }}
                labelStyle={{ color: '#8A8A99' }}
                formatter={(v: number, _n, item) => [`${v.toLocaleString('ru-RU')} кг · ${item.payload.workouts} трен.`, '']}
                separator=""
              />
              <Bar dataKey="volume" radius={[6, 6, 2, 2]}>
                {weeks.map((w, i) => (
                  <Cell key={w.week} fill={i === weeks.length - 1 ? '#C6F432' : '#C6F43255'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {recentPRs.length > 0 && (
        <Card className="!p-0">
          <div className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">Последние рекорды 🏆</div>
          {recentPRs.map((p) => (
            <div key={`${p.date}-${p.exId}`} className="flex items-center gap-3 border-t border-line px-4 py-3">
              <div className="w-14 shrink-0 text-sm text-muted">{formatDate(p.date)}</div>
              <div className="min-w-0 flex-1 truncate font-semibold">{exName.get(p.exId) ?? 'Упражнение'}</div>
              <div className="num text-sm">
                <span className="font-extrabold text-accent">{fmtW(p.weight)}</span>
                <span className="text-muted">×{p.reps}</span>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
