export type SetEntry = [weightKg: number, reps: number];

export interface Exercise {
  id: string;
  name: string;
  targetSets: number;
  targetReps: number;
  archived?: boolean;
}

export interface Day {
  id: string;
  name: string;
  weekday: number; // 1 = Monday … 7 = Sunday
  exercises: Exercise[];
}

export interface Program {
  days: Day[];
  nextId: number;
}

export interface Session {
  key: string;
  date: string; // YYYY-MM-DD
  dayId: string;
  sets: Record<string, SetEntry[]>;
  done: boolean;
  start?: number; // unix seconds, first logged set
  end?: number; // unix seconds, when finished
}

export const emptyProgram = (): Program => ({ days: [], nextId: 1 });

export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const WEEKDAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function weekdayOf(d = new Date()): number {
  return ((d.getDay() + 6) % 7) + 1;
}

export function formatDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

// ---------- Session key / packing ----------
// CloudStorage keys may contain only A-Z a-z 0-9 _ -

export const SESSION_PREFIX = 's_';

export function sessionKey(date: string, dayId: string): string {
  return `${SESSION_PREFIX}${date.replaceAll('-', '')}_${dayId}`;
}

export function parseSessionKey(key: string): { date: string; dayId: string } | null {
  const m = /^s_(\d{4})(\d{2})(\d{2})_([A-Za-z0-9-]+)$/.exec(key);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, dayId: m[4] };
}

interface PackedSession {
  x: Record<string, SetEntry[]>;
  f?: 1;
  s?: number;
  e?: number;
}

export function packSession(s: Session): string {
  const x: Record<string, SetEntry[]> = {};
  for (const [id, sets] of Object.entries(s.sets)) {
    const clean = sets.filter(([w, r]) => w > 0 || r > 0).map(([w, r]) => [round(w), Math.round(r)] as SetEntry);
    if (clean.length) x[id] = clean;
  }
  const packed: PackedSession = { x };
  if (s.done) packed.f = 1;
  if (s.start) packed.s = s.start;
  if (s.end) packed.e = s.end;
  return JSON.stringify(packed);
}

export function unpackSession(key: string, raw: string): Session | null {
  const meta = parseSessionKey(key);
  if (!meta) return null;
  try {
    const p = JSON.parse(raw) as PackedSession;
    return { key, date: meta.date, dayId: meta.dayId, sets: p.x ?? {}, done: p.f === 1, start: p.s, end: p.e };
  } catch {
    return null;
  }
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- Chunking for values > 4096 chars ----------

export function chunk(str: string, size: number): string[] {
  if (!str.length) return [''];
  const out: string[] = [];
  for (let i = 0; i < str.length; i += size) out.push(str.slice(i, i + size));
  return out;
}
