import { useSyncExternalStore } from 'react';
import { chunk, emptyProgram, packSession, SESSION_PREFIX, unpackSession, type Program, type Session } from './model';
import { inTelegram, kv, MAX_KEYS } from './tg';

interface State {
  loaded: boolean;
  program: Program;
  sessions: Session[]; // newest first
  keysUsed: number;
  error: string | null;
}

const CACHE_KEY = 'gym_cache_v1';
const PROGRAM_COUNT = 'p_n';
const PROGRAM_CHUNK = (i: number) => `p_${i}`;
const CHUNK_SIZE = 4000;

let state: State = { loaded: false, program: emptyProgram(), sessions: [], keysUsed: 0, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (inTelegram && state.loaded) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ program: state.program, sessions: state.sessions }));
    } catch {
      /* quota */
    }
  }
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const getState = () => state;

const sortSessions = (s: Session[]) => [...s].sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key));

function fail(e: unknown) {
  console.error(e);
  set({ error: 'Не удалось сохранить в Telegram Cloud. Проверь соединение.' });
}

export function clearError() {
  set({ error: null });
}

// ---------- Loading ----------

export async function loadAll() {
  if (inTelegram) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const c = JSON.parse(cached) as { program: Program; sessions: Session[] };
        set({ program: c.program, sessions: c.sessions, loaded: true });
      }
    } catch {
      /* ignore bad cache */
    }
  }

  try {
    const keys = await kv.keys();
    const program = await readProgram(keys);
    const sKeys = keys.filter((k) => k.startsWith(SESSION_PREFIX));
    const raw = await kv.getMany(sKeys);
    const sessions = Object.entries(raw)
      .map(([k, v]) => unpackSession(k, v))
      .filter((s): s is Session => !!s);
    // keep any in-flight local edits that are not yet persisted
    const pendingKeys = new Set(pending.keys());
    const merged = sessions.filter((s) => !pendingKeys.has(s.key));
    for (const k of pendingKeys) {
      const local = state.sessions.find((s) => s.key === k);
      if (local) merged.push(local);
    }
    set({ program, sessions: sortSessions(merged), keysUsed: keys.length, loaded: true });
  } catch (e) {
    console.error(e);
    set({ loaded: true, error: 'Не удалось загрузить данные из Telegram Cloud.' });
  }
}

async function readProgram(keys: string[]): Promise<Program> {
  if (!keys.includes(PROGRAM_COUNT)) return emptyProgram();
  const n = Number(await kv.get(PROGRAM_COUNT)) || 0;
  const parts = await kv.getMany(Array.from({ length: n }, (_, i) => PROGRAM_CHUNK(i)));
  const json = Array.from({ length: n }, (_, i) => parts[PROGRAM_CHUNK(i)] ?? '').join('');
  try {
    const p = JSON.parse(json) as Program;
    return p?.days ? p : emptyProgram();
  } catch {
    return emptyProgram();
  }
}

// ---------- Program ----------

let programWrite: Promise<void> = Promise.resolve();
let programTimer: ReturnType<typeof setTimeout> | undefined;

export function saveProgram(program: Program) {
  set({ program });
  clearTimeout(programTimer);
  programTimer = setTimeout(flushProgram, 600);
}

function flushProgram() {
  if (programTimer === undefined) return;
  clearTimeout(programTimer);
  programTimer = undefined;
  const snapshot = state.program;
  programWrite = programWrite.then(() => writeProgram(snapshot)).catch(fail);
}

async function writeProgram(program: Program) {
  const prevN = Number(await kv.get(PROGRAM_COUNT)) || 0;
  const parts = chunk(JSON.stringify(program), CHUNK_SIZE);
  for (let i = 0; i < parts.length; i++) await kv.set(PROGRAM_CHUNK(i), parts[i]);
  await kv.set(PROGRAM_COUNT, String(parts.length));
  const stale = [];
  for (let i = parts.length; i < prevN; i++) stale.push(PROGRAM_CHUNK(i));
  await kv.remove(stale);
  void refreshKeyCount();
}

/** Immutable program update with an id generator that bumps `nextId`. */
export function updateProgram(fn: (p: Program, genId: (prefix: 'd' | 'e') => string) => Program) {
  let next = state.program.nextId;
  const genId = (prefix: 'd' | 'e') => `${prefix}${next++}`;
  const updated = fn(structuredClone(state.program), genId);
  saveProgram({ ...updated, nextId: next });
}

// ---------- Sessions ----------

const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function upsertSession(session: Session, immediate = false) {
  const exists = state.sessions.some((s) => s.key === session.key);
  const sessions = exists
    ? state.sessions.map((s) => (s.key === session.key ? session : s))
    : sortSessions([session, ...state.sessions]);
  set({ sessions });

  clearTimeout(pending.get(session.key));
  const write = () => {
    pending.delete(session.key);
    const latest = state.sessions.find((s) => s.key === session.key);
    if (!latest) return;
    kv.set(latest.key, packSession(latest))
      .then(() => {
        if (!exists) void refreshKeyCount();
      })
      .catch(fail);
  };
  if (immediate) write();
  else pending.set(session.key, setTimeout(write, 500));
}

export function flushPending() {
  flushProgram();
  for (const [key, t] of pending) {
    clearTimeout(t);
    pending.delete(key);
    const s = state.sessions.find((x) => x.key === key);
    if (s) kv.set(s.key, packSession(s)).catch(fail);
  }
}

export async function deleteSession(key: string) {
  clearTimeout(pending.get(key));
  pending.delete(key);
  set({ sessions: state.sessions.filter((s) => s.key !== key) });
  await kv.remove([key]).catch(fail);
  void refreshKeyCount();
}

async function refreshKeyCount() {
  try {
    const keys = await kv.keys();
    set({ keysUsed: keys.length });
  } catch {
    /* ignore */
  }
}

export const storageLimit = MAX_KEYS;

// ---------- Backup ----------

export function exportJSON(): string {
  return JSON.stringify({ v: 1, program: state.program, sessions: state.sessions.map((s) => ({ ...s })) });
}

export async function importJSON(text: string) {
  const data = JSON.parse(text) as { program: Program; sessions: Session[] };
  if (!data?.program?.days || !Array.isArray(data.sessions)) throw new Error('Неверный формат');
  const old = (await kv.keys()).filter((k) => k.startsWith(SESSION_PREFIX));
  await kv.remove(old);
  for (const s of data.sessions) await kv.set(s.key, packSession(s));
  await writeProgram(data.program);
  set({ program: data.program, sessions: sortSessions(data.sessions) });
  await refreshKeyCount();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPending();
  });
}
