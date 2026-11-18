import { ChevronRight, Star } from 'lucide-react';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import { deleteFavoriteItem, saveFavoriteItem } from '../firebase/firestore/repository.ts';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import type { NormalizedMarket, NormalizedMatch } from '../types/sportybet.ts';
import { formatKickoffDate, formatKickoffTime, formatOdds } from '../utils/formatters.ts';
import { StatusLabel } from './StatusLabel.tsx';

function pickDisplayMarkets(markets: NormalizedMarket[], bookmakerId?: string): NormalizedMarket[] {
  const priority =
    bookmakerId === 'BETPAWA_TZ' ? ['3743', '4693', '5000', '3795'] : ['1', '10', '18', '29'];
  const picked: NormalizedMarket[] = [];
  for (const id of priority) {
    const found =
      id === '18' || id === '5000'
        ? markets.find((m) => m.marketId === id && m.specifier === 'total=2.5') ||
          markets.find((m) => m.marketId === id)
        : markets.find((m) => m.marketId === id);
    if (found) picked.push(found);
  }
  return picked.length > 0 ? picked.slice(0, 3) : markets.slice(0, 3);
}

export function MatchCard({ match }: { match: NormalizedMatch }) {
  const { betslip, addToBetslip, removeFromBetslip, openMatchDetail, activeBookmaker } =
    useOddsHunter();
  const { user, favorites } = useFirebase();

  const matchBookmakerId = match.bookmakerId || activeBookmaker;
  const matchBookmakerName =
    match.bookmakerName || (matchBookmakerId === 'BETPAWA_TZ' ? 'betPawa TZ' : 'SportyBet TZ');
  const displayMarkets = pickDisplayMarkets(match.markets, matchBookmakerId);
  const favLeague = favorites.find(
    (f) => f.kind === 'LEAGUE' && f.refId === match.leagueId
  );

  const toggleFavoriteLeague = async () => {
    if (!user) return;
    if (favLeague) {
      await deleteFavoriteItem(user.uid, favLeague.id);
    } else {
      await saveFavoriteItem(user.uid, {
        kind: 'LEAGUE',
        refId: match.leagueId,
        label: match.leagueName,
        country: match.country,
      });
    }
  };

  return (
    <article className="bg-white/95 dark:bg-[#111827]/90 backdrop-blur-md border border-slate-200 dark:border-white/[0.08] rounded-xl p-4 hover:border-slate-300 dark:hover:border-white/[0.16] transition-colors space-y-3.5 shadow-xs dark:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 min-w-0">
          <span className="text-slate-800 dark:text-slate-200 font-medium truncate">
            {match.leagueName}
          </span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{match.country}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {formatKickoffDate(match.estimateStartTime)} {formatKickoffTime(match.estimateStartTime)}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <StatusLabel
            status={match.isLive ? 'LIVE' : 'UPCOMING'}
            label={
              match.isLive
                ? `LIVE ${match.playedSeconds || match.matchStatus}`
                : match.matchStatus
            }
          />
          {user && (
            <button
              type="button"
              onClick={toggleFavoriteLeague}
              title={favLeague ? 'Remove league from favorites' : 'Save league to favorites'}
              className={`p-1.5 rounded-lg border transition-colors ${
                favLeague
                  ? 'border-amber-300 text-amber-600 bg-amber-50 dark:border-amber-500/40 dark:text-amber-400 dark:bg-amber-500/10'
                  : 'border-slate-200 dark:border-white/[0.08] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Star className="w-3.5 h-3.5" fill={favLeague ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">
            {match.homeTeam}{' '}
            <span className="text-slate-400 dark:text-slate-500 font-normal">vs</span>{' '}
            {match.awayTeam}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {matchBookmakerName} · {match.dataSource} · Updated{' '}
            {formatKickoffTime(match.retrievedAt)} ·{' '}
            <span className="font-mono tabular-nums">{match.totalMarketSize}</span> markets
          </p>
        </div>

        {match.isLive && match.score && (
          <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.08] font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
            {match.score}
          </div>
        )}
      </div>

      {displayMarkets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-slate-100 dark:border-white/[0.06]">
          {displayMarkets.map((market) => {
            const isSuspended = market.status !== 0 || market.banned;
            return (
              <div key={`${market.marketId}-${market.specifier}`} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                    {market.desc || market.name}
                    {market.specifier ? ` (${market.specifier.replace(/^total=/, '')})` : ''}
                  </span>
                  {isSuspended && (
                    <span className="text-red-600 dark:text-red-400 text-[11px]">Suspended</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {market.outcomes.slice(0, 3).map((outcome) => {
                    const selectionKey = `${match.eventId}::${market.marketId}::${market.specifier || ''}::${outcome.outcomeId}`;
                    const selected = betslip.some((s) => s.selectionKey === selectionKey);
                    const disabled = isSuspended || !outcome.isActive;

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
                              eventId: match.eventId,
                              homeTeam: match.homeTeam,
                              awayTeam: match.awayTeam,
                              leagueName: match.leagueName,
                              country: match.country,
                              estimateStartTime: match.estimateStartTime,
                              matchStatus: match.matchStatus,
                              isLive: match.isLive,
                              marketId: market.marketId,
                              marketName: market.desc || market.name,
                              specifier: market.specifier || '',
                              outcomeId: outcome.outcomeId,
                              outcomeDesc: outcome.desc,
                              odds: outcome.odds,
                            });
                          }
                        }}
                        className={`px-2 py-2 rounded-lg border text-left transition-colors min-h-[40px] flex flex-col justify-center ${
                          disabled
                            ? 'bg-slate-100/70 border-slate-200/70 text-slate-400 dark:bg-[#0B101B]/50 dark:border-white/[0.04] dark:text-slate-600 cursor-not-allowed'
                            : selected
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'bg-slate-50 border-slate-200 hover:border-blue-500/60 text-slate-800 dark:bg-[#0B101B] dark:border-white/[0.08] dark:hover:border-blue-500/60 dark:text-slate-200'
                        }`}
                      >
                        <span className="text-[11px] opacity-80 truncate block">
                          {outcome.desc}
                        </span>
                        <span className="font-mono text-xs font-semibold tabular-nums">
                          {disabled ? '—' : formatOdds(outcome.odds)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] text-xs text-slate-500">
          No active summary markets in this feed bucket. Inspect match details for full catalog.
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] font-mono text-slate-500 truncate">
          ID: {match.eventId}
        </span>
        <button
          type="button"
          onClick={() => openMatchDetail(match.eventId)}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors whitespace-nowrap"
        >
          <span>All Markets</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
}
