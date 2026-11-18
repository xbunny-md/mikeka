import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { MatchCard } from '../components/MatchCard.tsx';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';

export function UpcomingMatchesPage() {
  const {
    activeBookmakerInfo,
    upcomingMatches,
    upcomingTotal,
    upcomingPage,
    loadingUpcoming,
    upcomingError,
    loadUpcomingMatches,
  } = useOddsHunter();

  const [search, setSearch] = useState('');
  const [leagueFilter, setLeagueFilter] = useState('ALL');
  const [todayOnly, setTodayOnly] = useState(false);

  const uniqueLeagues = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of upcomingMatches) {
      map.set(m.leagueId, `${m.country} — ${m.leagueName}`);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [upcomingMatches]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return upcomingMatches.filter((m) => {
      if (leagueFilter !== 'ALL' && m.leagueId !== leagueFilter) return false;
      if (!q) return true;
      return `${m.homeTeam} ${m.awayTeam} ${m.leagueName} ${m.country}`
        .toLowerCase()
        .includes(q);
    });
  }, [upcomingMatches, leagueFilter, search]);

  const totalPages = Math.max(1, Math.ceil(upcomingTotal / 50));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Upcoming Football Fixtures
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Paginated {activeBookmakerInfo.shortName} pre-match schedule (
            {upcomingTotal.toLocaleString('en-US')} total available)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !todayOnly;
              setTodayOnly(next);
              void loadUpcomingMatches(1, next);
            }}
            className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
              todayOnly
                ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-600/20 dark:border-blue-500/40 dark:text-blue-300'
                : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Today&apos;s Games Only
          </button>
          <button
            type="button"
            disabled={loadingUpcoming}
            onClick={() => void loadUpcomingMatches(upcomingPage, todayOnly)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#161F30] dark:hover:bg-[#1E293B] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingUpcoming ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team, league, or country on this page..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <select
          value={leagueFilter}
          onChange={(e) => setLeagueFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 max-w-xs"
        >
          <option value="ALL">All Leagues on Page ({uniqueLeagues.length})</option>
          {uniqueLeagues.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {upcomingError && (
        <div className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 text-sm dark:text-red-300">
          {upcomingError}
        </div>
      )}

      {loadingUpcoming && upcomingMatches.length === 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-48 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.06] animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-10 text-center text-sm text-slate-600 dark:text-slate-400 shadow-xs dark:shadow-none">
          No upcoming fixtures matched your current page filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map((match) => (
            <MatchCard key={match.eventId} match={match} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/[0.08]">
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
          Page {upcomingPage} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loadingUpcoming || upcomingPage <= 1}
            onClick={() => void loadUpcomingMatches(upcomingPage - 1, todayOnly)}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            disabled={loadingUpcoming || upcomingPage >= totalPages}
            onClick={() => void loadUpcomingMatches(upcomingPage + 1, todayOnly)}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
