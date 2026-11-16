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
