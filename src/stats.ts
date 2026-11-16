import type { Session, SetEntry } from './model';

/** Epley estimated one-rep max. */
export function e1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export interface ExercisePoint {
  date: string;
  maxWeight: number;
  best1rm: number;
  volume: number;
  topSet: SetEntry;
  sets: SetEntry[];
}

export function valid(sets: SetEntry[] | undefined): SetEntry[] {
  return (sets ?? []).filter(([w, r]) => w > 0 && r > 0);
}

export function pointFor(date: string, sets: SetEntry[]): ExercisePoint | null {
  const v = valid(sets);
  if (!v.length) return null;
  let top = v[0];
  let best = 0;
  let volume = 0;
  for (const s of v) {
    if (s[0] > top[0] || (s[0] === top[0] && s[1] > top[1])) top = s;
    best = Math.max(best, e1rm(s[0], s[1]));
    volume += s[0] * s[1];
  }
  return { date, maxWeight: top[0], best1rm: best, volume: Math.round(volume), topSet: top, sets: v };
}

/** Chronological history (oldest first) of an exercise across sessions. */
export function exerciseHistory(sessions: Session[], exId: string): ExercisePoint[] {
  const byDate = new Map<string, SetEntry[]>();
  for (const s of sessions) {
    const sets = s.sets[exId];
    if (!sets?.length) continue;
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), ...sets]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, sets]) => pointFor(d, sets))
    .filter((p): p is ExercisePoint => !!p);
}

export interface Records {
  maxWeight: number;
  best1rm: number;
  maxVolume: number;
  sessions: number;
}

export function records(history: ExercisePoint[]): Records {
  return {
    maxWeight: Math.max(0, ...history.map((h) => h.maxWeight)),
    best1rm: Math.max(0, ...history.map((h) => h.best1rm)),
    maxVolume: Math.max(0, ...history.map((h) => h.volume)),
    sessions: history.length,
  };
}

/** Last session (strictly before `beforeDate`) that has sets for this exercise. */
export function lastSetsBefore(sessions: Session[], exId: string, beforeDate: string): { date: string; sets: SetEntry[] } | null {
  let best: { date: string; sets: SetEntry[] } | null = null;
  for (const s of sessions) {
    if (s.date >= beforeDate) continue;
    const v = valid(s.sets[exId]);
    if (!v.length) continue;
    if (!best || s.date > best.date) best = { date: s.date, sets: v };
  }
  return best;
}

/** Heaviest weight lifted for this exercise before the given date. */
export function prevMaxWeight(sessions: Session[], exId: string, beforeDate: string): number {
  let m = 0;
  for (const s of sessions) {
    if (s.date >= beforeDate) continue;
    for (const [w, r] of s.sets[exId] ?? []) if (r > 0 && w > m) m = w;
  }
  return m;
}

export function fmtW(w: number): string {
  return Number.isInteger(w) ? String(w) : w.toFixed(w * 10 === Math.round(w * 10) ? 1 : 2);
}

// ---------- Session summary ----------

export interface SessionSummary {
  sets: number;
  volume: number;
  exercises: number;
  durationMin: number | null;
  prs: { exId: string; weight: number; reps: number; prev: number }[];
  prevVolume: number | null;
}

export function sessionSummary(session: Session, all: Session[]): SessionSummary {
  let sets = 0;
  let volume = 0;
  let exercises = 0;
  const prs: SessionSummary['prs'] = [];
  for (const [exId, raw] of Object.entries(session.sets)) {
    const v = valid(raw);
    if (!v.length) continue;
    exercises++;
    sets += v.length;
    volume += v.reduce((a, [w, r]) => a + w * r, 0);
    const prev = prevMaxWeight(all, exId, session.date);
    const top = v.reduce((a, b) => (b[0] > a[0] ? b : a));
    if (prev > 0 && top[0] > prev) prs.push({ exId, weight: top[0], reps: top[1], prev });
  }
  const prevSame = all
    .filter((s) => s.dayId === session.dayId && s.date < session.date)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const prevVolume = prevSame
    ? Object.values(prevSame.sets).reduce((a, x) => a + valid(x).reduce((b, [w, r]) => b + w * r, 0), 0)
    : null;
  const durationMin = session.start && session.end && session.end > session.start ? Math.round((session.end - session.start) / 60) : null;
  return { sets, volume: Math.round(volume), exercises, durationMin, prs, prevVolume: prevVolume ? Math.round(prevVolume) : null };
}

// ---------- Progressive overload ----------

/** If every planned set hit the target reps at the same top weight last time, suggest adding weight. */
export function suggestWeight(last: SetEntry[] | undefined, targetSets: number, targetReps: number, step = 2.5): number | null {
  const v = valid(last);
  if (v.length < targetSets) return null;
  const top = Math.max(...v.map(([w]) => w));
  const working = v.filter(([w]) => w === top);
  if (working.length < targetSets) return null;
  return working.every(([, r]) => r >= targetReps) ? Math.round((top + step) * 100) / 100 : null;
}

// ---------- Overview ----------

function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const isLogged = (s: Session) => Object.values(s.sets).some((x) => valid(x).length);

/** Total volume per week (oldest first), for the last `weeks` weeks ending with the week of `today`. */
export function weeklyVolume(sessions: Session[], today: string, weeks = 12): { week: string; volume: number; workouts: number }[] {
  const start = shiftISO(mondayOf(today), -7 * (weeks - 1));
  const out = Array.from({ length: weeks }, (_, i) => ({ week: shiftISO(start, i * 7), volume: 0, workouts: 0 }));
  for (const s of sessions) {
    if (!isLogged(s)) continue;
    const idx = out.findIndex((w) => w.week === mondayOf(s.date));
    if (idx < 0) continue;
    out[idx].workouts++;
    out[idx].volume += Math.round(Object.values(s.sets).reduce((a, x) => a + valid(x).reduce((b, [w, r]) => b + w * r, 0), 0));
  }
  return out;
}

/** Consecutive weeks with at least one workout. The current week counts only if it already has one. */
export function streakWeeks(sessions: Session[], today: string): number {
  const weeks = new Set(sessions.filter(isLogged).map((s) => mondayOf(s.date)));
  let w = mondayOf(today);
  if (!weeks.has(w)) w = shiftISO(w, -7);
  let n = 0;
  while (weeks.has(w)) {
    n++;
    w = shiftISO(w, -7);
  }
  return n;
}

// ---------- Plates ----------

export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Greedy plates per side for a barbell. `rest` > 0 means the exact weight can't be built. */
export function platesPerSide(total: number, bar = 20, plates = PLATES): { plates: number[]; rest: number } {
  let side = Math.round(((total - bar) / 2) * 100) / 100;
  if (side <= 0) return { plates: [], rest: Math.max(0, side) };
  const out: number[] = [];
  for (const p of plates) {
    while (side >= p - 1e-9) {
      out.push(p);
      side = Math.round((side - p) * 100) / 100;
    }
  }
  return { plates: out, rest: side };
}

/** Classic warm-up ramp towards a working weight, rounded to 2.5 kg. */
export function warmupSets(work: number, bar = 20): SetEntry[] {
  if (work <= bar) return [];
  const r = (x: number) => Math.round(x / 2.5) * 2.5;
  const ramp: SetEntry[] = [[bar, 10], [r(work * 0.5), 5], [r(work * 0.7), 3], [r(work * 0.85), 2]];
  const out: SetEntry[] = [];
  for (const [w, reps] of ramp) {
    if (w < bar || w >= work) continue;
    if (out.some(([x]) => x === w)) continue;
    out.push([w, reps]);
  }
  return out;
}
