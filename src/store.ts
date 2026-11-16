import { useSyncExternalStore } from 'react';
import { chunk, emptyProgram, packSession, SESSION_PREFIX, unpackSession, type Program, type Session } from './model';
import { inTelegram, kv, MAX_KEYS } from './tg';

interface State {
  loaded: boolean;
  program: Program;
  sessions: Session[]; // newest first
  bodyweight: BodyWeight[]; // oldest first
  keysUsed: number;
  error: string | null;
}

export interface BodyWeight {
  date: string;
  kg: number;
}

const CACHE_KEY = 'gym_cache_v1';
const CHUNK_SIZE = 4000;
const countKey = (prefix: string) => `${prefix}_n`;
const chunkKey = (prefix: string, i: number) => `${prefix}_${i}`;

let state: State = { loaded: false, program: emptyProgram(), sessions: [], bodyweight: [], keysUsed: 0, error: null };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (inTelegram && state.loaded) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ program: state.program, sessions: state.sessions, bodyweight: state.bodyweight }));
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
        const c = JSON.parse(cached) as { program: Program; sessions: Session[]; bodyweight?: BodyWeight[] };
        set({ program: c.program, sessions: c.sessions, bodyweight: c.bodyweight ?? [], loaded: true });
      }
    } catch {
      /* ignore bad cache */
    }
  }

  try {
    const keys = await kv.keys();
    const program = await readProgram(keys);
    const bodyweight = unpackBodyweight(await readChunked('b', keys));
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
    set({ program, sessions: sortSessions(merged), bodyweight, keysUsed: keys.length, loaded: true });
  } catch (e) {
    console.error(e);
    set({ loaded: true, error: 'Не удалось загрузить данные из Telegram Cloud.' });
  }
}

async function readChunked(prefix: string, keys: string[]): Promise<string | null> {
  if (!keys.includes(countKey(prefix))) return null;
  const n = Number(await kv.get(countKey(prefix))) || 0;
  const parts = await kv.getMany(Array.from({ length: n }, (_, i) => chunkKey(prefix, i)));
  return Array.from({ length: n }, (_, i) => parts[chunkKey(prefix, i)] ?? '').join('');
}

async function writeChunked(prefix: string, json: string) {
  const prevN = Number(await kv.get(countKey(prefix))) || 0;
  const parts = chunk(json, CHUNK_SIZE);
  for (let i = 0; i < parts.length; i++) await kv.set(chunkKey(prefix, i), parts[i]);
  await kv.set(countKey(prefix), String(parts.length));
  const stale = [];
  for (let i = parts.length; i < prevN; i++) stale.push(chunkKey(prefix, i));
  await kv.remove(stale);
  void refreshKeyCount();
}

async function readProgram(keys: string[]): Promise<Program> {
  const json = await readChunked('p', keys);
  if (json == null) return emptyProgram();
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

function writeProgram(program: Program) {
  return writeChunked('p', JSON.stringify(program));
}

// ---------- Body weight ----------
// packed as [[20261116, 82.4], ...] to stay compact

export function packBodyweight(list: BodyWeight[]): string {
  return JSON.stringify(list.map((b) => [Number(b.date.replaceAll('-', '')), b.kg]));
}

export function unpackBodyweight(raw: string | null): BodyWeight[] {
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as [number, number][])
      .map(([d, kg]) => {
        const s = String(d);
        return { date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, kg };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

let bwWrite: Promise<void> = Promise.resolve();

export function setBodyweight(date: string, kg: number | null) {
  const rest = state.bodyweight.filter((b) => b.date !== date);
  const list = kg ? [...rest, { date, kg }].sort((a, b) => a.date.localeCompare(b.date)) : rest;
  set({ bodyweight: list });
  bwWrite = bwWrite.then(() => writeChunked('b', packBodyweight(list))).catch(fail);
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
  return JSON.stringify({ v: 1, program: state.program, sessions: state.sessions, bodyweight: state.bodyweight });
}

export async function importJSON(text: string) {
  const data = JSON.parse(text) as { program: Program; sessions: Session[]; bodyweight?: BodyWeight[] };
  if (!data?.program?.days || !Array.isArray(data.sessions)) throw new Error('Неверный формат');
  const old = (await kv.keys()).filter((k) => k.startsWith(SESSION_PREFIX));
  await kv.remove(old);
  for (const s of data.sessions) await kv.set(s.key, packSession(s));
  await writeProgram(data.program);
  if (data.bodyweight) await writeChunked('b', packBodyweight(data.bodyweight));
  set({ program: data.program, sessions: sortSessions(data.sessions), bodyweight: data.bodyweight ?? state.bodyweight });
  await refreshKeyCount();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPending();
  });
}
