import { describe, expect, it } from 'vitest';
import { chunk, packSession, parseSessionKey, sessionKey, unpackSession, type Session } from './model';
import { e1rm, exerciseHistory, lastSetsBefore, prevMaxWeight, records } from './stats';

const mk = (date: string, sets: Session['sets'], dayId = 'd1'): Session => ({ key: sessionKey(date, dayId), date, dayId, sets, done: true });

const sessions = [
  mk('2026-11-02', { e1: [[60, 10], [65, 8], [65, 7]] }),
  mk('2026-11-09', { e1: [[65, 10], [70, 8], [0, 0]] }),
  mk('2026-11-16', { e1: [[72.5, 6]], e2: [[20, 12]] }),
];

describe('session keys', () => {
  it('round-trips and only uses CloudStorage-safe characters', () => {
    const k = sessionKey('2026-11-16', 'd12');
    expect(k).toBe('s_20261116_d12');
    expect(/^[A-Za-z0-9_-]+$/.test(k)).toBe(true);
    expect(parseSessionKey(k)).toEqual({ date: '2026-11-16', dayId: 'd12' });
    expect(parseSessionKey('p_0')).toBeNull();
  });

  it('packs compactly and drops empty sets', () => {
    const s = sessions[1];
    const raw = packSession(s);
    expect(raw).toBe('{"x":{"e1":[[65,10],[70,8]]},"f":1}');
    const back = unpackSession(s.key, raw)!;
    expect(back.sets.e1).toEqual([[65, 10], [70, 8]]);
    expect(back.done).toBe(true);
    expect(back.date).toBe('2026-11-09');
  });
});

describe('chunk', () => {
  it('splits long strings and rejoins', () => {
    const s = 'x'.repeat(9000);
    const parts = chunk(s, 4000);
    expect(parts.map((p) => p.length)).toEqual([4000, 4000, 1000]);
    expect(parts.join('')).toBe(s);
  });
});

describe('stats', () => {
  it('computes Epley 1RM', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBe(133.3);
    expect(e1rm(0, 5)).toBe(0);
  });

  it('builds history and records', () => {
    const h = exerciseHistory(sessions, 'e1');
    expect(h.map((p) => p.maxWeight)).toEqual([65, 70, 72.5]);
    expect(h[0].volume).toBe(60 * 10 + 65 * 8 + 65 * 7);
    expect(h[1].sets).toHaveLength(2);
    const r = records(h);
    expect(r.maxWeight).toBe(72.5);
    expect(r.sessions).toBe(3);
  });

  it('finds previous sets and PR before a date', () => {
    expect(lastSetsBefore(sessions, 'e1', '2026-11-16')?.date).toBe('2026-11-09');
    expect(lastSetsBefore(sessions, 'e2', '2026-11-16')).toBeNull();
    expect(prevMaxWeight(sessions, 'e1', '2026-11-16')).toBe(70);
  });
});
