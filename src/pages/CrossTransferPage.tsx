import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  ListPlus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import { saveTransferRecord } from '../firebase/firestore/repository.ts';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import { apiClient } from '../services/apiClient.ts';
import type {
  BetslipSelection,
  CanonicalMarketInfo,
  TransferConfirmResponse,
  TransferDirection,
  TransferHistoryEntry,
  TransferLegStatus,
  TransferPreviewResponse,
  TransferSourceSelection,
  TransferStatus,
} from '../types/sportybet.ts';
import { formatDateTimeCompact } from '../utils/formatters.ts';

const STATUS_BADGE_MAP: Record<
  TransferStatus,
  { label: string; classes: string }
> = {
  READY_TO_REVIEW: {
    label: 'Ready to Review',
    classes:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  },
  PARTIALLY_MATCHED: {
    label: 'Partially Matched',
    classes:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  },
  UNAVAILABLE_SELECTIONS: {
    label: 'Unavailable Selections',
    classes:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  },
  WAITING_FOR_CONFIRMATION: {
    label: 'Waiting Confirmation',
    classes:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  },
  TRANSFERRED: {
    label: 'Transferred',
    classes:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  },
  MANUAL_IMPORT_REQUIRED: {
    label: 'Manual Import Required',
    classes:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  },
  FAILED: {
    label: 'Transfer Failed',
    classes:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  },
};

const LEG_STATUS_STYLE: Record<
  TransferLegStatus,
  { label: string; classes: string }
> = {
  MATCHED: {
    label: 'Matched',
    classes: 'text-emerald-700 dark:text-emerald-400',
  },
  ODDS_CHANGED: {
    label: 'Odds Changed',
    classes: 'text-amber-700 dark:text-amber-300',
  },
  UNAVAILABLE: {
    label: 'Unavailable',
    classes: 'text-rose-700 dark:text-rose-400',
  },
  UNMATCHED: {
    label: 'Unmatched',
    classes: 'text-rose-700 dark:text-rose-400',
  },
  MATCH_STARTED: {
    label: 'Match Started',
    classes: 'text-amber-700 dark:text-amber-300',
  },
};

function createEmptyManualSelection(): TransferSourceSelection {
  return {
    id: `man_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    homeTeam: '',
    awayTeam: '',
    leagueName: '',
    marketName: 'Double Chance',
    specifier: '',
    outcomeDesc: '1X',
    odds: 1.2,
  };
}

export function CrossTransferPage() {
  const { user, cloudTransfers, getIdToken, openAuthModal } = useFirebase();
  const {
    replaceBetslip,
    setActiveSection,
    setActiveBookmaker,
    pushNotification,
    platformSettings,
  } = useOddsHunter();

  const [direction, setDirection] = useState<TransferDirection>('SPORTYBET_TO_BETPAWA');
  const [bookingCodeInput, setBookingCodeInput] = useState('');
  const [showManualImport, setShowManualImport] = useState(false);
  const [manualSelections, setManualSelections] = useState<TransferSourceSelection[]>([
    createEmptyManualSelection(),
  ]);

  const [canonicalMarkets, setCanonicalMarkets] = useState<CanonicalMarketInfo[]>([]);
  const [crossTransferEnabled, setCrossTransferEnabled] = useState(true);

  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [preview, setPreview] = useState<TransferPreviewResponse | null>(null);
  const [keptMatchedKeys, setKeptMatchedKeys] = useState<Set<string>>(new Set());
  const [hiddenUnavailableIds, setHiddenUnavailableIds] = useState<Set<string>>(new Set());
  const [confirmResult, setConfirmResult] = useState<TransferConfirmResponse | null>(null);

  const [backendHistory, setBackendHistory] = useState<TransferHistoryEntry[]>([]);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const sourceInfo = useMemo(
    () =>
      direction === 'SPORTYBET_TO_BETPAWA'
        ? {
            id: 'SPORTYBET_TZ' as const,
            name: 'SportyBet Tanzania',
            short: 'SportyBet TZ',
            url: 'https://www.sportybet.com/tz/m/',
          }
        : {
            id: 'BETPAWA_TZ' as const,
            name: 'betPawa Tanzania',
            short: 'betPawa TZ',
            url: 'https://www.betpawa.co.tz/bets',
          },
    [direction]
  );

  const targetInfo = useMemo(
    () =>
      direction === 'SPORTYBET_TO_BETPAWA'
        ? {
            id: 'BETPAWA_TZ' as const,
            name: 'betPawa Tanzania',
            short: 'betPawa TZ',
            url: 'https://www.betpawa.co.tz/bets',
          }
        : {
            id: 'SPORTYBET_TZ' as const,
            name: 'SportyBet Tanzania',
            short: 'SportyBet TZ',
            url: 'https://www.sportybet.com/tz/m/',
          },
    [direction]
  );

  const loadMetaAndHistory = useCallback(async () => {
    try {
      const mRes = await apiClient.getTransferMarkets();
      setCanonicalMarkets(mRes.markets);
      setCrossTransferEnabled(mRes.crossTransferEnabled);
    } catch {
      // Non-fatal
    }

    if (user) {
      try {
        const token = await getIdToken();
        if (token) {
          const hRes = await apiClient.getUserTransferHistory(token);
          setBackendHistory(hRes.transfers);
        }
      } catch {
        // Non-fatal
      }
    } else {
      setBackendHistory([]);
    }
  }, [getIdToken, user]);

  useEffect(() => {
    void loadMetaAndHistory();
  }, [loadMetaAndHistory, platformSettings]);

  const handleDirectionSwitch = (next: TransferDirection) => {
    setDirection(next);
    setPreview(null);
    setConfirmResult(null);
    setPreviewError(null);
  };

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const runPreview = async (mode: 'code' | 'manual') => {
    setPreviewError(null);
    setConfirmResult(null);
    setPreviewing(true);

    try {
      const token = user ? await getIdToken() : null;
      let payload: {
        direction: TransferDirection;
        bookingCode?: string;
        manualSelections?: TransferSourceSelection[];
      };

      if (mode === 'code') {
        const code = bookingCodeInput.trim();
        if (!code) {
          throw new Error(`Enter a valid ${sourceInfo.short} booking code first.`);
        }
        payload = { direction, bookingCode: code };
      } else {
        const validManual = manualSelections.filter(
          (s) => s.homeTeam.trim() && s.awayTeam.trim() && s.marketName.trim() && s.outcomeDesc.trim()
        );
        if (validManual.length === 0) {
          throw new Error(
            'Enter at least one manual selection with Home Team, Away Team, Market, and Outcome.'
          );
        }
        payload = { direction, manualSelections: validManual };
      }

      const res = await apiClient.previewTransfer(payload, token);
      setPreview(res);
      setKeptMatchedKeys(new Set(res.matchedSelections.map((s) => s.selectionKey)));
      setHiddenUnavailableIds(new Set());

      if (res.status === 'MANUAL_IMPORT_REQUIRED') {
        setShowManualImport(true);
      }

      if (user && user.emailVerified) {
        void saveTransferRecord(user.uid, {
          transferId: res.transferId,
          direction: res.direction,
          sourceBookmaker: res.sourceBookmaker,
          targetBookmaker: res.targetBookmaker,
          originalCode: res.originalCode,
          status: res.status,
          originalSelectionCount: res.originalSelectionCount,
          matchedCount: res.matchedCount,
          unmatchedCount: res.unmatchedCount + res.unavailableCount,
          originalCombinedOdds: res.originalCombinedOdds,
          targetCombinedOdds: res.targetCombinedOdds,
          errorMessage: res.warnings[0] || '',
        }).catch(() => {});
      }

      void loadMetaAndHistory();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Unable to preview transfer.');
    } finally {
      setPreviewing(false);
    }
  };

  const activeMatchedSelections: BetslipSelection[] = useMemo(() => {
    if (!preview) return [];
    return preview.matchedSelections.filter((s) => keptMatchedKeys.has(s.selectionKey));
  }, [keptMatchedKeys, preview]);

  const recalculatedTargetOdds = useMemo(() => {
    if (activeMatchedSelections.length === 0) return null;
    return Number(
      activeMatchedSelections.reduce((acc, s) => acc * s.odds, 1).toFixed(2)
    );
  }, [activeMatchedSelections]);

  const removeMatchedKey = (selectionKey: string) => {
    setKeptMatchedKeys((prev) => {
      const next = new Set(prev);
      next.delete(selectionKey);
      return next;
    });
    setConfirmResult(null);
  };

  const removeUnavailableLeg = (legId: string) => {
    setHiddenUnavailableIds((prev) => {
      const next = new Set(prev);
      next.add(legId);
      return next;
    });
  };

  const handleConfirmTransfer = async () => {
    if (!preview || activeMatchedSelections.length === 0) return;
    setConfirming(true);
    setPreviewError(null);
    try {
      const token = user ? await getIdToken() : null;
      const res = await apiClient.confirmTransfer(
        {
          transferId: preview.transferId,
          direction: preview.direction,
          originalCode: preview.originalCode,
          originalSelectionCount: preview.originalSelectionCount,
          originalCombinedOdds: preview.originalCombinedOdds,
          confirmedSelections: activeMatchedSelections,
        },
        token
      );
      setConfirmResult(res);

      if (res.status === 'TRANSFERRED' && res.targetBookingCode) {
        pushNotification(
          'CODE_CREATED',
          `Transfer Complete: ${res.targetBookingCode}`,
          `Generated genuine ${targetInfo.short} booking code for ${res.selectionCount} legs @ ${res.targetCombinedOdds.toFixed(
            2
          )}x.`
        );
      } else {
        pushNotification(
          'INTEGRATION_ERROR',
          'Transfer Booking Code Unavailable',
          res.errorMessage ||
            `Could not generate automatic ${targetInfo.short} booking code. Use manual handoff.`
        );
      }

      if (user && user.emailVerified) {
        void saveTransferRecord(user.uid, {
          transferId: res.transferId,
          direction: res.direction,
          sourceBookmaker: res.sourceBookmaker,
          targetBookmaker: res.targetBookmaker,
          originalCode: res.originalCode,
          targetBookingCode: res.targetBookingCode,
          targetShareUrl: res.targetShareUrl,
          status: res.status,
          originalSelectionCount: preview.originalSelectionCount,
          matchedCount: res.selectionCount,
          unmatchedCount: Math.max(0, preview.originalSelectionCount - res.selectionCount),
          originalCombinedOdds: res.originalCombinedOdds,
          targetCombinedOdds: res.targetCombinedOdds,
          errorMessage: res.errorMessage,
        }).catch(() => {});
      }

      void loadMetaAndHistory();
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : 'Failed to confirm betslip transfer.'
      );
    } finally {
      setConfirming(false);
    }
  };

  const handleLoadIntoBetslip = () => {
    if (activeMatchedSelections.length === 0) return;
    setActiveBookmaker(targetInfo.id);
    replaceBetslip(activeMatchedSelections);
    setActiveSection('betslip');
  };

  const mergedHistory = useMemo(() => {
    const byId = new Map<string, TransferHistoryEntry>();
    for (const item of backendHistory) {
      byId.set(item.transferId, item);
    }
    for (const ct of cloudTransfers) {
      if (!byId.has(ct.transferId)) {
        byId.set(ct.transferId, {
          transferId: ct.transferId,
          direction: ct.direction,
          sourceBookmaker: ct.sourceBookmaker,
          targetBookmaker: ct.targetBookmaker,
          originalCode: ct.originalCode,
          targetBookingCode: ct.targetBookingCode || null,
          targetShareUrl: ct.targetShareUrl || null,
          status: ct.status,
          originalSelectionCount: ct.originalSelectionCount,
          matchedCount: ct.matchedCount,
          unmatchedCount: ct.unmatchedCount,
          originalCombinedOdds: ct.originalCombinedOdds,
          targetCombinedOdds: ct.targetCombinedOdds || null,
          actorUid: user?.uid || null,
          actorEmail: user?.email || null,
          errorMessage: ct.errorMessage || null,
          createdAt:
            typeof ct.createdAt === 'string'
              ? ct.createdAt
              : ct.createdAt && typeof ct.createdAt.toDate === 'function'
                ? ct.createdAt.toDate().toISOString()
                : new Date().toISOString(),
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [backendHistory, cloudTransfers, user?.email, user?.uid]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Cross-Bookmaker Bet Transfer
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 max-w-2xl">
            Verify fixtures, exact markets, settlement rules, and live odds between SportyBet
            Tanzania and betPawa Tanzania before generating a genuine booking code on the target
            platform.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            handleDirectionSwitch(
              direction === 'SPORTYBET_TO_BETPAWA'
                ? 'BETPAWA_TO_SPORTYBET'
                : 'SPORTYBET_TO_BETPAWA'
            )
          }
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-[#161F30] text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Swap Direction</span>
        </button>
      </div>

      {!crossTransferEnabled && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Cross-Bookmaker Transfer is Currently Disabled</p>
            <p className="mt-0.5">
              An administrator has paused Cross-Bookmaker Bet Transfer or one of the bookmaker
              integrations in Admin Control Center.
            </p>
          </div>
        </div>
      )}

      {/* Direction Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleDirectionSwitch('SPORTYBET_TO_BETPAWA')}
          className={`p-4 rounded-xl border text-left transition-colors ${
            direction === 'SPORTYBET_TO_BETPAWA'
              ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500/30 dark:bg-blue-600/15 dark:border-blue-500/50'
              : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <span>SportyBet Tanzania</span>
              <ArrowRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>betPawa Tanzania</span>
            </div>
            {direction === 'SPORTYBET_TO_BETPAWA' && (
              <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Import a SportyBet booking code, match active fixtures and exact markets on betPawa TZ,
            and create a genuine betPawa booking number.
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleDirectionSwitch('BETPAWA_TO_SPORTYBET')}
          className={`p-4 rounded-xl border text-left transition-colors ${
            direction === 'BETPAWA_TO_SPORTYBET'
              ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500/30 dark:bg-blue-600/15 dark:border-blue-500/50'
              : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/20'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <span>betPawa Tanzania</span>
              <ArrowRight className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>SportyBet Tanzania</span>
            </div>
            {direction === 'BETPAWA_TO_SPORTYBET' && (
              <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Import a betPawa booking number, match active fixtures and exact markets on SportyBet TZ,
            and generate a genuine SportyBet share code.
          </p>
        </button>
      </div>

      {/* Step 1: Import Code + Manual Selection Fallback */}
      <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-5 space-y-4 shadow-xs dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Step 1 · Import from {sourceInfo.short}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Paste your original {sourceInfo.short} booking code or enter selections manually to
              preview exact matches on {targetInfo.short}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowManualImport((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 whitespace-nowrap"
          >
            <ListPlus className="w-3.5 h-3.5" />
            <span>{showManualImport ? 'Hide Manual Entry' : 'Manual Selection Fallback'}</span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runPreview('code');
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <input
            type="text"
            value={bookingCodeInput}
            onChange={(e) => setBookingCodeInput(e.target.value.toUpperCase())}
            placeholder={`Paste ${sourceInfo.short} booking code (e.g. BC12AB)`}
            disabled={!crossTransferEnabled || previewing}
            className="flex-1 px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-sm font-mono uppercase text-slate-900 dark:text-white placeholder:normal-case placeholder:font-sans"
          />
          <button
            type="submit"
            disabled={!crossTransferEnabled || previewing}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${previewing ? 'animate-spin' : ''}`} />
            <span>{previewing ? 'Matching Fixtures...' : `Preview ${targetInfo.short} Transfer`}</span>
          </button>
        </form>

        {showManualImport && (
          <div className="pt-4 border-t border-slate-200 dark:border-white/[0.08] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Manual Selection Import
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Use when a booking code has expired or is blocked by provider rules.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setManualSelections((prev) => [...prev, createEmptyManualSelection()])
                }
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Leg</span>
              </button>
            </div>

            <div className="space-y-2">
              {manualSelections.map((sel, idx) => (
                <div
                  key={sel.id}
                  className="grid grid-cols-1 sm:grid-cols-6 gap-2 p-3 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.06] text-xs items-end"
                >
                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-500 block">Home Team</span>
                    <input
                      type="text"
                      value={sel.homeTeam}
                      onChange={(e) =>
                        setManualSelections((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, homeTeam: e.target.value } : row
                          )
                        )
                      }
                      placeholder="Arsenal"
                      className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-500 block">Away Team</span>
                    <input
                      type="text"
                      value={sel.awayTeam}
                      onChange={(e) =>
                        setManualSelections((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, awayTeam: e.target.value } : row
                          )
                        )
                      }
                      placeholder="Chelsea"
                      className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-500 block">Market</span>
                    <select
                      value={sel.marketName}
                      onChange={(e) =>
                        setManualSelections((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, marketName: e.target.value } : row
                          )
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                    >
                      <option value="1X2">1X2 (Match Winner)</option>
                      <option value="Double Chance">Double Chance</option>
                      <option value="Over/Under">Over/Under Goals</option>
                      <option value="Both Teams To Score">Both Teams To Score (GG/NG)</option>
                      <option value="Draw No Bet">Draw No Bet</option>
                      <option value="Odd/Even">Odd/Even Goals</option>
                      <option value="1st Half 1X2">1st Half 1X2</option>
                      <option value="1st Half Over/Under">1st Half Over/Under</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-500 block">Outcome / Line</span>
                    <input
                      type="text"
                      value={sel.outcomeDesc}
                      onChange={(e) =>
                        setManualSelections((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, outcomeDesc: e.target.value } : row
                          )
                        )
                      }
                      placeholder="1X / Over 1.5 / Yes"
                      className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-[11px] text-slate-500 block">Source Odds</span>
                    <input
                      type="number"
                      step="0.01"
                      min="1.01"
                      value={sel.odds}
                      onChange={(e) =>
                        setManualSelections((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, odds: Number(e.target.value) || 1.01 } : row
                          )
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono tabular-nums"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={manualSelections.length <= 1}
                    onClick={() =>
                      setManualSelections((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="px-2.5 py-1.5 rounded border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 disabled:opacity-40 inline-flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!crossTransferEnabled || previewing}
                onClick={() => void runPreview('manual')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Match Manual Selections on {targetInfo.short}</span>
              </button>
            </div>
          </div>
        )}

        {previewError && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-200">
            {previewError}
          </div>
        )}
      </section>

      {/* Step 2: Transfer Preview & Confirmation Screen */}
      {preview && (
        <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-xs dark:shadow-none">
          {/* Summary Header */}
          <div className="p-5 border-b border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {preview.sourceBookmakerName} → {preview.targetBookmakerName}
                </span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-[11px] font-medium ${
                    STATUS_BADGE_MAP[confirmResult ? confirmResult.status : preview.status].classes
                  }`}
                >
                  {STATUS_BADGE_MAP[confirmResult ? confirmResult.status : preview.status].label}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Original Code:{' '}
                  <strong className="font-mono text-slate-900 dark:text-slate-200">
                    {preview.originalCode}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>Checked {formatDateTimeCompact(preview.checkedAt)}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">ID {preview.transferId}</span>
              </div>
            </div>

            {/* KPI Comparison Strip */}
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div>
                <span className="text-slate-500 block">Matched Legs</span>
                <span className="font-mono font-bold text-base text-slate-900 dark:text-white tabular-nums">
                  {activeMatchedSelections.length} / {preview.originalSelectionCount}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Original Odds</span>
                <span className="font-mono font-semibold text-base text-slate-700 dark:text-slate-300 tabular-nums">
                  {preview.originalCombinedOdds.toFixed(2)}x
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">{targetInfo.short} Odds</span>
                <span className="font-mono font-bold text-base text-blue-700 dark:text-blue-300 tabular-nums">
                  {recalculatedTargetOdds !== null ? `${recalculatedTargetOdds.toFixed(2)}x` : '—'}
                </span>
              </div>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="px-5 py-3 bg-amber-50/70 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20 space-y-1">
              {preview.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-800 dark:text-amber-200">
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* Confirmed Result Banner */}
          {confirmResult && (
            <div
              className={`p-5 border-b ${
                confirmResult.status === 'TRANSFERRED'
                  ? 'bg-emerald-50/80 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25'
                  : 'bg-rose-50/80 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/25'
              }`}
            >
              {confirmResult.status === 'TRANSFERRED' && confirmResult.targetBookingCode ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Genuine {targetInfo.short} Booking Code Created &amp; Verified
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-2xl font-mono font-bold tracking-wider text-slate-900 dark:text-white">
                        {confirmResult.targetBookingCode}
                      </span>
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                        {confirmResult.selectionCount} legs ·{' '}
                        {confirmResult.targetCombinedOdds.toFixed(2)}x combined odds
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopy(confirmResult.targetBookingCode || '', 'code')
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <ClipboardCopy className="w-3.5 h-3.5" />
                      <span>{copiedText === 'code' ? 'Copied Code' : 'Copy Code'}</span>
                    </button>

                    {confirmResult.targetShareUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopy(confirmResult.targetShareUrl || '', 'url')
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <ClipboardCopy className="w-3.5 h-3.5" />
                        <span>{copiedText === 'url' ? 'Copied Link' : 'Copy Share Link'}</span>
                      </button>
                    )}

                    <a
                      href={confirmResult.targetShareUrl || confirmResult.manualHandoffUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white whitespace-nowrap"
                    >
                      <span>Open on {targetInfo.short}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 text-xs font-semibold">
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span>Automatic Target Booking Code Not Created</span>
                    </div>
                    <p className="text-xs text-rose-700 dark:text-rose-200">
                      {confirmResult.errorMessage ||
                        `${targetInfo.short} could not issue a share code right now. No fake code was generated.`}
                    </p>
                  </div>
                  <a
                    href={confirmResult.manualHandoffUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-300 dark:border-rose-500/40 bg-white dark:bg-[#0B101B] text-xs font-semibold text-rose-700 dark:text-rose-200 whitespace-nowrap"
                  >
                    <span>Manual Handoff ({targetInfo.short})</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Selection Comparison Table */}
          {preview.legs.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {preview.legs.map((leg, idx) => {
                const isMatched = Boolean(leg.targetSelection);
                const kept = leg.targetSelection
                  ? keptMatchedKeys.has(leg.targetSelection.selectionKey)
                  : !hiddenUnavailableIds.has(leg.sourceSelection.id);
                if (!kept) return null;

                const statusMeta = LEG_STATUS_STYLE[leg.status];

                return (
                  <div
                    key={`${leg.sourceSelection.id}_${idx}`}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-semibold ${statusMeta.classes}`}>
                          {statusMeta.label}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {leg.targetSelection
                            ? `${leg.targetSelection.homeTeam} vs ${leg.targetSelection.awayTeam}`
                            : `${leg.sourceSelection.homeTeam} vs ${leg.sourceSelection.awayTeam}`}
                        </span>
                        {leg.matchConfidence > 0 && (
                          <>
                            <span aria-hidden="true" className="text-slate-400">
                              ·
                            </span>
                            <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                              {(leg.matchConfidence * 100).toFixed(0)}% fixture match
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
                        <span>
                          Original:{' '}
                          <strong className="text-slate-900 dark:text-white">
                            {leg.sourceSelection.marketName} — {leg.sourceSelection.outcomeDesc}
                          </strong>{' '}
                          <span className="font-mono tabular-nums">
                            ({leg.sourceSelection.odds.toFixed(2)})
                          </span>
                        </span>
                        {leg.targetSelection && (
                          <>
                            <span aria-hidden="true">→</span>
                            <span>
                              {targetInfo.short}:{' '}
                              <strong className="text-blue-700 dark:text-blue-300">
                                {leg.targetSelection.marketName} — {leg.targetSelection.outcomeDesc}
                              </strong>{' '}
                              <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                                ({leg.targetSelection.odds.toFixed(2)})
                              </span>
                            </span>
                            {leg.oddsDifference !== null &&
                              Math.abs(leg.oddsDifference) >= 0.01 && (
                                <span
                                  className={`font-mono tabular-nums ${
                                    leg.oddsDifference > 0
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-amber-700 dark:text-amber-300'
                                  }`}
                                >
                                  ({leg.oddsDifference > 0 ? '+' : ''}
                                  {leg.oddsDifference.toFixed(2)})
                                </span>
                              )}
                          </>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {leg.reason} {leg.settlementRuleNote}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (isMatched && leg.targetSelection) {
                            removeMatchedKey(leg.targetSelection.selectionKey);
                          } else {
                            removeUnavailableLeg(leg.sourceSelection.id);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-500/30 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Leg</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Review & Confirmation Footer Actions */}
          <div className="p-5 bg-slate-50 dark:bg-[#0B101B] border-t border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Never substitutes unavailable outcomes. Confirming sends only verified matched legs to{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {targetInfo.name}
              </span>
              .
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={preview.manualHandoffUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 whitespace-nowrap"
              >
                <span>Open {targetInfo.short}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <button
                type="button"
                disabled={activeMatchedSelections.length === 0}
                onClick={handleLoadIntoBetslip}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111827] disabled:opacity-40 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50 whitespace-nowrap"
              >
                <span>Load Matched into Betslip ({activeMatchedSelections.length})</span>
              </button>

              <button
                type="button"
                disabled={
                  !crossTransferEnabled || confirming || activeMatchedSelections.length === 0
                }
                onClick={() => void handleConfirmTransfer()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {confirming
                    ? 'Generating Booking Code...'
                    : `Confirm & Create ${targetInfo.short} Code`}
                </span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Supported Canonical Markets Reference */}
      {canonicalMarkets.length > 0 && (
        <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-5 space-y-3 shadow-xs dark:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Supported 1:1 Market Equivalency Rules
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Strict cross-bookmaker market mapping preserves exact goal lines, periods, and
                settlement rules.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {canonicalMarkets.length} canonical markets
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {canonicalMarkets.map((m) => (
              <div
                key={m.id}
                className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.06] space-y-1"
              >
                <div className="font-semibold text-slate-900 dark:text-white">{m.label}</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{m.settlementRule}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Transfers History */}
      <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-xs dark:shadow-none">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Your Recent Bet Transfers
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {user
                ? 'Synced per signed-in account.'
                : 'Sign in to persist cross-bookmaker transfer history across sessions.'}
            </p>
          </div>
          {!user && (
            <button
              type="button"
              onClick={() => openAuthModal('signin')}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white whitespace-nowrap"
            >
              Sign In to Sync History
            </button>
          )}
        </div>

        {mergedHistory.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No cross-bookmaker transfers recorded yet. Preview a booking code above to begin.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {mergedHistory.slice(0, 15).map((item) => {
              const badge = STATUS_BADGE_MAP[item.status] || STATUS_BADGE_MAP.READY_TO_REVIEW;
              return (
                <div
                  key={item.transferId}
                  className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {item.sourceBookmaker === 'SPORTYBET_TZ' ? 'SportyBet' : 'betPawa'} →{' '}
                        {item.targetBookmaker === 'BETPAWA_TZ' ? 'betPawa' : 'SportyBet'}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${badge.classes}`}
                      >
                        {badge.label}
                      </span>
                      <span className="font-mono text-slate-500">
                        {formatDateTimeCompact(item.createdAt)}
                      </span>
                    </div>
                    <div className="text-slate-600 dark:text-slate-400">
                      Source: <span className="font-mono">{item.originalCode}</span> · Matched{' '}
                      <span className="font-mono tabular-nums">
                        {item.matchedCount}/{item.originalSelectionCount}
                      </span>{' '}
                      · Odds{' '}
                      <span className="font-mono tabular-nums">
                        {item.originalCombinedOdds.toFixed(2)}x →{' '}
                        {item.targetCombinedOdds ? `${item.targetCombinedOdds.toFixed(2)}x` : '—'}
                      </span>
                    </div>
                    {item.errorMessage && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-300 truncate max-w-xl">
                        {item.errorMessage}
                      </p>
                    )}
                  </div>

                  {item.targetBookingCode && (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-300">
                        {item.targetBookingCode}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void handleCopy(item.targetBookingCode || '', item.transferId)
                        }
                        className="p-1.5 rounded border border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        title="Copy target booking code"
                      >
                        <ClipboardCopy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
