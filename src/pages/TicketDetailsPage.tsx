import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  ListChecks,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import { isDisallowedDailyFeedSelection } from '../utils/dailyFeedFilter.ts';
import { formatDateTimeCompact } from '../utils/formatters.ts';
import type { SelectionSettlementStatus, TicketStatus } from '../types/sportybet.ts';

const TICKET_STATUS_COLOR: Record<TicketStatus, string> = {
  WON: 'text-emerald-700 dark:text-emerald-300',
  LOST: 'text-rose-700 dark:text-rose-300',
  VOID: 'text-slate-600 dark:text-slate-300',
  LIVE: 'text-amber-700 dark:text-amber-300',
  PARTIALLY_SETTLED: 'text-cyan-700 dark:text-cyan-300',
  UNVERIFIED: 'text-orange-700 dark:text-orange-300',
  PENDING: 'text-blue-700 dark:text-blue-300',
};

const LEG_STATUS_STYLE: Record<SelectionSettlementStatus, string> = {
  WON: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30',
  LOST: 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-500/10 dark:border-rose-500/30',
  VOID: 'text-slate-700 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-500/10 dark:border-slate-500/30',
  LIVE: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30',
  UNVERIFIED: 'text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-500/10 dark:border-orange-500/30',
  PENDING: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-500/10 dark:border-blue-500/30',
};

export function TicketDetailsPage() {
  const { isAdmin } = useFirebase();
  const {
    selectedTicket,
    closeTicketDetails,
    isTicketFavorited,
    toggleFavoriteTicket,
    replaceBetslip,
    setActiveSection,
    createBookingCodeForTicket,
    deletePortfolioTicket,
    trackAllResultsNow,
    trackingResults,
  } = useOddsHunter();

  const [copied, setCopied] = useState(false);
  const [creatingCode, setCreatingCode] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!selectedTicket) {
    return (
      <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-10 text-center space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Ticket could not be found in the current feed.
        </p>
        <button
          type="button"
          onClick={closeTicketDetails}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Daily Tickets</span>
        </button>
      </div>
    );
  }

  const favorited = isTicketFavorited(selectedTicket.internalTicketId);
  const ticketBookmakerId = selectedTicket.bookmakerId || 'SPORTYBET_TZ';
  const ticketBookmakerName =
    selectedTicket.bookmakerName ||
    (ticketBookmakerId === 'BETPAWA_TZ' ? 'betPawa TZ' : 'SportyBet TZ');

  const handleCopyBookingCode = () => {
    if (!selectedTicket.shareCode) return;
    navigator.clipboard.writeText(selectedTicket.shareCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const visibleSelections = selectedTicket.selections.filter(
    (s) => !isDisallowedDailyFeedSelection(s)
  );

  const handleLoadIntoBetslip = () => {
    replaceBetslip(
      visibleSelections.map((s) => ({
        selectionKey: s.selectionKey,
        bookmakerId: s.bookmakerId || ticketBookmakerId,
        bookmakerName: s.bookmakerName || ticketBookmakerName,
        eventId: s.eventId,
        homeTeam: s.homeTeam,
        awayTeam: s.awayTeam,
        leagueName: s.leagueName,
        country: s.country,
        estimateStartTime: s.estimateStartTime,
        matchStatus: s.matchStatus,
        isLive: s.isLive,
        marketId: s.marketId,
        marketName: s.marketName,
        specifier: s.specifier,
        outcomeId: s.outcomeId,
        outcomeDesc: s.outcomeDesc,
        odds: s.odds,
        addedAt: new Date().toISOString(),
      }))
    );
    setActiveSection('betslip');
  };

  const handleAdminRetryCode = async () => {
    setCreatingCode(true);
    setActionError(null);
    try {
      await createBookingCodeForTicket(selectedTicket.internalTicketId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to generate booking code.');
    } finally {
      setCreatingCode(false);
    }
  };

  const handleAdminDelete = async () => {
    setActionError(null);
    try {
      await deletePortfolioTicket(selectedTicket.internalTicketId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to remove ticket.');
    }
  };

  const settlementByKey = new Map(
    selectedTicket.selectionSettlements.map((st) => [st.selectionKey, st])
  );

  return (
    <div className="space-y-6">
      {/* Top Action Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={closeTicketDetails}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-[#111827] dark:hover:bg-[#1A2438] border dark:border-white/[0.08] text-xs font-medium dark:text-slate-200"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Daily Tickets</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void toggleFavoriteTicket(selectedTicket)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
              favorited
                ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-500/15 dark:border-amber-400/35 dark:text-amber-300'
                : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 dark:bg-[#111827] dark:border-white/[0.08] dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${favorited ? 'fill-current' : ''}`} />
            <span>{favorited ? 'Bookmarked' : 'Bookmark Ticket'}</span>
          </button>

          <button
            type="button"
            onClick={handleLoadIntoBetslip}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-[#111827] dark:hover:bg-[#1A2438] border dark:border-white/[0.08] text-xs font-medium dark:text-slate-200"
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>Open in Betslip Builder</span>
          </button>

          {isAdmin && (
            <>
              <button
                type="button"
                disabled={trackingResults}
                onClick={() => void trackAllResultsNow([selectedTicket.internalTicketId])}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-600/20 dark:hover:bg-blue-600/30 border dark:border-blue-500/35 text-xs font-medium dark:text-blue-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${trackingResults ? 'animate-spin' : ''}`} />
                <span>Refresh Settlement</span>
              </button>
              <button
                type="button"
                onClick={() => void handleAdminDelete()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 border dark:border-rose-500/30 text-xs font-medium dark:text-rose-300"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Ticket</span>
              </button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 border dark:border-rose-500/30 px-4 py-3 text-xs dark:text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Ticket Header KPI Summary + Booking Code Card */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-5 space-y-5 shadow-xs dark:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 dark:border-white/[0.06] pb-4">
            <div>
              <span className="font-mono text-xs text-blue-700 dark:text-blue-300">
                {ticketBookmakerName} · {selectedTicket.categoryLabel} Odds Category ·{' '}
                {selectedTicket.internalTicketId}
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
                {selectedTicket.actualCombinedOdds.toFixed(2)} Combined Odds
              </h2>
              {selectedTicket.effectiveCombinedOdds !== selectedTicket.actualCombinedOdds && (
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 tabular-nums">
                  Effective Settled Odds (after void adjustment):{' '}
                  {selectedTicket.effectiveCombinedOdds.toFixed(2)}
                </p>
              )}
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 block">
                Ticket Status
              </span>
              <span
                className={`font-mono text-base font-bold ${
                  TICKET_STATUS_COLOR[selectedTicket.status]
                }`}
              >
                {selectedTicket.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/[0.06]">
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                Selections
              </span>
              <span className="font-mono text-base font-semibold text-slate-900 dark:text-white tabular-nums mt-0.5 block">
                {selectedTicket.selectionCount} Legs
              </span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/[0.06]">
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                Generated At
              </span>
              <span className="font-mono text-xs text-slate-700 dark:text-slate-200 mt-1 block">
                {formatDateTimeCompact(selectedTicket.generatedAt)}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/[0.06]">
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                Kickoff Window
              </span>
              <span className="font-mono text-xs text-slate-700 dark:text-slate-200 mt-1 block">
                {selectedTicket.kickoffStartMs > 0
                  ? formatDateTimeCompact(selectedTicket.kickoffStartMs)
                  : '—'}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/[0.06]">
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                Settled At
              </span>
              <span className="font-mono text-xs text-slate-700 dark:text-slate-200 mt-1 block">
                {selectedTicket.settledAt
                  ? formatDateTimeCompact(selectedTicket.settledAt)
                  : 'Awaiting Settlement'}
              </span>
            </div>
          </div>
        </div>

        {/* Bookmaker Booking Code Card */}
        <div className="rounded-xl bg-emerald-50/70 dark:bg-gradient-to-b dark:from-[#13222A] dark:to-[#0D1420] border border-emerald-200 dark:border-emerald-500/25 p-5 flex flex-col justify-between gap-4">
          {selectedTicket.shareCode ? (
            <>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Verified {ticketBookmakerName} Booking Code
                </span>
                <div className="mt-2 font-mono text-3xl font-extrabold tracking-widest text-slate-900 dark:text-white select-all">
                  {selectedTicket.shareCode}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                  Official {ticketBookmakerName} sharing code verified against live Tanzania markets.
                </p>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleCopyBookingCode}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'COPIED TO CLIPBOARD' : 'COPY BOOKING CODE'}</span>
                </button>

                {selectedTicket.shareUrl && (
                  <a
                    href={selectedTicket.shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border-slate-200 text-slate-800 dark:bg-[#090D16] dark:hover:bg-[#131C2E] border dark:border-white/10 text-xs font-medium dark:text-slate-200"
                  >
                    <span>Open on {ticketBookmakerName}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Booking Code Unavailable
                </span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white mt-2">
                  {selectedTicket.bookingCodeStatus === 'FAILED'
                    ? `${ticketBookmakerName} Code Creation Unsupported or Rejected`
                    : 'Awaiting Booking Code'}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5">
                  {selectedTicket.bookingCodeError ||
                    `This ticket can be loaded directly into the Betslip Builder to review or place manually on ${ticketBookmakerName}.`}
                </p>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleLoadIntoBetslip}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
                >
                  <ListChecks className="w-4 h-4" />
                  <span>Load Legs into Betslip Builder</span>
                </button>

                {isAdmin && (
                  <button
                    type="button"
                    disabled={creatingCode}
                    onClick={() => void handleAdminRetryCode()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border-slate-200 text-slate-800 dark:bg-[#090D16] dark:hover:bg-[#161F30] border dark:border-white/10 text-xs font-medium dark:text-slate-200"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${creatingCode ? 'animate-spin' : ''}`} />
                    <span>{creatingCode ? 'Generating...' : 'Admin: Retry Booking Code'}</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Match-by-Match Selections Table */}
      <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-xs dark:shadow-none">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.07] flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Included Matches &amp; Settlement Ledger
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All {selectedTicket.selectionCount} selections verified from {ticketBookmakerName} (
              {selectedTicket.dataSource})
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Last Checked:{' '}
            {selectedTicket.lastCheckedAt
              ? formatDateTimeCompact(selectedTicket.lastCheckedAt)
              : 'At Generation'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-[#0B101B] text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">Match &amp; League</th>
                <th className="py-3 px-4 font-semibold">Kickoff</th>
                <th className="py-3 px-4 font-semibold">Market &amp; Selection</th>
                <th className="py-3 px-4 font-semibold text-right">Odds</th>
                <th className="py-3 px-4 font-semibold">Match Status / Score</th>
                <th className="py-3 px-4 font-semibold text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {visibleSelections.map((sel, index) => {
                const st = settlementByKey.get(sel.selectionKey);
                const legStatus: SelectionSettlementStatus = st?.status || 'PENDING';
                return (
                  <tr
                    key={sel.selectionKey}
                    className="hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-start gap-2.5">
                        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">
                            {sel.homeTeam} vs {sel.awayTeam}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {sel.country ? `${sel.country} · ` : ''}
                            {sel.leagueName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                      {formatDateTimeCompact(sel.estimateStartTime)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-700 dark:text-slate-300">{sel.marketName}</div>
                      <div className="font-semibold text-blue-700 dark:text-blue-300 mt-0.5">
                        {sel.outcomeDesc}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                      {sel.odds.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-700 dark:text-slate-300">
                        {st?.officialMatchStatus || sel.matchStatus || 'Scheduled'}
                      </div>
                      {st?.score && (
                        <div className="font-mono text-xs font-semibold text-slate-900 dark:text-white mt-0.5">
                          Score: {st.score}
                          {st.playedSeconds ? ` (${st.playedSeconds}')` : ''}
                        </div>
                      )}
                      {st?.reason && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{st.reason}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border font-mono text-[10px] font-semibold ${LEG_STATUS_STYLE[legStatus]}`}
                      >
                        {legStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
