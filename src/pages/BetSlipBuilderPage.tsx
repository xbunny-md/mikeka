import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Pencil, QrCode, RefreshCw, Trash2, X } from 'lucide-react';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import { apiClient } from '../services/apiClient.ts';
import type { NormalizedMatch } from '../types/sportybet.ts';
import {
  formatDateTimeCompact,
  formatOdds,
  formatTzs,
} from '../utils/formatters.ts';

export function BetSlipBuilderPage() {
  const {
    bookmakers,
    activeBookmaker,
    activeBookmakerInfo,
    betslip,
    stakeTzs,
    setStakeTzs,
    updateBetslipSelection,
    acceptUpdatedOdds,
    removeFromBetslip,
    clearBetslip,
    validation,
    validatingSlip,
    validateSlipNow,
    generatingCode,
    generateBookingCode,
    setActiveSection,
    openMatchDetail,
  } = useOddsHunter();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editMatch, setEditMatch] = useState<NormalizedMatch | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  const slipBookmakerId = betslip[0]?.bookmakerId || activeBookmaker;
  const slipBookmakerInfo =
    bookmakers.find((b) => b.id === slipBookmakerId) || activeBookmakerInfo;

  const openInlineEditor = async (
    selectionKey: string,
    eventId: string,
    selBookmakerId?: typeof activeBookmaker
  ) => {
    if (editingKey === selectionKey) {
      setEditingKey(null);
      setEditMatch(null);
      return;
    }
    setEditingKey(selectionKey);
    setLoadingEdit(true);
    try {
      const res = await apiClient.getMatchDetails(eventId, selBookmakerId || slipBookmakerId);
      setEditMatch(res.match);
    } catch {
      setEditMatch(null);
    } finally {
      setLoadingEdit(false);
    }
  };

  const combinedOdds =
    betslip.length > 0
      ? Number(betslip.reduce((acc, s) => acc * s.odds, 1).toFixed(2))
      : 0;
  const estReturn = combinedOdds > 0 && stakeTzs > 0 ? combinedOdds * stakeTzs : 0;
  const estProfit = estReturn > 0 ? Math.max(0, estReturn - stakeTzs) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Intelligent Bet Slip Builder
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Verify live {slipBookmakerInfo.name} market availability, edit selections, review odds
            movement, calculate combined decimal odds, and generate a genuine booking code.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={betslip.length === 0 || validatingSlip}
            onClick={() => void validateSlipNow()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#161F30] dark:hover:bg-[#1E293B] border border-slate-200 dark:border-white/10 disabled:opacity-40 text-xs font-medium text-slate-700 dark:text-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${validatingSlip ? 'animate-spin' : ''}`} />
            <span>{validatingSlip ? 'Validating...' : 'Validate Live Odds'}</span>
          </button>

          <button
            type="button"
            disabled={betslip.length === 0}
            onClick={clearBetslip}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Slip</span>
          </button>
        </div>
      </div>

      {betslip.length === 0 ? (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-12 text-center space-y-4 shadow-xs dark:shadow-none">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Your bet slip is currently empty.
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Add selections from the Odds Scanner, Live Matches, or Upcoming Matches, or import an
            existing {activeBookmakerInfo.shortName} sharing code.
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setActiveSection('scanner')}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
            >
              Open Odds Scanner
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('booking-codes')}
              className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#161F30] dark:hover:bg-[#1E293B] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              Import Booking Code
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Selections Column */}
          <div className="lg:col-span-2 space-y-3">
            {validation && validation.globalWarnings.length > 0 && (
              <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 text-xs dark:text-amber-200 space-y-1">
                {validation.globalWarnings.map((w, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {betslip.map((sel) => {
              const vItem = validation?.items.find((i) => i.selectionKey === sel.selectionKey);
              const isEditing = editingKey === sel.selectionKey;
              return (
                <div
                  key={sel.selectionKey}
                  className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-4 space-y-2.5 shadow-xs dark:shadow-none"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => openMatchDetail(sel.eventId)}
                        className="text-sm font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-left truncate block"
                      >
                        {sel.homeTeam} vs {sel.awayTeam}
                      </button>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {sel.leagueName} · {sel.country} ·{' '}
                        {formatDateTimeCompact(sel.estimateStartTime)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 mr-1">
                        {formatOdds(sel.odds)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void openInlineEditor(sel.selectionKey, sel.eventId, sel.bookmakerId)
                        }
                        className={`p-1.5 rounded-lg border transition-colors ${
                          isEditing
                            ? 'border-blue-500 text-blue-700 bg-blue-50 dark:border-blue-500/50 dark:text-blue-300 dark:bg-blue-600/15'
                            : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                        title="Edit market or outcome"
                      >
                        {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromBetslip(sel.selectionKey)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Remove selection"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.06] text-xs">
                    <div className="text-slate-700 dark:text-slate-300">
                      <span className="text-slate-500 dark:text-slate-400">{sel.marketName}:</span>{' '}
                      <span className="font-medium text-blue-700 dark:text-blue-300">
                        {sel.outcomeDesc}
                      </span>
                      {sel.specifier && (
                        <span className="ml-1.5 font-mono text-slate-500">[{sel.specifier}]</span>
                      )}
                    </div>

                    {vItem && (
                      <div className="flex flex-wrap items-center gap-2">
                        {vItem.valid && !vItem.oddsChanged ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Verified Live</span>
                          </span>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>{vItem.warnings.join(' ')}</span>
                            </span>
                            {vItem.oddsChanged && vItem.currentOdds !== null && (
                              <button
                                type="button"
                                onClick={() =>
                                  acceptUpdatedOdds(sel.selectionKey, vItem.currentOdds!)
                                }
                                className="px-2.5 py-1 rounded-md bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-500/30 font-mono text-[11px]"
                              >
                                Accept {formatOdds(vItem.currentOdds)} (
                                {vItem.oddsDiff > 0
                                  ? `+${vItem.oddsDiff.toFixed(2)}`
                                  : vItem.oddsDiff.toFixed(2)}
                                )
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Inline Selection Editor */}
                  {isEditing && (
                    <div className="pt-3 border-t border-slate-200 dark:border-white/[0.08] space-y-2.5">
                      <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        Switch Market / Outcome for {sel.homeTeam} vs {sel.awayTeam}
                      </div>
                      {loadingEdit ? (
                        <div className="text-xs text-slate-500">
                          Loading live {slipBookmakerInfo.shortName} markets...
                        </div>
                      ) : !editMatch ? (
                        <div className="text-xs text-red-600 dark:text-red-400">
                          Unable to fetch live markets for this fixture.
                        </div>
                      ) : (
                        <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                          {editMatch.markets
                            .filter((m) => m.status === 0 && !m.banned)
                            .slice(0, 12)
                            .map((market) => (
                              <div
                                key={`${market.marketId}-${market.specifier}`}
                                className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.06] space-y-1.5"
                              >
                                <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                  {market.desc || market.name}
                                  {market.specifier ? ` [${market.specifier}]` : ''}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {market.outcomes
                                    .filter((o) => o.isActive)
                                    .map((o) => {
                                      const newKey = `${editMatch.eventId}::${market.marketId}::${market.specifier || ''}::${o.outcomeId}`;
                                      const active = newKey === sel.selectionKey;
                                      return (
                                        <button
                                          key={o.outcomeId}
                                          type="button"
                                          onClick={() => {
                                            updateBetslipSelection(sel.selectionKey, {
                                              bookmakerId:
                                                editMatch.bookmakerId ||
                                                sel.bookmakerId ||
                                                slipBookmakerId,
                                              bookmakerName:
                                                editMatch.bookmakerName ||
                                                sel.bookmakerName ||
                                                slipBookmakerInfo.name,
                                              selectionKey: newKey,
                                              eventId: editMatch.eventId,
                                              homeTeam: editMatch.homeTeam,
                                              awayTeam: editMatch.awayTeam,
                                              leagueName: editMatch.leagueName,
                                              country: editMatch.country,
                                              estimateStartTime: editMatch.estimateStartTime,
                                              matchStatus: editMatch.matchStatus,
                                              isLive: editMatch.isLive,
                                              marketId: market.marketId,
                                              marketName: market.desc || market.name,
                                              specifier: market.specifier || '',
                                              outcomeId: o.outcomeId,
                                              outcomeDesc: o.desc,
                                              odds: o.odds,
                                            });
                                            setEditingKey(null);
                                            setEditMatch(null);
                                          }}
                                          className={`px-2.5 py-1 rounded border text-xs flex items-center gap-2 ${
                                            active
                                              ? 'bg-blue-600 border-blue-500 text-white'
                                              : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-blue-500/50'
                                          }`}
                                        >
                                          <span>{o.desc}</span>
                                          <span className="font-mono font-semibold tabular-nums">
                                            {formatOdds(o.odds)}
                                          </span>
                                        </button>
                                      );
                                    })}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Analytics & Booking Code Action Column */}
          <aside className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-5 space-y-5 h-fit shadow-xs dark:shadow-none">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Bet Slip Analytics
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300">
                {slipBookmakerInfo.shortName}
              </span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Selections</span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                  {betslip.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Combined Decimal Odds</span>
                <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatOdds(combinedOdds)}
                </span>
              </div>
            </div>

            <label className="block space-y-1.5 text-xs pt-2 border-t border-slate-200 dark:border-white/[0.06]">
              <span className="text-slate-600 dark:text-slate-400 block">
                Hypothetical Stake (TZS)
              </span>
              <input
                type="number"
                min="0"
                step="500"
                value={stakeTzs}
                onChange={(e) => setStakeTzs(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              />
            </label>

            <div className="space-y-2 text-sm pt-2 border-t border-slate-200 dark:border-white/[0.06]">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Estimated Payout</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {formatTzs(estReturn)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Potential Net Profit</span>
                <span className="font-mono tabular-nums text-blue-700 dark:text-blue-300">
                  {formatTzs(estProfit)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Mathematical calculation only (product of independent decimal odds × stake). Does
              not imply probability guarantees or automatic bet placement.
            </p>

            <button
              type="button"
              disabled={generatingCode}
              onClick={async () => {
                const res = await generateBookingCode();
                if (res) setActiveSection('booking-codes');
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-semibold text-white transition-colors"
            >
              <QrCode className="w-4 h-4" />
              <span>
                {generatingCode
                  ? `Creating ${slipBookmakerInfo.shortName} Code...`
                  : `Generate Genuine ${slipBookmakerInfo.shortName} Code`}
              </span>
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
