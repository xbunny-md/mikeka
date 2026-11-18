import { useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, Search, ShieldCheck, Ticket } from 'lucide-react';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import { TicketPosterCard } from '../components/TicketPosterCard.tsx';
import { isTicketAllowedInDailyFeed } from '../utils/dailyFeedFilter.ts';
import { formatDateTimeCompact } from '../utils/formatters.ts';
import type { BookmakerId } from '../types/sportybet.ts';

type FeedStatusFilter = 'ALL' | 'TODAY' | 'UPCOMING' | 'PENDING' | 'WON' | 'LOST' | 'VOID';
type SortOption = 'newest' | 'odds_asc' | 'odds_desc' | 'kickoff_asc';

function getTodayKeyTz(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Dar_es_Salaam',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function TicketFeedPage() {
  const {
    portfolioTickets,
    loadingPortfolio,
    refreshPortfolio,
    analyticsSummary,
    schedulerStatus,
    openTicketDetails,
    isTicketFavorited,
    toggleFavoriteTicket,
  } = useOddsHunter();

  const [statusFilter, setStatusFilter] = useState<FeedStatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [bookmakerFilter, setBookmakerFilter] = useState<'ALL' | BookmakerId>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const todayKey = useMemo(() => getTodayKeyTz(), []);

  const allowedTickets = useMemo(
    () => portfolioTickets.filter((t) => isTicketAllowedInDailyFeed(t)),
    [portfolioTickets]
  );

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of allowedTickets) {
      if (t.categoryId && t.categoryLabel) {
        map.set(t.categoryId, t.categoryLabel);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [allowedTickets]);

  const filteredTickets = useMemo(() => {
    const now = Date.now();
    const q = searchQuery.trim().toLowerCase();

    const list = allowedTickets.filter((t) => {
      if (statusFilter === 'TODAY' && t.generatedDateKey !== todayKey) return false;
      if (statusFilter === 'UPCOMING' && !(t.kickoffStartMs > now && t.status === 'PENDING')) {
        return false;
      }
      if (statusFilter === 'PENDING' && t.status !== 'PENDING' && t.status !== 'LIVE') {
        return false;
      }
      if (statusFilter === 'WON' && t.status !== 'WON') return false;
      if (statusFilter === 'LOST' && t.status !== 'LOST') return false;
      if (statusFilter === 'VOID' && t.status !== 'VOID') return false;

      if (categoryFilter !== 'ALL' && t.categoryId !== categoryFilter) return false;
      if (bookmakerFilter !== 'ALL' && (t.bookmakerId || 'SPORTYBET_TZ') !== bookmakerFilter) {
        return false;
      }

      if (q) {
        const matchesId = t.internalTicketId.toLowerCase().includes(q);
        const matchesCode = (t.shareCode || '').toLowerCase().includes(q);
        const matchesCategory = t.categoryLabel.toLowerCase().includes(q);
        const matchesTeam = t.selections.some(
          (s) =>
            s.homeTeam.toLowerCase().includes(q) ||
            s.awayTeam.toLowerCase().includes(q) ||
            s.leagueName.toLowerCase().includes(q)
        );
        if (!matchesId && !matchesCode && !matchesCategory && !matchesTeam) {
          return false;
        }
      }

      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'odds_asc') return a.actualCombinedOdds - b.actualCombinedOdds;
      if (sortBy === 'odds_desc') return b.actualCombinedOdds - a.actualCombinedOdds;
      if (sortBy === 'kickoff_asc') return a.kickoffStartMs - b.kickoffStartMs;
      return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
    });
  }, [allowedTickets, statusFilter, categoryFilter, bookmakerFilter, searchQuery, sortBy, todayKey]);

  const todayCount = schedulerStatus?.totalDailyTicketsToday ?? analyticsSummary?.generatedToday ?? 0;
  const dailyTarget = schedulerStatus?.dailyTicketTarget ?? analyticsSummary?.dailyTarget ?? 55;
  const bookingCodesCount =
    schedulerStatus?.bookingCodesGeneratedToday ?? analyticsSummary?.validSharingCodes ?? 0;

  return (
    <div className="space-y-6">
      {/* Compact Hero Summary Strip */}
      <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-4 sm:p-5 shadow-xs dark:shadow-none">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-blue-700 dark:text-blue-300">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Tanzania Verified Daily Feed · Strict 1.01–1.25 Selection Filter</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Daily Automated Odds Tickets
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Real upcoming fixtures published across multi-tier odds categories with verified
              booking codes and live settlement tracking.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
            <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/[0.07]">
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                Today&apos;s Tickets
              </span>
              <span className="font-mono text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {todayCount}
                <span className="text-xs font-normal text-slate-500">/{dailyTarget}</span>
              </span>
            </div>
            <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/[0.07]">
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                Booking Codes
              </span>
              <span className="font-mono text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                {bookingCodesCount}
              </span>
            </div>
            <div className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/[0.07]">
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                Last Scan
              </span>
              <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300 block mt-1 truncate">
                {schedulerStatus?.lastScanningAt
                  ? formatDateTimeCompact(schedulerStatus.lastScanningAt)
                  : 'Running...'}
              </span>
            </div>
          </div>
        </div>

        {schedulerStatus?.dailyShortfallReason && (
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/[0.06] flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300/90">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{schedulerStatus.dailyShortfallReason}</span>
          </div>
        )}
      </section>

      {/* Filter Tabs & Controls */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {(
              [
                { id: 'ALL', label: 'All Tickets' },
                { id: 'TODAY', label: "Today's Tickets" },
                { id: 'UPCOMING', label: 'Upcoming' },
                { id: 'PENDING', label: 'Pending' },
                { id: 'WON', label: 'Won' },
                { id: 'LOST', label: 'Lost' },
                { id: 'VOID', label: 'Void' },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${
                    active
                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-600/20 dark:text-blue-200 dark:border-blue-500/40'
                      : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200 dark:bg-[#111827] dark:text-slate-400 dark:hover:text-white dark:border-white/[0.08]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void refreshPortfolio()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-[#111827] dark:hover:bg-[#1A2438] border dark:border-white/[0.08] text-xs font-medium dark:text-slate-300 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPortfolio ? 'animate-spin' : ''}`} />
            <span>Refresh Feed</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <label className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Ticket ID, booking code, team, league..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500/40"
            />
          </label>

          <select
            value={bookmakerFilter}
            onChange={(e) => setBookmakerFilter(e.target.value as 'ALL' | BookmakerId)}
            aria-label="Filter by bookmaker"
            className="px-3 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500/40"
          >
            <option value="ALL">All Bookmakers</option>
            <option value="SPORTYBET_TZ">SportyBet TZ</option>
            <option value="BETPAWA_TZ">betPawa TZ</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by odds category"
            className="px-3 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500/40"
          >
            <option value="ALL">All Odds Categories</option>
            {categoryOptions.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label} Odds
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort tickets"
            className="px-3 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500/40"
          >
            <option value="newest">Newest Generated First</option>
            <option value="odds_asc">Lowest Combined Odds First</option>
            <option value="odds_desc">Highest Combined Odds First</option>
            <option value="kickoff_asc">Soonest Kickoff First</option>
          </select>
        </div>
      </section>

      {/* Two-Column Movie-Poster Grid on Mobile, Multi-Column Poster Grid on Desktop */}
      {loadingPortfolio && portfolioTickets.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-60 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.06] animate-pulse"
            />
          ))}
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-10 text-center space-y-2 shadow-xs dark:shadow-none">
          <Ticket className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            No tickets match the selected filter
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {portfolioTickets.length === 0
              ? 'The Daily Factory checks live Tanzania bookmaker fixtures automatically and publishes eligible tickets here.'
              : 'Clear search terms or select All Tickets to view the full daily feed.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {filteredTickets.map((ticket) => (
            <TicketPosterCard
              key={ticket.internalTicketId}
              ticket={ticket}
              favorited={isTicketFavorited(ticket.internalTicketId)}
              onOpenDetails={openTicketDetails}
              onToggleFavorite={(t) => void toggleFavoriteTicket(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
