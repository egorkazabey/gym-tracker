import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, Header } from '../components/ui';
import { IconCheck, IconPlus, IconTimer, IconTrash } from '../components/icons';
import { formatDate, round, sessionKey, todayISO, WEEKDAYS_FULL, type Exercise, type Session, type SetEntry } from '../model';
import { fmtW, lastSetsBefore, prevMaxWeight, sessionSummary, suggestWeight } from '../stats';
import PlateSheet from '../components/PlateSheet';
import { deleteSession, getState, upsertSession, useStore } from '../store';
import { confirmDialog, haptic, inTelegram, tg } from '../tg';

const REST_OPTIONS = [60, 90, 120, 180];
const REST_KEY = 'gym_rest_sec';
const nowSec = () => Math.floor(Date.now() / 1000);

function loadRest(): number {
  try {
    const v = Number(localStorage.getItem(REST_KEY));
    return REST_OPTIONS.includes(v) ? v : 90;
  } catch {
    return 90;
  }
}

export default function WorkoutPage({ dayId, date, onDone }: { dayId: string; date: string; onDone: () => void }) {
  const { program, sessions } = useStore();
  const day = program.days.find((d) => d.id === dayId);
  const key = sessionKey(date, dayId);
  const session = sessions.find((s) => s.key === key);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restSec, setRestSec] = useState(loadRest);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const live = date === todayISO();

  const cycleRest = () => {
    const next = REST_OPTIONS[(REST_OPTIONS.indexOf(restSec) + 1) % REST_OPTIONS.length];
    setRestSec(next);
    haptic.select();
    try {
      localStorage.setItem(REST_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  const exercises: Exercise[] = day
    ? [
        ...day.exercises.filter((e) => !e.archived),
        // archived exercises that were logged in this session still show up
        ...day.exercises.filter((e) => e.archived && session?.sets[e.id]?.length),
      ]
    : [];

  const update = (exId: string, fn: (sets: SetEntry[]) => SetEntry[]) => {
    const current: Session = getState().sessions.find((s) => s.key === key) ?? { key, date, dayId, sets: {}, done: false };
    upsertSession({
      ...current,
      start: current.start ?? (live ? nowSec() : undefined),
      sets: { ...current.sets, [exId]: fn([...(current.sets[exId] ?? [])]) },
    });
  };

  const finish = () => {
    const current = getState().sessions.find((s) => s.key === key);
    const logged = current && Object.values(current.sets).some((x) => x.some(([w, r]) => w > 0 && r > 0));
    if (current) upsertSession({ ...current, done: true, end: current.end ?? (live && current.start ? nowSec() : undefined) }, true);
    haptic.success();
    if (logged) {
      tg?.MainButton.hide();
      setRestEnd(null);
      setSummaryOpen(true);
    } else onDone();
  };
  const finishRef = useRef(finish);
  finishRef.current = summaryOpen ? () => {} : finish;

  useEffect(() => {
    if (!tg) return;
    const handler = () => finishRef.current();
    tg.MainButton.setText('Завершить тренировку');
    tg.MainButton.setParams?.({ color: '#C6F432', text_color: '#000000' });
    tg.MainButton.onClick(handler);
    tg.MainButton.show();
    return () => {
      tg!.MainButton.offClick(handler);
      tg!.MainButton.hide();
    };
  }, []);

  if (!day) return <div className="p-6 text-muted">День не найден</div>;

  const [y, m, d] = date.split('-').map(Number);
  const wd = ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;

  return (
    <div className="fade-up pb-28">
      <Header
        title={day.name}
        subtitle={`${WEEKDAYS_FULL[wd - 1]} · ${formatDate(date)}`}
        right={
          <button onClick={cycleRest} className="mb-1 flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold">
            <span className="text-accent">
              <IconTimer />
            </span>
            <span className="num">{restSec < 120 ? `${restSec}с` : `${restSec / 60}м`}</span>
          </button>
        }
      />

      <div className="space-y-3">
        {exercises.map((ex) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            date={date}
            sets={session?.sets[ex.id] ?? []}
            update={(fn) => update(ex.id, fn)}
            onSetDone={() => setRestEnd(Date.now() + restSec * 1000)}
          />
        ))}
      </div>

      {!inTelegram && (
        <Button className="mt-6 w-full" onClick={finish}>
          Завершить тренировку
        </Button>
      )}

      {session && (
        <Button
          variant="ghost"
          className="mt-3 w-full text-sm"
          onClick={async () => {
            if (await confirmDialog('Удалить эту тренировку целиком?')) {
              await deleteSession(key);
              onDone();
            }
          }}
        >
          Удалить тренировку
        </Button>
      )}

      {restEnd &&
        createPortal(<RestTimer end={restEnd} onAdd={() => setRestEnd(restEnd + 30_000)} onClose={() => setRestEnd(null)} />, document.body)}
      {summaryOpen && session && createPortal(<Summary session={session} dayName={day.name} onClose={onDone} />, document.body)}
    </div>
  );
}

function ExerciseCard({
  ex,
  date,
  sets,
  update,
  onSetDone,
}: {
  ex: Exercise;
  date: string;
  sets: SetEntry[];
  update: (fn: (s: SetEntry[]) => SetEntry[]) => void;
  onSetDone: () => void;
}) {
  const { sessions } = useStore();
  const last = lastSetsBefore(sessions, ex.id, date);
  const prevMax = prevMaxWeight(sessions, ex.id, date);
  const rows = Math.max(ex.targetSets, sets.length);
  const suggested = suggestWeight(last?.sets, ex.targetSets, ex.targetReps);
  const [platesFor, setPlatesFor] = useState<number | null>(null);

  const hint = (i: number): SetEntry | undefined => {
    if (suggested && i < ex.targetSets) return [suggested, ex.targetReps];
    if (last?.sets[i]) return last.sets[i];
    // fallback: previous row in this session, or last set from last time
    const prevRow = sets[i - 1];
    if (prevRow && prevRow[0] > 0) return prevRow;
    return last?.sets[last.sets.length - 1];
  };

  const setRow = (i: number, entry: SetEntry) =>
    update((s) => {
      while (s.length <= i) s.push([0, 0]);
      s[i] = entry;
      return s;
    });

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold">{ex.name}</div>
          {ex.note && <div className="mb-0.5 text-xs text-fg/70">📝 {ex.note}</div>}
          <div className="text-xs text-muted">
            {last
              ? `${formatDate(last.date)}: ${last.sets.map(([w, r]) => `${fmtW(w)}×${r}`).join(', ')}`
              : `План: ${ex.targetSets}×${ex.targetReps}`}
          </div>
        </div>
        {prevMax > 0 && (
          <div className="shrink-0 rounded-lg bg-card2 px-2 py-1 text-[11px] font-semibold text-muted">
            PR <span className="num text-fg">{fmtW(prevMax)}</span>
          </div>
        )}
      </div>

      {suggested && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2 text-xs">
          <span className="text-base">📈</span>
          <span className="text-fg/80">
            В прошлый раз все подходы по {ex.targetReps}+ — пора <b className="text-accent">{fmtW(suggested)} кг</b>
          </span>
        </div>
      )}

      <div className="mb-1.5 grid grid-cols-[22px_1fr_14px_64px_38px] items-center gap-2 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <span>#</span>
        <span className="text-center">Вес, кг</span>
        <span />
        <span className="text-center">Повт.</span>
        <span />
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: rows }, (_, i) => (
          <SetRow
            key={i}
            index={i}
            entry={sets[i] ?? [0, 0]}
            hint={hint(i) ?? [0, ex.targetReps]}
            pr={prevMax > 0 && (sets[i]?.[0] ?? 0) > prevMax && (sets[i]?.[1] ?? 0) > 0}
            onChange={(e) => setRow(i, e)}
            onComplete={onSetDone}
            onRemove={
              i >= ex.targetSets
                ? () =>
                    update((s) => {
                      s.splice(i, 1);
                      return s;
                    })
                : undefined
            }
          />
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => {
            haptic.tap();
            update((s) => {
              while (s.length < rows) s.push([0, 0]);
              s.push([0, 0]);
              return s;
            });
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold text-muted transition active:bg-card2"
        >
          <IconPlus size={16} /> Подход
        </button>
        {last && !sets.some(([w, r]) => w > 0 || r > 0) && (
          <button
            onClick={() => {
              haptic.medium();
              const base: SetEntry[] = suggested
                ? last.sets.map(([w, r], i) => (i < ex.targetSets ? [suggested, Math.max(r, ex.targetReps)] : [w, r]))
                : last.sets;
              update(() => base.map(([w, r]) => [w, r] as SetEntry));
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-card2 py-2 text-sm font-semibold text-fg transition active:scale-[0.97]"
          >
            ↻ {suggested ? 'С прибавкой' : 'Как в прошлый раз'}
          </button>
        )}
        <button
          onClick={() => {
            haptic.tap();
            setPlatesFor(Math.max(...sets.map(([w]) => w), 0) || hint(0)?.[0] || 60);
          }}
          className="flex items-center justify-center rounded-xl bg-card2 px-3 py-2 text-sm font-semibold text-muted transition active:scale-[0.97]"
          title="Калькулятор блинов"
        >
          🏋️
        </button>
      </div>
      {platesFor != null && createPortal(<PlateSheet initial={platesFor} onClose={() => setPlatesFor(null)} />, document.body)}
    </Card>
  );
}

function SetRow({
  index,
  entry,
  hint,
  pr,
  onChange,
  onComplete,
  onRemove,
}: {
  index: number;
  entry: SetEntry;
  hint: SetEntry;
  pr: boolean;
  onChange: (e: SetEntry) => void;
  onComplete: () => void;
  onRemove?: () => void;
}) {
  const [w, setW] = useState(entry[0] ? String(entry[0]) : '');
  const [r, setR] = useState(entry[1] ? String(entry[1]) : '');
  const done = entry[0] > 0 && entry[1] > 0;

  // sync when the stored entry changes from outside (e.g. ✓ autofill)
  useEffect(() => {
    if (Number(w.replace(',', '.')) !== entry[0]) setW(entry[0] ? String(entry[0]) : '');
    if (Number(r) !== entry[1]) setR(entry[1] ? String(entry[1]) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry[0], entry[1]]);

  const parseW = (s: string) => Math.max(0, round(Number(s.replace(',', '.')) || 0));
  const parseR = (s: string) => Math.max(0, Math.round(Number(s) || 0));

  const step = (delta: number) => {
    haptic.select();
    const base = entry[0] || hint[0] || 0;
    const nw = Math.max(0, round(base + delta));
    setW(nw ? String(nw) : '');
    onChange([nw, entry[1]]);
  };

  const complete = () => {
    if (done) {
      onChange([0, 0]);
      haptic.tap();
      return;
    }
    const nw = entry[0] || hint[0];
    const nr = entry[1] || hint[1];
    if (!nw || !nr) return;
    onChange([nw, nr]);
    haptic.medium();
    onComplete();
  };

  return (
    <div
      className={`grid grid-cols-[22px_1fr_14px_64px_38px] items-center gap-2 rounded-xl px-0.5 py-0.5 transition ${done ? 'bg-accent/[0.07]' : ''}`}
    >
      <button
        onClick={onRemove}
        className={`num text-center text-sm font-bold ${pr ? 'text-accent' : 'text-muted'}`}
        title={onRemove ? 'Удалить подход' : undefined}
      >
        {pr ? '🏆' : onRemove && !done ? <IconTrash /> : index + 1}
      </button>
      <div className="flex items-center rounded-xl bg-card2">
        <button className="h-10 w-8 shrink-0 text-lg font-bold text-muted active:text-fg" onClick={() => step(-2.5)}>
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          className="num h-10 w-full min-w-0 bg-transparent text-center text-base font-bold outline-none placeholder:text-muted/40"
          placeholder={hint[0] ? fmtW(hint[0]) : '0'}
          value={w}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.,]/g, '');
            setW(v);
            onChange([parseW(v), entry[1]]);
          }}
        />
        <button className="h-10 w-8 shrink-0 text-lg font-bold text-muted active:text-fg" onClick={() => step(2.5)}>
          +
        </button>
      </div>
      <span className="text-center text-sm text-muted">×</span>
      <input
        type="text"
        inputMode="numeric"
        className="num h-10 w-full rounded-xl bg-card2 text-center text-base font-bold outline-none placeholder:text-muted/40"
        placeholder={hint[1] ? String(hint[1]) : '0'}
        value={r}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 3);
          setR(v);
          onChange([entry[0], parseR(v)]);
        }}
      />
      <button
        onClick={complete}
        className={`flex h-10 w-[38px] items-center justify-center rounded-xl transition active:scale-90 ${
          done ? 'bg-accent text-black' : 'bg-card2 text-muted'
        }`}
      >
        <IconCheck />
      </button>
    </div>
  );
}

function RestTimer({ end, onAdd, onClose }: { end: number; onAdd: () => void; onClose: () => void }) {
  const [now, setNow] = useState(Date.now());
  const left = Math.max(0, Math.ceil((end - now) / 1000));
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [end]);

  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      tg?.HapticFeedback?.notificationOccurred('success');
      const t = setTimeout(onClose, 2500);
      return () => clearTimeout(t);
    }
  }, [left, onClose]);

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <div className="fade-up fixed inset-x-4 bottom-4 z-30 mx-auto max-w-md" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-[#1a1a22]/95 p-3 shadow-2xl backdrop-blur">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${left ? 'bg-accent/15 text-accent' : 'bg-accent text-black'}`}>
          <IconTimer />
        </div>
        <div className="flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{left ? 'Отдых' : 'Пора!'}</div>
          <div className="num text-xl font-extrabold">
            {mm}:{ss}
          </div>
        </div>
        <button onClick={onAdd} className="rounded-xl bg-card2 px-3 py-2 text-sm font-bold">
          +30с
        </button>
        <button onClick={onClose} className="rounded-xl px-2 py-2 text-sm font-semibold text-muted">
          ✕
        </button>
      </div>
    </div>
  );
}

function Summary({ session, dayName, onClose }: { session: Session; dayName: string; onClose: () => void }) {
  const { sessions, program } = useStore();
  const sum = sessionSummary(session, sessions);
  const exName = new Map(program.days.flatMap((d) => d.exercises.map((e) => [e.id, e.name] as const)));
  const diff = sum.prevVolume ? Math.round(((sum.volume - sum.prevVolume) / sum.prevVolume) * 100) : null;

  useEffect(() => {
    if (!tg) return;
    tg.MainButton.setText('Готово');
    tg.MainButton.onClick(onClose);
    tg.MainButton.show();
    return () => {
      tg!.MainButton.offClick(onClose);
      tg!.MainButton.hide();
    };
  }, [onClose]);

  return (
    <div className="fade-up fixed inset-0 z-50 overflow-y-auto bg-bg/95 px-5 backdrop-blur-xl" style={{ paddingTop: 'max(32px, env(safe-area-inset-top))' }}>
      <div className="mx-auto max-w-md pb-10">
        <div className="relative mb-6 text-center">
          <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative text-6xl">{sum.prs.length ? '🏆' : '💪'}</div>
          <div className="relative mt-3 text-[13px] font-semibold uppercase tracking-wider text-accent">Тренировка завершена</div>
          <div className="relative mt-1 text-2xl font-extrabold">{dayName}</div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <Big label="Объём" value={sum.volume.toLocaleString('ru-RU')} unit="кг" />
          <Big label="Подходов" value={String(sum.sets)} />
          <Big label="Упражнений" value={String(sum.exercises)} />
          <Big label="Время" value={sum.durationMin != null ? String(sum.durationMin) : '—'} unit={sum.durationMin != null ? 'мин' : undefined} />
        </div>

        {diff != null && (
          <Card className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted">Объём к прошлому разу</span>
            <span className={`num font-extrabold ${diff >= 0 ? 'text-accent' : 'text-danger'}`}>
              {diff >= 0 ? '+' : ''}
              {diff}%
            </span>
          </Card>
        )}

        {sum.prs.length > 0 && (
          <Card className="mb-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Новые рекорды</div>
            {sum.prs.map((p) => (
              <div key={p.exId} className="flex items-center justify-between py-1.5">
                <span className="font-semibold">{exName.get(p.exId)}</span>
                <span className="num text-sm">
                  <span className="text-muted line-through">{fmtW(p.prev)}</span>{' '}
                  <span className="font-extrabold text-accent">
                    {fmtW(p.weight)}×{p.reps}
                  </span>
                </span>
              </div>
            ))}
          </Card>
        )}

        {!inTelegram && (
          <Button className="mt-3 w-full" onClick={onClose}>
            Готово
          </Button>
        )}
      </div>
    </div>
  );
}

function Big({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="num mt-1 text-2xl font-extrabold">
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-muted">{unit}</span>}
      </div>
    </div>
  );
}
