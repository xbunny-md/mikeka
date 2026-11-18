import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import { apiClient } from '../services/apiClient.ts';
import type { NormalizedMatch } from '../types/sportybet.ts';
import { formatDateTimeCompact, formatOdds } from '../utils/formatters.ts';
import { StatusLabel } from './StatusLabel.tsx';

export function MatchDetailModal() {
  const {
    selectedMatchId,
    closeMatchDetail,
    betslip,
    addToBetslip,
    removeFromBetslip,
    activeBookmaker,
  } = useOddsHunter();
  const [match, setMatch] = useState<NormalizedMatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketSearch, setMarketSearch] = useState('');

  const loadDetail = async (eventId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getMatchDetails(eventId, activeBookmaker);
      setMatch(res.match);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch match details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedMatchId) {
      setMarketSearch('');
      void loadDetail(selectedMatchId);
    } else {
      setMatch(null);
    }
  }, [selectedMatchId, activeBookmaker]);

  const filteredMarkets = useMemo(() => {
    if (!match) return [];
    const q = marketSearch.trim().toLowerCase();
    if (!q) return match.markets;
    return match.markets.filter((m) =>
      `${m.name} ${m.desc} ${m.specifier}`.toLowerCase().includes(q)
    );
  }, [match, marketSearch]);

  if (!selectedMatchId) return null;

  const matchBookmakerId = match?.bookmakerId || activeBookmaker;
  const matchBookmakerName =
    match?.bookmakerName || (matchBookmakerId === 'BETPAWA_TZ' ? 'betPawa TZ' : 'SportyBet TZ');

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-xl w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-white/[0.08]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
              {match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Loading Match Markets...'}
            </h2>
            {match && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {matchBookmakerName} · {match.leagueName} · {match.country} ·{' '}
                {formatDateTimeCompact(match.estimateStartTime)} · {match.dataSource}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {selectedMatchId && (
              <button
                type="button"
                onClick={() => loadDetail(selectedMatchId)}
                disabled={loading}
                className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
                title="Refresh match markets"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={closeMatchDetail}
              className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/5 transition-colors"
              aria-label="Close match details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-[#0B101B]/60">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={marketSearch}
              onChange={(e) => setMarketSearch(e.target.value)}
              placeholder="Search markets (e.g. Double Chance, Handicap, 2.5, Corners)..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          {match && (
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <StatusLabel
                status={match.isLive ? 'LIVE' : 'UPCOMING'}
                label={match.isLive ? `LIVE ${match.score || ''}` : match.matchStatus}
              />
              <span className="font-mono tabular-nums">{filteredMarkets.length} markets shown</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && !match ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-lg bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 text-sm">
              {error}
            </div>
          ) : filteredMarkets.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No markets matched your search query.
            </div>
          ) : (
            filteredMarkets.map((market) => {
              const suspended = market.status !== 0 || market.banned;
              return (
                <div
                  key={`${market.marketId}-${market.specifier}`}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.07] space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {market.desc || market.name}
                      {market.specifier && (
                        <span className="ml-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                          [{market.specifier}]
                        </span>
                      )}
                    </div>
                    {suspended ? (
                      <StatusLabel status="UNAVAILABLE" label="Suspended" />
                    ) : (
                      <span className="text-[11px] font-mono text-slate-500">
                        Market #{market.marketId} · {market.sourceType}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {market.outcomes.map((outcome) => {
                      const selectionKey = `${match!.eventId}::${market.marketId}::${market.specifier || ''}::${outcome.outcomeId}`;
                      const selected = betslip.some((s) => s.selectionKey === selectionKey);
                      const disabled = suspended || !outcome.isActive;
                      return (
                        <button
                          key={outcome.outcomeId}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (selected) {
                              removeFromBetslip(selectionKey);
                            } else {
                              addToBetslip({
                                selectionKey,
                                bookmakerId: matchBookmakerId,
                                bookmakerName: matchBookmakerName,
                                eventId: match!.eventId,
                                homeTeam: match!.homeTeam,
                                awayTeam: match!.awayTeam,
                                leagueName: match!.leagueName,
                                country: match!.country,
                                estimateStartTime: match!.estimateStartTime,
                                matchStatus: match!.matchStatus,
                                isLive: match!.isLive,
                                marketId: market.marketId,
                                marketName: market.desc || market.name,
                                specifier: market.specifier || '',
                                outcomeId: outcome.outcomeId,
                                outcomeDesc: outcome.desc,
                                odds: outcome.odds,
                              });
                            }
                          }}
                          className={`px-3 py-2 rounded-lg border text-left transition-colors flex items-center justify-between gap-2 min-h-[40px] ${
                            disabled
                              ? 'bg-slate-100/70 border-slate-200/70 text-slate-400 dark:bg-[#111827]/40 dark:border-white/[0.04] dark:text-slate-600 cursor-not-allowed'
                              : selected
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-white border-slate-200 hover:border-blue-500/60 text-slate-800 dark:bg-[#111827] dark:border-white/[0.08] dark:hover:border-blue-500/60 dark:text-slate-200'
                          }`}
                        >
                          <span className="text-xs truncate">{outcome.desc}</span>
                          <span className="font-mono text-xs font-semibold tabular-nums shrink-0">
                            {disabled ? '—' : formatOdds(outcome.odds)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
