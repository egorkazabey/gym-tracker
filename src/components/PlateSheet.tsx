import { useState } from 'react';
import { round } from '../model';
import { fmtW, platesPerSide, warmupSets } from '../stats';
import { haptic } from '../tg';

const BAR_KEY = 'gym_bar_kg';
const BARS = [20, 15, 10, 0];

const PLATE_STYLE: Record<string, { color: string; h: number; text: string }> = {
  '25': { color: '#e5484d', h: 100, text: '#fff' },
  '20': { color: '#3e7bfa', h: 100, text: '#fff' },
  '15': { color: '#f5c518', h: 90, text: '#000' },
  '10': { color: '#30a46c', h: 78, text: '#fff' },
  '5': { color: '#e8e8ee', h: 62, text: '#000' },
  '2.5': { color: '#55556a', h: 50, text: '#fff' },
  '1.25': { color: '#9a9aae', h: 42, text: '#000' },
};

function loadBar() {
  try {
    const v = Number(localStorage.getItem(BAR_KEY));
    return BARS.includes(v) && localStorage.getItem(BAR_KEY) !== null ? v : 20;
  } catch {
    return 20;
  }
}

export default function PlateSheet({ initial, onClose }: { initial: number; onClose: () => void }) {
  const [weight, setWeight] = useState(String(initial));
  const [bar, setBar] = useState(loadBar);
  const w = Number(weight.replace(',', '.')) || 0;
  const { plates, rest } = platesPerSide(w, bar);
  const warm = warmupSets(w, bar || 20);

  const chooseBar = (b: number) => {
    haptic.select();
    setBar(b);
    try {
      localStorage.setItem(BAR_KEY, String(b));
    } catch {
      /* ignore */
    }
  };

  const step = (d: number) => {
    haptic.select();
    setWeight(String(Math.max(0, round(w + d))));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="fade-up mx-auto w-full max-w-lg rounded-t-[28px] border-t border-line bg-card px-5 pt-3"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-extrabold">Калькулятор блинов</div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-muted">
            ✕
          </button>
        </div>

        <div className="mb-4 flex items-center rounded-2xl bg-card2">
          <button className="h-14 w-14 text-2xl font-bold text-muted" onClick={() => step(-2.5)}>
            −
          </button>
          <input
            inputMode="decimal"
            className="num h-14 w-full min-w-0 bg-transparent text-center text-3xl font-extrabold outline-none"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^\d.,]/g, ''))}
          />
          <span className="pr-2 text-sm font-semibold text-muted">кг</span>
          <button className="h-14 w-14 text-2xl font-bold text-muted" onClick={() => step(2.5)}>
            +
          </button>
        </div>

        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Гриф</div>
        <div className="mb-5 grid grid-cols-4 gap-2">
          {BARS.map((b) => (
            <button
              key={b}
              onClick={() => chooseBar(b)}
              className={`rounded-xl py-2 text-sm font-bold ${bar === b ? 'bg-accent text-black' : 'bg-card2 text-muted'}`}
            >
              {b ? `${b} кг` : 'Без'}
            </button>
          ))}
        </div>

        {/* barbell */}
        <div className="mb-2 flex h-28 items-center justify-center">
          <div className="h-3 w-10 rounded-l bg-[#6b6b7b]" />
          <div className="h-6 w-2 bg-[#8a8a99]" />
          <div className="flex h-full items-center gap-[3px]">
            {plates.length === 0 && <div className="px-6 text-sm text-muted">{w > 0 ? 'Только гриф' : '—'}</div>}
            {plates.map((p, i) => {
              const st = PLATE_STYLE[String(p)];
              return (
                <div
                  key={i}
                  className="flex items-center justify-center rounded-[4px] text-[9px] font-extrabold"
                  style={{ background: st.color, color: st.text, height: `${st.h}%`, width: p >= 10 ? 20 : 14 }}
                >
                  <span className="-rotate-90">{fmtW(p)}</span>
                </div>
              );
            })}
          </div>
          <div className="h-3 flex-1 max-w-16 rounded-r bg-[#6b6b7b]" />
        </div>
        <div className="mb-5 text-center text-sm text-muted">
          {plates.length ? (
            <>
              На каждую сторону: <span className="num font-bold text-fg">{plates.map(fmtW).join(' + ')}</span>
            </>
          ) : null}
          {rest > 0 && <div className="mt-1 text-danger">Не собрать точно: не хватает {fmtW(rest * 2)} кг</div>}
        </div>

        {warm.length > 0 && (
          <>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Разминка</div>
            <div className="space-y-1.5">
              {warm.map(([ww, r], i) => {
                const p = platesPerSide(ww, bar);
                return (
                  <div key={i} className="flex items-center gap-3 rounded-xl bg-card2 px-3 py-2 text-sm">
                    <span className="num w-20 font-bold">
                      {fmtW(ww)} × {r}
                    </span>
                    <span className="num flex-1 truncate text-right text-muted">
                      {p.plates.length ? p.plates.map(fmtW).join(' + ') : 'гриф'}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
