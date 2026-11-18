import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { MatchCard } from '../components/MatchCard.tsx';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';

export function LiveMatchesPage() {
  const { activeBookmakerInfo, liveMatches, loadingLive, liveError, refreshLiveMatches } =
    useOddsHunter();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return liveMatches;
    return liveMatches.filter((m) =>
      `${m.homeTeam} ${m.awayTeam} ${m.leagueName} ${m.country}`.toLowerCase().includes(q)
    );
  }, [liveMatches, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Live In-Play Football
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Real-time matches currently active on {activeBookmakerInfo.name} ({liveMatches.length}{' '}
            events)
          </p>
        </div>
        <button
          type="button"
          disabled={loadingLive}
          onClick={() => void refreshLiveMatches()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#161F30] dark:hover:bg-[#1E293B] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingLive ? 'animate-spin' : ''}`} />
          <span>{loadingLive ? 'Refreshing...' : 'Refresh Live Feed'}</span>
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter live matches by team, league, or country..."
          className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {liveError && (
        <div className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 text-sm dark:text-red-300">
          {liveError}
        </div>
      )}

      {loadingLive && liveMatches.length === 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-48 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.06] animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-10 text-center space-y-2 shadow-xs dark:shadow-none">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            No live football matches match your filter.
          </p>
          <p className="text-xs text-slate-500">
            Clear your search or refresh the live feed to check for new kickoffs.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map((match) => (
            <MatchCard key={match.eventId} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}
