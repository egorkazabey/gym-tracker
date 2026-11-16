import { useEffect, useState, type ReactNode } from 'react';
import { IconChart, IconHistory, IconList, IconToday } from './components/icons';
import HistoryPage from './pages/History';
import ProgramPage from './pages/Program';
import StatsPage from './pages/Stats';
import TodayPage from './pages/Today';
import WorkoutPage from './pages/Workout';
import { todayISO } from './model';
import { clearError, loadAll, useStore } from './store';
import { haptic, tg } from './tg';

type Tab = 'today' | 'stats' | 'history' | 'program';
type Route = { tab: Tab; workout?: { dayId: string; date: string } };

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'today', label: 'Сегодня', icon: <IconToday /> },
  { id: 'stats', label: 'Статистика', icon: <IconChart /> },
  { id: 'history', label: 'История', icon: <IconHistory /> },
  { id: 'program', label: 'Программа', icon: <IconList /> },
];

export default function App() {
  const { loaded, error } = useStore();
  const [route, setRoute] = useState<Route>({ tab: 'today' });
  const [selectedDate, setSelectedDate] = useState(todayISO());

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.tab, route.workout?.dayId]);

  // Telegram back button while inside a workout
  useEffect(() => {
    if (!tg || !route.workout) return;
    const back = () => setRoute((r) => ({ tab: r.tab }));
    tg.BackButton.onClick(back);
    tg.BackButton.show();
    return () => {
      tg!.BackButton.offClick(back);
      tg!.BackButton.hide();
    };
  }, [route.workout]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 4000);
    return () => clearTimeout(t);
  }, [error]);

  const openWorkout = (dayId: string, date: string) => setRoute((r) => ({ ...r, workout: { dayId, date } }));

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
      {route.workout ? (
        <>
          {!tg && (
            <button onClick={() => setRoute({ tab: route.tab })} className="mb-2 text-sm font-semibold text-muted">
              ← Назад
            </button>
          )}
          <WorkoutPage
            key={`${route.workout.dayId}-${route.workout.date}`}
            dayId={route.workout.dayId}
            date={route.workout.date}
            onDone={() => setRoute({ tab: route.tab })}
          />
        </>
      ) : route.tab === 'today' ? (
        <TodayPage
          onStart={openWorkout}
          goProgram={() => setRoute({ tab: 'program' })}
          selected={selectedDate}
          onSelect={setSelectedDate}
        />
      ) : route.tab === 'stats' ? (
        <StatsPage />
      ) : route.tab === 'history' ? (
        <HistoryPage onOpen={openWorkout} />
      ) : (
        <ProgramPage />
      )}

      {!route.workout && (
        <nav
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/85 backdrop-blur-xl"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pt-2">
            {TABS.map((t) => {
              const active = route.tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    haptic.select();
                    setRoute({ tab: t.id });
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-semibold transition ${
                    active ? 'text-accent' : 'text-muted'
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {error && (
        <div className="fade-up fixed inset-x-4 top-4 z-40 mx-auto max-w-md rounded-2xl border border-danger/30 bg-[#2a1418] p-3 text-sm text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
