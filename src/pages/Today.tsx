import { Button, Card, Empty, Header } from '../components/ui';
import { IconCheck, IconChevron } from '../components/icons';
import { sessionKey, todayISO, weekdayOf, WEEKDAYS, WEEKDAYS_FULL, type Day } from '../model';
import { useStore } from '../store';
import { tg } from '../tg';

export default function TodayPage({
  onStart,
  goProgram,
}: {
  onStart: (dayId: string, date: string) => void;
  goProgram: () => void;
}) {
  const { program, sessions } = useStore();
  const today = todayISO();
  const wd = weekdayOf();
  const days = [...program.days].sort((a, b) => a.weekday - b.weekday);
  const todays = days.filter((d) => d.weekday === wd);
  const next = days.find((d) => d.weekday > wd) ?? days[0];
  const name = tg?.initDataUnsafe?.user?.first_name;

  // Monday of current week
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (wd - 1));
  const weekDates = Array.from({ length: 7 }, (_, i) => todayISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  const trainedDates = new Set(sessions.filter((s) => Object.values(s.sets).some((x) => x.some(([w, r]) => w > 0 || r > 0))).map((s) => s.date));
  const plannedWd = new Set(days.map((d) => d.weekday));
  const weekCount = weekDates.filter((d) => trainedDates.has(d)).length;

  if (!days.length) {
    return (
      <div className="fade-up">
        <Header title={name ? `Привет, ${name}` : 'Привет!'} subtitle={WEEKDAYS_FULL[wd - 1]} />
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
      <Header title={name ? `Привет, ${name}` : 'Сегодня'} subtitle={WEEKDAYS_FULL[wd - 1]} />

      <Card className="mb-4">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="text-sm font-semibold text-muted">Эта неделя</div>
          <div className="num text-sm font-bold">
            <span className="text-accent">{weekCount}</span>
            <span className="text-muted"> / {days.length}</span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map((d, i) => {
            const done = trainedDates.has(d);
            const planned = plannedWd.has(i + 1);
            const isToday = d === today;
            return (
              <div key={d} className="flex flex-col items-center gap-1.5">
                <div className={`text-[11px] font-semibold ${isToday ? 'text-fg' : 'text-muted'}`}>{WEEKDAYS[i]}</div>
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold ${
                    done
                      ? 'bg-accent text-black'
                      : planned
                        ? `border border-dashed ${isToday ? 'border-accent text-accent' : 'border-line text-muted'}`
                        : 'bg-card2/50 text-muted/40'
                  }`}
                >
                  {done ? <IconCheck /> : Number(d.slice(8))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {todays.length ? (
        todays.map((d) => <DayHero key={d.id} day={d} date={today} onStart={onStart} />)
      ) : (
        <Card className="mb-4 text-center">
          <div className="text-3xl">😴</div>
          <div className="mt-2 font-bold">Сегодня день отдыха</div>
          {next && (
            <div className="mt-1 text-sm text-muted">
              Следующая: {next.name} · {WEEKDAYS_FULL[next.weekday - 1].toLowerCase()}
            </div>
          )}
        </Card>
      )}

      <div className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted">
        {todays.length ? 'Другие дни' : 'Начать любую тренировку'}
      </div>
      <div className="space-y-2">
        {days
          .filter((d) => !todays.includes(d))
          .map((d) => {
            const started = sessions.some((s) => s.key === sessionKey(today, d.id));
            return (
              <Card key={d.id} onClick={() => onStart(d.id, today)} className="flex items-center gap-3 !py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-card2 text-xs font-extrabold text-muted">
                  {WEEKDAYS[d.weekday - 1]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{d.name}</div>
                  <div className="text-xs text-muted">
                    {started ? 'Начата сегодня' : `${d.exercises.filter((e) => !e.archived).length} упражнений`}
                  </div>
                </div>
                <span className="text-muted">
                  <IconChevron />
                </span>
              </Card>
            );
          })}
      </div>
    </div>
  );
}

function DayHero({ day, date, onStart }: { day: Day; date: string; onStart: (dayId: string, date: string) => void }) {
  const { sessions } = useStore();
  const session = sessions.find((s) => s.key === sessionKey(date, day.id));
  const exercises = day.exercises.filter((e) => !e.archived);
  const doneCount = session ? exercises.filter((e) => (session.sets[e.id] ?? []).some(([w, r]) => w > 0 && r > 0)).length : 0;

  return (
    <div className="relative mb-4 overflow-hidden rounded-[24px] border border-accent/30 bg-gradient-to-br from-[#1c2410] via-card to-card p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
      <div className="text-xs font-bold uppercase tracking-wider text-accent">Тренировка дня</div>
      <div className="mt-1 text-2xl font-extrabold">{day.name}</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {exercises.map((e) => (
          <span key={e.id} className="rounded-full bg-black/30 px-2.5 py-1 text-xs font-semibold text-fg/80">
            {e.name}
          </span>
        ))}
        {!exercises.length && <span className="text-sm text-muted">Добавь упражнения в «Программе»</span>}
      </div>
      {session && exercises.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{session.done ? 'Завершена' : 'В процессе'}</span>
            <span className="num">
              {doneCount}/{exercises.length}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / exercises.length) * 100}%` }} />
          </div>
        </div>
      )}
      <Button className="mt-5 w-full" disabled={!exercises.length} onClick={() => onStart(day.id, date)}>
        {session ? (session.done ? 'Открыть тренировку' : 'Продолжить') : 'Начать тренировку'}
      </Button>
    </div>
  );
}
