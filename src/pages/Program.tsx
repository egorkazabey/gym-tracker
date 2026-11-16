import { useState } from 'react';
import { Button, Card, Empty, Header, Input } from '../components/ui';
import { IconChevron, IconPlus, IconTrash } from '../components/icons';
import { WEEKDAYS, WEEKDAYS_FULL, type Day, type Exercise } from '../model';
import { exportJSON, importJSON, storageLimit, updateProgram, useStore } from '../store';
import { confirmDialog, haptic, inTelegram } from '../tg';

export default function ProgramPage() {
  const { program } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const days = [...program.days].sort((a, b) => a.weekday - b.weekday);
  const used = new Set(program.days.map((d) => d.weekday));

  const addDay = () => {
    const free = [1, 3, 5, 2, 4, 6, 7].find((w) => !used.has(w)) ?? 1;
    let created = '';
    updateProgram((p, id) => {
      created = id('d');
      p.days.push({ id: created, name: `Тренировка ${p.days.length + 1}`, weekday: free, exercises: [] });
      return p;
    });
    setOpen(created);
    haptic.success();
  };

  return (
    <div className="fade-up">
      <Header title="Программа" subtitle="Неделя" />

      {days.length === 0 ? (
        <Empty
          icon="🗓️"
          title="Пока пусто"
          text="Добавь тренировочные дни — например, 3–4 в неделю — и упражнения в каждый."
          action={<Button onClick={addDay}>Добавить день</Button>}
        />
      ) : (
        <div className="space-y-3">
          {days.map((d) => (
            <DayEditor key={d.id} day={d} open={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)} />
          ))}
          <Button variant="soft" className="flex w-full items-center justify-center gap-2" onClick={addDay}>
            <IconPlus /> Добавить день
          </Button>
        </div>
      )}

      <Backup />
    </div>
  );
}

function DayEditor({ day, open, onToggle }: { day: Day; open: boolean; onToggle: () => void }) {
  const active = day.exercises.filter((e) => !e.archived);
  const patchDay = (fn: (d: Day) => void) =>
    updateProgram((p) => {
      const d = p.days.find((x) => x.id === day.id);
      if (d) fn(d);
      return p;
    });

  const removeDay = async () => {
    if (!(await confirmDialog(`Удалить день «${day.name}»? История тренировок сохранится.`))) return;
    updateProgram((p) => ({ ...p, days: p.days.filter((d) => d.id !== day.id) }));
  };

  return (
    <Card className="!p-0 overflow-hidden">
      <button className="flex w-full items-center gap-3 p-4 text-left" onClick={onToggle}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-sm font-extrabold text-accent">
          {WEEKDAYS[day.weekday - 1]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{day.name}</div>
          <div className="text-sm text-muted">
            {active.length ? `${active.length} упр. · ${active.map((e) => e.name).join(', ')}` : 'Нет упражнений'}
          </div>
        </div>
        <span className="text-muted">
          <IconChevron dir={open ? 'up' : 'down'} />
        </span>
      </button>

      {open && (
        <div className="fade-up space-y-4 border-t border-line p-4">
          <Input value={day.name} placeholder="Название" onChange={(e) => patchDay((d) => (d.name = e.target.value))} />

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">День недели</div>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((w, i) => (
                <button
                  key={w}
                  title={WEEKDAYS_FULL[i]}
                  onClick={() => {
                    haptic.select();
                    patchDay((d) => (d.weekday = i + 1));
                  }}
                  className={`rounded-xl py-2 text-sm font-bold transition ${
                    day.weekday === i + 1 ? 'bg-accent text-black' : 'bg-card2 text-muted'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Упражнения</div>
            <div className="space-y-2">
              {active.map((ex, i) => (
                <ExerciseRow
                  key={ex.id}
                  ex={ex}
                  first={i === 0}
                  last={i === active.length - 1}
                  onChange={(fn) =>
                    patchDay((d) => {
                      const e = d.exercises.find((x) => x.id === ex.id);
                      if (e) fn(e);
                    })
                  }
                  onMove={(dir) =>
                    patchDay((d) => {
                      const list = d.exercises.filter((e) => !e.archived);
                      const j = list.findIndex((e) => e.id === ex.id);
                      const k = j + dir;
                      if (k < 0 || k >= list.length) return;
                      [list[j], list[k]] = [list[k], list[j]];
                      d.exercises = [...list, ...d.exercises.filter((e) => e.archived)];
                    })
                  }
                />
              ))}
            </div>
            <AddExercise
              onAdd={(name) =>
                updateProgram((p, id) => {
                  p.days.find((x) => x.id === day.id)?.exercises.push({ id: id('e'), name, targetSets: 3, targetReps: 10 });
                  return p;
                })
              }
            />
          </div>

          <Button variant="danger" className="w-full" onClick={removeDay}>
            Удалить день
          </Button>
        </div>
      )}
    </Card>
  );
}

function ExerciseRow({
  ex,
  first,
  last,
  onChange,
  onMove,
}: {
  ex: Exercise;
  first: boolean;
  last: boolean;
  onChange: (fn: (e: Exercise) => void) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const num = (v: string, min: number) => Math.max(min, Math.min(99, Number(v) || min));
  return (
    <div className="rounded-2xl bg-card2 p-3">
      <div className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
          value={ex.name}
          onChange={(e) => onChange((x) => (x.name = e.target.value))}
        />
        <button disabled={first} onClick={() => onMove(-1)} className="p-1 text-muted disabled:opacity-25">
          <IconChevron dir="up" />
        </button>
        <button disabled={last} onClick={() => onMove(1)} className="p-1 text-muted disabled:opacity-25">
          <IconChevron dir="down" />
        </button>
        <button
          onClick={async () => {
            if (await confirmDialog(`Убрать «${ex.name}» из программы? Статистика сохранится.`)) onChange((x) => (x.archived = true));
          }}
          className="p-1 text-danger/80"
        >
          <IconTrash />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm text-muted">
        План:
        <input
          type="number"
          inputMode="numeric"
          className="num w-12 rounded-lg bg-bg px-2 py-1 text-center text-fg outline-none"
          value={ex.targetSets}
          onChange={(e) => onChange((x) => (x.targetSets = num(e.target.value, 1)))}
        />
        подх. ×
        <input
          type="number"
          inputMode="numeric"
          className="num w-12 rounded-lg bg-bg px-2 py-1 text-center text-fg outline-none"
          value={ex.targetReps}
          onChange={(e) => onChange((x) => (x.targetReps = num(e.target.value, 1)))}
        />
        повт.
      </div>
    </div>
  );
}

function AddExercise({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onAdd(n);
    setName('');
    haptic.success();
  };
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input value={name} placeholder="Новое упражнение, напр. Жим лёжа" onChange={(e) => setName(e.target.value)} />
      <Button type="submit" className="!px-3.5" disabled={!name.trim()}>
        <IconPlus />
      </Button>
    </form>
  );
}

function Backup() {
  const { keysUsed } = useStore();
  const [mode, setMode] = useState<'idle' | 'import'>('idle');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const pct = Math.min(100, Math.round((keysUsed / storageLimit) * 100));

  const doExport = async () => {
    const data = exportJSON();
    try {
      await navigator.clipboard.writeText(data);
      setMsg('Резервная копия скопирована в буфер обмена. Сохрани её, например, в «Избранное».');
    } catch {
      setText(data);
      setMode('import');
      setMsg('Скопируй текст из поля ниже вручную.');
    }
  };

  const doImport = async () => {
    if (!(await confirmDialog('Заменить все текущие данные данными из копии?'))) return;
    try {
      await importJSON(text);
      setMsg('Данные восстановлены ✓');
      setMode('idle');
      setText('');
      haptic.success();
    } catch (e) {
      setMsg(`Ошибка: ${(e as Error).message}`);
    }
  };

  return (
    <div className="mt-8">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Данные</div>
      <Card className="space-y-3">
        <div>
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-muted">{inTelegram ? 'Telegram Cloud' : 'Локально (браузер)'}</span>
            <span className="num font-semibold">
              {keysUsed} / {storageLimit}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-card2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 1)}%` }} />
          </div>
          <div className="mt-1.5 text-xs text-muted">Каждая тренировка занимает одну ячейку хранилища.</div>
        </div>
        <div className="flex gap-2">
          <Button variant="soft" className="flex-1" onClick={doExport}>
            Экспорт
          </Button>
          <Button variant="soft" className="flex-1" onClick={() => setMode(mode === 'import' ? 'idle' : 'import')}>
            Импорт
          </Button>
        </div>
        {mode === 'import' && (
          <div className="space-y-2">
            <textarea
              className="h-28 w-full rounded-xl border border-line bg-card2 p-3 text-xs text-fg outline-none"
              placeholder="Вставь сюда резервную копию"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button className="w-full" disabled={!text.trim()} onClick={doImport}>
              Восстановить
            </Button>
          </div>
        )}
        {msg && <div className="text-sm text-muted">{msg}</div>}
      </Card>
    </div>
  );
}
