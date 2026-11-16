import { useState } from 'react';
import { Button, Card, Empty, Header } from '../components/ui';
import { IconCheck, IconChevron } from '../components/icons';
import { formatDate, sessionKey, todayISO, weekdayOf, WEEKDAYS, WEEKDAYS_FULL, type Day } from '../model';
import { fmtW, valid } from '../stats';
import { useStore } from '../store';
import { haptic, tg } from '../tg';

const fromISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
};

export default function TodayPage({
  onStart,
  goProgram,
  selected,
  onSelect,
}: {
  onStart: (dayId: string, date: string) => void;
  goProgram: () => void;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const { program, sessions } = useStore();
  const today = todayISO();
  const isToday = selected === today;
  const wd = weekdayOf(fromISO(selected));
  const days = [...program.days].sort((a, b) => a.weekday - b.weekday);
  const name = tg?.initDataUnsafe?.user?.first_name;

  const [weekStart, setWeekStart] = useState(() => addDays(selected, -(wd - 1)));
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const trainedDates = new Set(sessions.filter((s) => Object.values(s.sets).some((x) => valid(x).length)).map((s) => s.date));
  const plannedWd = new Set(days.map((d) => d.weekday));
  const weekCount = weekDates.filter((d) => trainedDates.has(d)).length;

  // workouts planned for this weekday + anything actually logged on this date
  const loggedDayIds = sessions.filter((s) => s.date === selected && Object.values(s.sets).some((x) => valid(x).length)).map((s) => s.dayId);
  const featured = days.filter((d) => d.weekday === wd || loggedDayIds.includes(d.id));
  const others = days.filter((d) => !featured.includes(d));
  const next = days.find((d) => d.weekday > wd) ?? days[0];

  const shiftWeek = (n: number) => {
    haptic.select();
    const ws = addDays(weekStart, n * 7);
    setWeekStart(ws);
    onSelect(addDays(ws, wd - 1));
  };

  const weekLabel = (() => {
    const a = fromISO(weekDates[0]);
    const b = fromISO(weekDates[6]);
    const fmt = (d: Date, month: boolean) => d.toLocaleDateString('ru-RU', month ? { day: 'numeric', month: 'short' } : { day: 'numeric' });
    return a.getMonth() === b.getMonth() ? `${fmt(a, false)}–${fmt(b, true)}` : `${fmt(a, true)} – ${fmt(b, true)}`;
  })();

  if (!days.length) {
    return (
      <div className="fade-up">
        <Header title={name ? `Привет, ${name}` : 'Привет!'} subtitle={WEEKDAYS_FULL[weekdayOf() - 1]} />
        <Empty
          icon="🏋️"
          title="Настрой свою программу"
          text="Создай тренировочные дни недели и добавь упражнения — дальше всё будет повторяться каждую неделю."
          action={<Button onClick={goProgram}>Создать программу</Button>}
        />
      </div>
    );
  }

  return (
    <div className="fade-up">
      <Header
        title={isToday ? (name ? `Привет, ${name}` : 'Сегодня') : formatDate(selected, fromISO(selected).getFullYear() !== new Date().getFullYear())}
        subtitle={isToday ? WEEKDAYS_FULL[wd - 1] : `${WEEKDAYS_FULL[wd - 1]}${selected > today ? ' · впереди' : ''}`}
        right={
          !isToday && (
            <button
              onClick={() => {
                haptic.select();
                setWeekStart(addDays(today, -(weekdayOf() - 1)));
                onSelect(today);
              }}
              className="mb-1 rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold text-accent"
            >
              Сегодня
            </button>
          )
        }
      />

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => shiftWeek(-1)} className="-ml-1 rounded-lg p-1.5 text-muted active:bg-card2">
            <IconChevron dir="left" />
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold">{weekLabel}</div>
            <div className="num text-xs text-muted">
              <span className="text-accent">{weekCount}</span> / {days.length} тренировок
            </div>
          </div>
          <button onClick={() => shiftWeek(1)} className="-mr-1 rounded-lg p-1.5 text-muted active:bg-card2">
            <IconChevron />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map((d, i) => {
            const done = trainedDates.has(d);
            const planned = plannedWd.has(i + 1);
            const sel = d === selected;
            return (
              <button
                key={d}
                onClick={() => {
                  haptic.select();
                  onSelect(d);
                }}
                className="flex flex-col items-center gap-1.5"
              >
                <div className={`text-[11px] font-semibold ${d === today ? 'text-accent' : sel ? 'text-fg' : 'text-muted'}`}>{WEEKDAYS[i]}</div>
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold transition ${
                    sel ? 'ring-2 ring-fg ring-offset-2 ring-offset-card' : ''
                  } ${
                    done
                      ? 'bg-accent text-black'
                      : planned
                        ? 'border border-dashed border-muted/50 text-fg'
                        : 'bg-card2/50 text-muted/50'
                  }`}
                >
                  {done ? <IconCheck /> : Number(d.slice(8))}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {featured.length ? (
        featured.map((d) => <DayHero key={d.id} day={d} date={selected} isToday={isToday} onStart={onStart} goProgram={goProgram} />)
      ) : (
        <Card className="mb-4 text-center">
          <div className="text-3xl">😴</div>
          <div className="mt-2 font-bold">{isToday ? 'Сегодня день отдыха' : 'День отдыха'}</div>
          {next && (
            <div className="mt-1 text-sm text-muted">
              Следующая по плану: {next.name} · {WEEKDAYS_FULL[next.weekday - 1].toLowerCase()}
            </div>
          )}
        </Card>
      )}

      {others.length > 0 && (
        <>
          <div className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted">
            {featured.length ? 'Другая тренировка в этот день' : 'Провести тренировку в этот день'}
          </div>
          <div className="space-y-2">
            {others.map((d) => (
              <Card key={d.id} onClick={() => onStart(d.id, selected)} className="flex items-center gap-3 !py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card2 text-xs font-extrabold text-muted">
                  {WEEKDAYS[d.weekday - 1]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{d.name}</div>
                  <div className="text-xs text-muted">{d.exercises.filter((e) => !e.archived).length} упражнений</div>
                </div>
                <span className="text-muted">
                  <IconChevron />
                </span>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DayHero({
  day,
  date,
  isToday,
  onStart,
  goProgram,
}: {
  day: Day;
  date: string;
  isToday: boolean;
  onStart: (dayId: string, date: string) => void;
  goProgram: () => void;
}) {
  const { sessions } = useStore();
  const session = sessions.find((s) => s.key === sessionKey(date, day.id));
  const exercises = day.exercises.filter((e) => !e.archived);
  const doneCount = session ? exercises.filter((e) => valid(session.sets[e.id]).length).length : 0;
  const logged = session && Object.values(session.sets).some((x) => valid(x).length);
  const past = date < todayISO();

  const label = !exercises.length
    ? 'Добавить упражнения'
    : logged
      ? session!.done || past
        ? 'Открыть / изменить'
        : 'Продолжить'
      : past
        ? 'Записать тренировку'
        : 'Начать тренировку';

  return (
    <div className="relative mb-4 overflow-hidden rounded-[24px] border border-accent/30 bg-gradient-to-br from-[#1c2410] via-card to-card p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
      <div className="text-xs font-bold uppercase tracking-wider text-accent">
        {logged ? (isToday ? 'Тренировка дня' : 'Проведена') : isToday ? 'Тренировка дня' : 'По плану'}
      </div>
      <div className="mt-1 text-2xl font-extrabold">{day.name}</div>

      {logged ? (
        <div className="mt-3 space-y-1.5">
          {[...exercises, ...day.exercises.filter((e) => e.archived)]
            .filter((e) => valid(session!.sets[e.id]).length)
            .map((e) => (
              <div key={e.id} className="flex gap-3 text-sm">
                <div className="w-2/5 shrink-0 truncate text-fg/70">{e.name}</div>
                <div className="num flex flex-wrap gap-x-2 font-semibold">
                  {valid(session!.sets[e.id]).map(([w, r], i) => (
                    <span key={i}>
                      {fmtW(w)}×{r}
                    </span>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {exercises.map((e) => (
            <span key={e.id} className="rounded-full bg-black/30 px-2.5 py-1 text-xs font-semibold text-fg/80">
              {e.name}
            </span>
          ))}
          {!exercises.length && <span className="text-sm text-muted">В этом дне пока нет упражнений</span>}
        </div>
      )}

      {logged && exercises.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Упражнений выполнено</span>
            <span className="num">
              {doneCount}/{exercises.length}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / exercises.length) * 100}%` }} />
          </div>
        </div>
      )}
      <Button className="mt-5 w-full" onClick={() => (exercises.length ? onStart(day.id, date) : goProgram())}>
        {label}
      </Button>
    </div>
  );
}
