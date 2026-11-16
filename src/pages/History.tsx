import { useState } from 'react';
import { Card, Empty, Header } from '../components/ui';
import { IconChevron } from '../components/icons';
import { formatDate } from '../model';
import { fmtW, valid } from '../stats';
import { useStore } from '../store';

export default function HistoryPage({ onOpen }: { onOpen: (dayId: string, date: string) => void }) {
  const { program, sessions } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const exName = new Map(program.days.flatMap((d) => d.exercises.map((e) => [e.id, e.name] as const)));
  const dayName = new Map(program.days.map((d) => [d.id, d.name]));

  const list = sessions.filter((s) => Object.values(s.sets).some((x) => valid(x).length));

  // group by month
  const groups = new Map<string, typeof list>();
  for (const s of list) {
    const k = s.date.slice(0, 7);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  if (!list.length) {
    return (
      <div className="fade-up">
        <Header title="История" subtitle="Тренировки" />
        <Empty icon="📅" title="Пока нет тренировок" text="Здесь будут все проведённые тренировки с подходами и весами." />
      </div>
    );
  }

  return (
    <div className="fade-up">
      <Header title="История" subtitle={`${list.length} тренировок`} />
      {[...groups.entries()].map(([month, items]) => {
        const [y, m] = month.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        return (
          <div key={month} className="mb-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{label}</div>
            <div className="space-y-2">
              {items.map((s) => {
                const entries = Object.entries(s.sets).filter(([, x]) => valid(x).length);
                const totalSets = entries.reduce((a, [, x]) => a + valid(x).length, 0);
                const volume = entries.reduce((a, [, x]) => a + valid(x).reduce((b, [w, r]) => b + w * r, 0), 0);
                const isOpen = open === s.key;
                return (
                  <Card key={s.key} className="!p-0">
                    <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(isOpen ? null : s.key)}>
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-card2">
                        <div className="num text-base font-extrabold leading-none">{Number(s.date.slice(8))}</div>
                        <div className="text-[10px] font-semibold text-muted">{formatDate(s.date).split(' ')[1]}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{dayName.get(s.dayId) ?? 'Тренировка'}</div>
                        <div className="num text-xs text-muted">
                          {entries.length} упр. · {totalSets} подх. · {Math.round(volume).toLocaleString('ru-RU')} кг
                        </div>
                      </div>
                      <span className="text-muted">
                        <IconChevron dir={isOpen ? 'up' : 'down'} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="fade-up border-t border-line px-4 pb-4 pt-2">
                        {entries.map(([id, x]) => (
                          <div key={id} className="flex gap-3 py-1.5 text-sm">
                            <div className="w-2/5 shrink-0 truncate text-muted">{exName.get(id) ?? 'Упражнение'}</div>
                            <div className="num flex flex-wrap gap-x-2">
                              {valid(x).map(([w, r], i) => (
                                <span key={i}>
                                  {fmtW(w)}×{r}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                        {dayName.has(s.dayId) && (
                          <button onClick={() => onOpen(s.dayId, s.date)} className="mt-2 text-sm font-semibold text-accent">
                            Редактировать →
                          </button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
