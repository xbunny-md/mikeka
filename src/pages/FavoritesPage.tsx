import { useEffect, useMemo, useState } from 'react';
import { Play, Plus, Trash2 } from 'lucide-react';
import { ProtectedRouteGate } from '../components/ProtectedRouteGate.tsx';
import { TicketPosterCard } from '../components/TicketPosterCard.tsx';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import {
  deleteFavoriteItem,
  deleteFavoriteTicket,
  saveFavoriteItem,
} from '../firebase/firestore/repository.ts';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';

export function FavoritesPage() {
  const { user, favorites, favoriteTickets } = useFirebase();
  const {
    leagues,
    markets,
    portfolioTickets,
    openTicketDetails,
    toggleFavoriteTicket,
    setScannerConfig,
    executeScan,
    setActiveSection,
    activeBookmakerInfo,
  } = useOddsHunter();

  const [kind, setKind] = useState<'LEAGUE' | 'TEAM' | 'MARKET'>('TEAM');
  const [teamInput, setTeamInput] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [selectedMarketId, setSelectedMarketId] = useState('');

  useEffect(() => {
    if (markets.length > 0 && !markets.some((m) => m.id === selectedMarketId)) {
      setSelectedMarketId(markets[0].id);
    }
  }, [markets, selectedMarketId]);

  const bookmarkedLiveTickets = useMemo(() => {
    const byId = new Map(portfolioTickets.map((t) => [t.internalTicketId, t]));
    return favoriteTickets
      .map((ft) => byId.get(ft.internalTicketId) || null)
      .filter((t): t is NonNullable<typeof t> => t !== null);
  }, [favoriteTickets, portfolioTickets]);

  const orphanedBookmarks = useMemo(() => {
    const byId = new Set(portfolioTickets.map((t) => t.internalTicketId));
    return favoriteTickets.filter((ft) => !byId.has(ft.internalTicketId));
  }, [favoriteTickets, portfolioTickets]);

  const handleAdd = async () => {
    if (!user || !user.emailVerified) return;
    if (kind === 'TEAM' && teamInput.trim()) {
      await saveFavoriteItem(user.uid, {
        kind: 'TEAM',
        refId: teamInput.trim().toLowerCase(),
        label: teamInput.trim(),
        country: '',
      });
      setTeamInput('');
    } else if (kind === 'LEAGUE' && selectedLeagueId) {
      const l = leagues.find((x) => x.tournamentId === selectedLeagueId);
      if (l) {
        await saveFavoriteItem(user.uid, {
          kind: 'LEAGUE',
          refId: l.tournamentId,
          label: l.tournamentName,
          country: l.country,
        });
      }
    } else if (kind === 'MARKET' && selectedMarketId) {
      const m = markets.find((x) => x.id === selectedMarketId);
      if (m) {
        await saveFavoriteItem(user.uid, {
          kind: 'MARKET',
          refId: m.id,
          label: m.name,
          country: '',
        });
      }
    }
  };

  const handleScanFavorites = async () => {
    const favLeagues = favorites.filter((f) => f.kind === 'LEAGUE').map((f) => f.refId);
    const favMarkets = favorites.filter((f) => f.kind === 'MARKET').map((f) => f.refId);
    setScannerConfig((prev) => {
      const next = {
        ...prev,
        leagues: favLeagues,
        markets: favMarkets.length > 0 ? favMarkets : prev.markets,
      };
      void executeScan(next);
      return next;
    });
    setActiveSection('scanner');
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Favorites &amp; Saved Tickets
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Personal bookmarked tickets from the daily feed alongside saved leagues, teams, and{' '}
            {activeBookmakerInfo.shortName} markets.
          </p>
        </div>
        {user && user.emailVerified && favorites.length > 0 && (
          <button
            type="button"
            onClick={() => void handleScanFavorites()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Scan Favorite Watchlist</span>
          </button>
        )}
      </div>

      <ProtectedRouteGate
        requireVerifiedEmail
        title="Sign In to Save Personal Favorites"
        description="All daily tickets and verified booking codes are public. Sign in or create an account to save favorite tickets, teams, and leagues across sessions."
      >
        {/* Bookmarked Tickets Grid */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Bookmarked Daily Tickets ({favoriteTickets.length})
            </h3>
          </div>

          {favoriteTickets.length === 0 ? (
            <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No bookmarked tickets yet. Tap the bookmark icon on any poster card in Daily Tickets
              to save it here.
            </div>
          ) : (
            <div className="space-y-4">
              {bookmarkedLiveTickets.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {bookmarkedLiveTickets.map((ticket) => (
                    <TicketPosterCard
                      key={ticket.internalTicketId}
                      ticket={ticket}
                      favorited={true}
                      onOpenDetails={openTicketDetails}
                      onToggleFavorite={(t) => void toggleFavoriteTicket(t)}
                    />
                  ))}
                </div>
              )}

              {orphanedBookmarks.length > 0 && user && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {orphanedBookmarks.map((ft) => (
                    <div
                      key={ft.id}
                      className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-blue-700 dark:text-blue-300">
                          {ft.categoryLabel}
                        </div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                          {ft.combinedOdds.toFixed(2)} Odds · {ft.selectionCount} Legs
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">
                          {ft.internalTicketId} · {ft.generatedDateKey}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteFavoriteTicket(user.uid, ft.internalTicketId)}
                        className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                        title="Remove bookmark"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Favorite Teams / Leagues / Markets Watchlist */}
        <section className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/[0.06]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Preferred Teams, Leagues &amp; Markets ({favorites.length})
          </h3>

          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-5 flex flex-wrap items-end gap-3 shadow-xs dark:shadow-none">
            <label className="space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 block">Category</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'LEAGUE' | 'TEAM' | 'MARKET')}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100"
              >
                <option value="TEAM">Team</option>
                <option value="LEAGUE">League</option>
                <option value="MARKET">Market</option>
              </select>
            </label>

            {kind === 'TEAM' && (
              <label className="space-y-1.5 text-xs flex-1 min-w-[220px]">
                <span className="text-slate-600 dark:text-slate-400 block">Team Name</span>
                <input
                  type="text"
                  value={teamInput}
                  onChange={(e) => setTeamInput(e.target.value)}
                  placeholder="e.g. Young Africans, Simba SC, Arsenal..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100"
                />
              </label>
            )}

            {kind === 'LEAGUE' && (
              <label className="space-y-1.5 text-xs flex-1 min-w-[220px]">
                <span className="text-slate-600 dark:text-slate-400 block">League</span>
                <select
                  value={selectedLeagueId}
                  onChange={(e) => setSelectedLeagueId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100"
                >
                  <option value="">Select league...</option>
                  {leagues.slice(0, 120).map((l) => (
                    <option key={l.tournamentId} value={l.tournamentId}>
                      {l.country} — {l.tournamentName}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {kind === 'MARKET' && (
              <label className="space-y-1.5 text-xs flex-1 min-w-[220px]">
                <span className="text-slate-600 dark:text-slate-400 block">Market</span>
                <select
                  value={selectedMarketId}
                  onChange={(e) => setSelectedMarketId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100"
                >
                  {markets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={() => void handleAdd()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Save Watchlist Item</span>
            </button>
          </div>

          {favorites.length > 0 && user && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {favorites.map((fav) => (
                <div
                  key={fav.id}
                  className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-blue-700 dark:text-blue-400">
                      {fav.kind}
                    </div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {fav.label}
                    </div>
                    {fav.country && (
                      <div className="text-xs text-slate-500 truncate">{fav.country}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteFavoriteItem(user.uid, fav.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                    title="Remove favorite"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </ProtectedRouteGate>
    </div>
  );
}
