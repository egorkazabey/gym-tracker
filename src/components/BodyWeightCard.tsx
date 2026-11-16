import { useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate, round, todayISO } from '../model';
import { fmtW } from '../stats';
import { setBodyweight, useStore } from '../store';
import { haptic } from '../tg';
import { Button, Card } from './ui';

export default function BodyWeightCard() {
  const { bodyweight } = useStore();
  const today = todayISO();
  const latest = bodyweight[bodyweight.length - 1];
  const todayEntry = bodyweight.find((b) => b.date === today);
  const [value, setValue] = useState(() => (todayEntry ?? latest)?.kg.toString() ?? '');
  const [editing, setEditing] = useState(false);

  const monthAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return todayISO(d);
  })();
  const base = [...bodyweight].reverse().find((b) => b.date <= monthAgo) ?? bodyweight[0];
  const delta = latest && base && base !== latest ? round(latest.kg - base.kg) : null;

  const num = Number(value.replace(',', '.'));
  const valid = num >= 20 && num <= 400;

  const step = (d: number) => {
    haptic.select();
    const n = round((valid ? num : latest?.kg ?? 70) + d);
    setValue(String(n));
  };

  const save = () => {
    if (!valid) return;
    setBodyweight(today, round(num));
    setEditing(false);
    haptic.success();
  };

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Вес тела</div>
          {latest ? (
            <div className="num mt-1 text-3xl font-extrabold">
              {fmtW(latest.kg)}
              <span className="ml-1 text-base font-semibold text-muted">кг</span>
            </div>
          ) : (
            <div className="mt-1 text-sm text-muted">Записывай вес, чтобы видеть динамику</div>
          )}
          {latest && (
            <div className="text-xs text-muted">
              {latest.date === today ? 'сегодня' : formatDate(latest.date)}
              {delta != null && (
                <span className={`ml-2 font-bold ${delta > 0 ? 'text-accent' : delta < 0 ? 'text-[#6cb4ff]' : 'text-muted'}`}>
                  {delta > 0 ? '+' : ''}
                  {fmtW(delta)} кг за {base.date <= monthAgo ? 'месяц' : 'период'}
                </span>
              )}
            </div>
          )}
        </div>
        {!editing && (
          <Button variant="soft" className="!px-3 !py-2 text-sm" onClick={() => setEditing(true)}>
            {todayEntry ? 'Изменить' : '+ Сегодня'}
          </Button>
        )}
      </div>

      {editing && (
        <div className="fade-up mt-3 flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-xl bg-card2">
            <button className="h-11 w-10 text-lg font-bold text-muted" onClick={() => step(-0.1)}>
              −
            </button>
            <input
              autoFocus
              inputMode="decimal"
              className="num h-11 w-full min-w-0 bg-transparent text-center text-lg font-bold outline-none"
              value={value}
              placeholder="кг"
              onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
            <button className="h-11 w-10 text-lg font-bold text-muted" onClick={() => step(0.1)}>
              +
            </button>
          </div>
          <Button className="!py-2.5" disabled={!valid} onClick={save}>
            Записать
          </Button>
        </div>
      )}

      {bodyweight.length > 1 && (
        <div className="-ml-3 mt-3 h-24">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={bodyweight.slice(-60).map((b) => ({ date: formatDate(b.date), kg: b.kg }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="bwfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6cb4ff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6cb4ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip
                contentStyle={{ background: '#1E1E27', border: '1px solid #26262F', borderRadius: 12, color: '#F2F2F5' }}
                labelStyle={{ color: '#8A8A99' }}
                formatter={(v: number) => [`${fmtW(v)} кг`, '']}
                separator=""
              />
              <Area type="monotone" dataKey="kg" stroke="#6cb4ff" strokeWidth={2} fill="url(#bwfill)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
