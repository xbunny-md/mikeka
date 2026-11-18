import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  Check,
  Database,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldBan,
  ShieldCheck,
  Square,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { ProtectedRouteGate } from '../components/ProtectedRouteGate.tsx';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import { apiClient } from '../services/apiClient.ts';
import type {
  BackendLogEntry,
  BookmakerId,
  CanonicalMarketId,
  CanonicalMarketInfo,
  DailyFactoryConfig,
  ManagedUserAccessRecord,
  MarketCatalogItem,
  OddsCategoryConfig,
  PlatformSettings,
  TransferHistoryEntry,
} from '../types/sportybet.ts';
import { isDisallowedDailyFeedMarket } from '../utils/dailyFeedFilter.ts';
import { formatDateTimeCompact } from '../utils/formatters.ts';

type AdminTab = 'factory' | 'integrations' | 'transfers' | 'users' | 'logs';

export function AdminControlCenterPage() {
  const { user, isAdmin, cloudAdminLogs, getIdToken } = useFirebase();
  const {
    markets,
    bookmakers,
    factoryConfig,
    schedulerStatus,
    automationLogs,
    portfolioTickets,
    runningFactory,
    trackingResults,
    retryingCodes,
    loadAdminFactoryState,
    saveFactoryConfig,
    toggleAutomation,
    runFactoryNow,
    trackAllResultsNow,
    retryFailedBookingCodes,
    deletePortfolioTicket,
    createBookingCodeForTicket,
    openTicketDetails,
    refreshPlatformStatus,
  } = useOddsHunter();

  const [activeTab, setActiveTab] = useState<AdminTab>('factory');

  // Daily Factory state
  const [draft, setDraft] = useState<DailyFactoryConfig>(factoryConfig);
  const [factoryMarkets, setFactoryMarkets] = useState<MarketCatalogItem[]>(markets);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Platform Integrations, Transfers, Users & Backend Logs state
  const [platformDraft, setPlatformDraft] = useState<PlatformSettings | null>(null);
  const [canonicalMarkets, setCanonicalMarkets] = useState<CanonicalMarketInfo[]>([]);
  const [transferHistory, setTransferHistory] = useState<TransferHistoryEntry[]>([]);
  const [transferStatusFilter, setTransferStatusFilter] = useState<string>('ALL');
  const [managedUsers, setManagedUsers] = useState<ManagedUserAccessRecord[]>([]);
  const [backendLogs, setBackendLogs] = useState<BackendLogEntry[]>([]);
  const [logCategoryFilter, setLogCategoryFilter] = useState<string>('ALL');
  const [logLevelFilter, setLogLevelFilter] = useState<string>('ALL');
  const [firebaseMeta, setFirebaseMeta] = useState<{
    projectId: string;
    firestoreDatabaseId: string;
    adminIamConfigured: boolean;
  } | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [savingPlatform, setSavingPlatform] = useState(false);

  useEffect(() => {
    setDraft(factoryConfig);
  }, [factoryConfig]);

  const loadExtendedOverview = useCallback(async () => {
    if (!isAdmin) return;
    const token = await getIdToken();
    if (!token) return;
    setLoadingOverview(true);
    try {
      const ov = await apiClient.getAdminOverview(token);
      setPlatformDraft(ov.platformSettings);
      setCanonicalMarkets(ov.canonicalMarkets);
      setTransferHistory(ov.transferHistory);
      setManagedUsers(ov.managedUsers);
      setBackendLogs(ov.backendLogs);
      setFirebaseMeta(ov.firebaseMeta);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to load platform integration overview.'
      );
    } finally {
      setLoadingOverview(false);
    }
  }, [getIdToken, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      void loadAdminFactoryState();
      void loadExtendedOverview();
    }
  }, [isAdmin, loadAdminFactoryState, loadExtendedOverview]);

  useEffect(() => {
    const bm = draft.activeBookmaker || 'SPORTYBET_TZ';
    apiClient
      .getMarkets(bm)
      .then((res) => setFactoryMarkets(res.markets))
      .catch(() => setFactoryMarkets(markets));
  }, [draft.activeBookmaker, markets]);

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      await saveFactoryConfig(draft);
      setFeedback('Daily Factory configuration updated and active.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMode = async (mode: 'start' | 'stop' | 'pause' | 'resume') => {
    setErrorMsg(null);
    setFeedback(null);
    try {
      await toggleAutomation(mode);
      setFeedback(`Automation state updated (${mode.toUpperCase()}).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update automation state.');
    }
  };

  const handleSavePlatformSettings = async () => {
    if (!platformDraft) return;
    setSavingPlatform(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Missing Firebase ID token.');
      const res = await apiClient.updatePlatformSettings(
        {
          sportybetEnabled: platformDraft.sportybetEnabled,
          betpawaEnabled: platformDraft.betpawaEnabled,
          crossTransferEnabled: platformDraft.crossTransferEnabled,
          supportedTransferMarkets: platformDraft.supportedTransferMarkets,
        },
        token
      );
      setPlatformDraft(res.platformSettings);
      await refreshPlatformStatus();
      await loadExtendedOverview();
      setFeedback('Platform integration & transfer settings saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update platform settings.');
    } finally {
      setSavingPlatform(false);
    }
  };

  const handleToggleTransferMarket = (marketId: CanonicalMarketId) => {
    if (!platformDraft) return;
    const exists = platformDraft.supportedTransferMarkets.includes(marketId);
    if (exists && platformDraft.supportedTransferMarkets.length <= 1) return;
    const next = exists
      ? platformDraft.supportedTransferMarkets.filter((m) => m !== marketId)
      : [...platformDraft.supportedTransferMarkets, marketId];
    setPlatformDraft({ ...platformDraft, supportedTransferMarkets: next });
  };

  const handleUpdateUser = async (
    uid: string,
    updates: { role?: 'USER' | 'ADMIN'; disabled?: boolean }
  ) => {
    setErrorMsg(null);
    setFeedback(null);
    try {
      const token = await getIdToken();
      if (!token) throw new Error('Missing Firebase ID token.');
      const res = await apiClient.updateUserAccess(uid, updates, token);
      setManagedUsers((prev) => prev.map((u) => (u.uid === uid ? res.user : u)));
      setFeedback(`Updated access controls for ${res.user.email}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update user access.');
    }
  };

  const updateCategoryField = (
    idx: number,
    field: keyof OddsCategoryConfig,
    value: string | number
  ) => {
    setDraft((prev) => {
      const nextCats = [...prev.oddsCategories];
      nextCats[idx] = { ...nextCats[idx], [field]: value };
      return { ...prev, oddsCategories: nextCats };
    });
  };

  const addCategory = () => {
    setDraft((prev) => ({
      ...prev,
      oddsCategories: [
        ...prev.oddsCategories,
        {
          id: `cat_${Date.now().toString(36)}`,
          label: '20.00–35.00',
          minCombinedOdds: 20,
          maxCombinedOdds: 35,
          targetCombinedOdds: 25,
          weight: 10,
        },
      ],
    }));
  };

  const removeCategory = (idx: number) => {
    setDraft((prev) => {
      if (prev.oddsCategories.length <= 1) return prev;
      return {
        ...prev,
        oddsCategories: prev.oddsCategories.filter((_, i) => i !== idx),
      };
    });
  };

  const toggleMarketId = (marketId: string) => {
    setDraft((prev) => {
      const exists = prev.markets.includes(marketId);
      const next = exists
        ? prev.markets.filter((m) => m !== marketId)
        : [...prev.markets, marketId];
      return { ...prev, markets: next };
    });
  };

  const filteredTransfers = useMemo(() => {
    if (transferStatusFilter === 'ALL') return transferHistory;
    return transferHistory.filter((t) => t.status === transferStatusFilter);
  }, [transferHistory, transferStatusFilter]);

  const filteredLogs = useMemo(() => {
    return backendLogs.filter((l) => {
      if (logCategoryFilter !== 'ALL' && l.category !== logCategoryFilter) return false;
      if (logLevelFilter !== 'ALL' && l.level !== logLevelFilter) return false;
      return true;
    });
  }, [backendLogs, logCategoryFilter, logLevelFilter]);

  const failedCodeTickets = portfolioTickets.filter((t) => !t.shareCode);
  const draftBookmakerLabel =
    (draft.activeBookmaker || 'SPORTYBET_TZ') === 'BETPAWA_TZ' ? 'betPawa TZ' : 'SportyBet TZ';

  return (
    <ProtectedRouteGate
      requireVerifiedEmail
      requireAdmin
      title="Administrator Authorization Required"
      description="Global Daily Factory controls, platform integrations, cross-bookmaker transfer monitoring, and user role management are restricted to authorized platform administrators."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              Authorized Admin · {user?.email}
            </span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Admin Control Center
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Manage Daily Factory automation, bookmaker integrations, cross-bookmaker transfers,
              user permissions, and backend audit logs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={runningFactory}
              onClick={() => void runFactoryNow()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-semibold text-white whitespace-nowrap"
            >
              <Zap className={`w-3.5 h-3.5 ${runningFactory ? 'animate-pulse' : ''}`} />
              <span>{runningFactory ? 'Running Factory...' : 'Manual Trigger Now'}</span>
            </button>

            <button
              type="button"
              disabled={trackingResults}
              onClick={() => void trackAllResultsNow()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-[#111827] dark:hover:bg-[#1A2438] border dark:border-white/10 text-xs font-medium dark:text-slate-200 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${trackingResults ? 'animate-spin' : ''}`} />
              <span>Settle All Results</span>
            </button>

            <button
              type="button"
              disabled={retryingCodes}
              onClick={() => void retryFailedBookingCodes()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700 dark:bg-emerald-600/20 dark:hover:bg-emerald-600/30 border dark:border-emerald-500/35 text-xs font-medium dark:text-emerald-200 whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${retryingCodes ? 'animate-spin' : ''}`} />
              <span>Retry Failed Codes ({failedCodeTickets.length})</span>
            </button>
          </div>
        </div>

        {/* Admin Section Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.08] w-fit">
          {(
            [
              { id: 'factory', label: 'Daily Factory', icon: ShieldCheck },
              { id: 'integrations', label: 'Integrations & Markets', icon: Database },
              { id: 'transfers', label: `Transfers (${transferHistory.length})`, icon: ArrowLeftRight },
              { id: 'users', label: `Users & Roles (${managedUsers.length})`, icon: Users },
              { id: 'logs', label: 'Backend & Auth Logs', icon: Activity },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-white dark:bg-[#161F30] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className="rounded-lg bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 border dark:border-emerald-500/30 px-4 py-2.5 text-xs dark:text-emerald-200">
            {feedback}
          </div>
        )}
        {errorMsg && (
          <div className="rounded-lg bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 border dark:border-rose-500/30 px-4 py-2.5 text-xs dark:text-rose-200">
            {errorMsg}
          </div>
        )}

        {/* TAB 1: DAILY FACTORY (Preserved) */}
        {activeTab === 'factory' && (
          <div className="space-y-6">
            {/* Scheduler Lifecycle Bar */}
            <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-5 flex flex-wrap items-center justify-between gap-4 shadow-xs dark:shadow-none">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Scheduler State</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {!factoryConfig.enabled
                      ? 'STOPPED'
                      : factoryConfig.paused
                        ? 'PAUSED'
                        : 'ACTIVE'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Today&apos;s Tickets</span>
                  <span className="font-mono font-semibold text-blue-700 dark:text-blue-300 tabular-nums">
                    {schedulerStatus?.totalDailyTicketsToday ?? 0} /{' '}
                    {factoryConfig.dailyTicketTarget}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Last Run</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {schedulerStatus?.lastFactoryRunAt
                      ? formatDateTimeCompact(schedulerStatus.lastFactoryRunAt)
                      : 'Pending'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Next Run</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {schedulerStatus?.nextFactoryRunAt
                      ? formatDateTimeCompact(schedulerStatus.nextFactoryRunAt)
                      : 'Manual / Paused'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleMode('start')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700 dark:bg-emerald-600/20 dark:hover:bg-emerald-600/30 border dark:border-emerald-500/35 text-xs font-medium dark:text-emerald-200 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleToggleMode(factoryConfig.paused ? 'resume' : 'pause')
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700 dark:bg-amber-500/15 dark:hover:bg-amber-500/25 border dark:border-amber-500/35 text-xs font-medium dark:text-amber-200 whitespace-nowrap"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>{factoryConfig.paused ? 'Resume' : 'Pause'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleMode('stop')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700 dark:bg-rose-500/15 dark:hover:bg-rose-500/25 border dark:border-rose-500/35 text-xs font-medium dark:text-rose-200 whitespace-nowrap"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>
              </div>
            </section>

            {/* Global Generation Configuration */}
            <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-5 space-y-5 shadow-xs dark:shadow-none">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.06] pb-3">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Global Daily Generation Rules
                </h3>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-semibold text-white whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                <label className="space-y-1">
                  <span className="text-slate-600 dark:text-slate-400 block">
                    Daily Factory Bookmaker
                  </span>
                  <select
                    value={draft.activeBookmaker || 'SPORTYBET_TZ'}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        activeBookmaker: e.target.value as BookmakerId,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                  >
                    {bookmakers.map((bm) => (
                      <option key={bm.id} value={bm.id}>
                        {bm.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600 dark:text-slate-400 block">
                    Min Individual Odds
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="1.01"
                    max="50"
                    value={draft.minIndividualOdds}
                    onChange={(e) =>
                      setDraft({ ...draft, minIndividualOdds: Number(e.target.value) || 1.01 })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600 dark:text-slate-400 block">
                    Max Individual Odds
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="1.01"
                    max="100"
                    value={draft.maxIndividualOdds}
                    onChange={(e) =>
                      setDraft({ ...draft, maxIndividualOdds: Number(e.target.value) || 1.25 })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600 dark:text-slate-400 block">
                    Daily Ticket Target
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={draft.dailyTicketTarget}
                    onChange={(e) =>
                      setDraft({ ...draft, dailyTicketTarget: Number(e.target.value) || 55 })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600 dark:text-slate-400 block">Max Daily Cap</span>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={draft.maxTickets}
                    onChange={(e) =>
                      setDraft({ ...draft, maxTickets: Number(e.target.value) || 100 })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600 dark:text-slate-400 block">
                    Min Selections / Ticket
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="25"
                    value={draft.minSelections}
                    onChange={(e) =>
                      setDraft({ ...draft, minSelections: Number(e.target.value) || 2 })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600 dark:text-slate-400 block">
                    Max Selections / Ticket
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="25"
                    value={draft.maxSelections}
                    onChange={(e) =>
                      setDraft({ ...draft, maxSelections: Number(e.target.value) || 15 })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600 dark:text-slate-400 block">
                    Schedule Interval (Min)
                  </span>
                  <input
                    type="number"
                    min="5"
                    max="1440"
                    value={draft.scheduleIntervalMinutes}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        scheduleIntervalMinutes: Number(e.target.value) || 60,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-600 dark:text-slate-400 block">Match Date Scope</span>
                  <select
                    value={draft.datePreset}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        datePreset: e.target.value as 'TODAY' | 'TOMORROW' | 'CUSTOM',
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#090D16] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                  >
                    <option value="TODAY">Today (Dar es Salaam)</option>
                    <option value="TOMORROW">Tomorrow</option>
                    <option value="CUSTOM">Custom Range</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-6 text-xs pt-1">
                <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.autoCreateBookingCodes}
                    onChange={(e) =>
                      setDraft({ ...draft, autoCreateBookingCodes: e.target.checked })
                    }
                    className="rounded border-slate-300 dark:border-white/20 bg-white dark:bg-[#090D16]"
                  />
                  <span>Automatically Create {draftBookmakerLabel} Booking Codes</span>
                </label>
                <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.duplicatePrevention}
                    onChange={(e) =>
                      setDraft({ ...draft, duplicatePrevention: e.target.checked })
                    }
                    className="rounded border-slate-300 dark:border-white/20 bg-white dark:bg-[#090D16]"
                  />
                  <span>Strict Duplicate Ticket Signature Guard</span>
                </label>
                <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.anyMarket}
                    onChange={(e) => setDraft({ ...draft, anyMarket: e.target.checked })}
                    className="rounded border-slate-300 dark:border-white/20 bg-white dark:bg-[#090D16]"
                  />
                  <span>Allow Any Eligible {draftBookmakerLabel} Market</span>
                </label>
              </div>

              {!draft.anyMarket && factoryMarkets.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      Included Markets ({draftBookmakerLabel})
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Double Chance 1X &amp; X2 (2X) are active; Home/Away (12), 1X2, and DNB are excluded.
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {factoryMarkets
                      .filter((m) => !isDisallowedDailyFeedMarket(m.id, m.name))
                      .map((m) => {
                        const selected = draft.markets.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleMarketId(m.id)}
                            className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                              selected
                                ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-600/20 dark:border-blue-500/40 dark:text-blue-200'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-[#090D16] dark:border-white/10 dark:text-slate-400 dark:hover:text-white'
                            }`}
                          >
                            {m.name}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Odds Categories Editor */}
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Target Odds Categories
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Daily tickets are distributed proportionally across these combined odds tiers.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addCategory}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 dark:bg-[#090D16] dark:hover:bg-[#161F30] border dark:border-white/10 text-xs dark:text-slate-200"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Tier</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {draft.oddsCategories.map((cat, idx) => (
                    <div
                      key={cat.id}
                      className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end bg-slate-50 dark:bg-[#090D16] p-3 rounded-lg border border-slate-200 dark:border-white/[0.06] text-xs"
                    >
                      <label className="space-y-1">
                        <span className="text-[10px] text-slate-500 block">Label</span>
                        <input
                          type="text"
                          value={cat.label}
                          onChange={(e) => updateCategoryField(idx, 'label', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] text-slate-500 block">Min Combined</span>
                        <input
                          type="number"
                          step="0.1"
                          value={cat.minCombinedOdds}
                          onChange={(e) =>
                            updateCategoryField(
                              idx,
                              'minCombinedOdds',
                              Number(e.target.value) || 1.1
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] text-slate-500 block">Max Combined</span>
                        <input
                          type="number"
                          step="0.1"
                          value={cat.maxCombinedOdds}
                          onChange={(e) =>
                            updateCategoryField(
                              idx,
                              'maxCombinedOdds',
                              Number(e.target.value) || 2.0
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] text-slate-500 block">Target</span>
                        <input
                          type="number"
                          step="0.1"
                          value={cat.targetCombinedOdds}
                          onChange={(e) =>
                            updateCategoryField(
                              idx,
                              'targetCombinedOdds',
                              Number(e.target.value) || 1.5
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] text-slate-500 block">Weight %</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={cat.weight}
                          onChange={(e) =>
                            updateCategoryField(idx, 'weight', Number(e.target.value) || 10)
                          }
                          className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-mono"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeCategory(idx)}
                        disabled={draft.oddsCategories.length <= 1}
                        className="px-2.5 py-1.5 rounded bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/20 inline-flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Published Tickets Admin Table & Audit Logs */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-xs dark:shadow-none">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.07] flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Published Tickets Moderation ({portfolioTickets.length})
                  </h3>
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {portfolioTickets.slice(0, 40).map((t) => (
                    <div
                      key={t.internalTicketId}
                      className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => openTicketDetails(t.internalTicketId)}
                        className="text-left min-w-0 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        <div className="font-mono font-semibold text-slate-900 dark:text-white truncate">
                          {t.internalTicketId} · {t.actualCombinedOdds.toFixed(2)}x (
                          {t.categoryLabel})
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {t.bookmakerId === 'BETPAWA_TZ' ? 'betPawa TZ' : 'SportyBet TZ'} ·{' '}
                          {t.status} ·{' '}
                          {t.shareCode ? `Code: ${t.shareCode}` : t.bookingCodeError || 'No code'}
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!t.shareCode && (
                          <button
                            type="button"
                            onClick={() =>
                              void createBookingCodeForTicket(t.internalTicketId).catch(() => {})
                            }
                            className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 text-[10px]"
                          >
                            Retry Code
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void deletePortfolioTicket(t.internalTicketId)}
                          className="p-1.5 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                          title="Delete ticket"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-xs dark:shadow-none">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.07]">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Automation &amp; Admin Audit Logs
                  </h3>
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {automationLogs.length === 0 && cloudAdminLogs.length === 0 ? (
                    <div className="p-6 text-xs text-slate-500 text-center">
                      No audit logs recorded yet.
                    </div>
                  ) : (
                    automationLogs.slice(0, 30).map((log) => (
                      <div key={log.logId} className="px-4 py-3 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">
                            {log.actionType} · {log.status}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {formatDateTimeCompact(log.finishedAt)}
                          </span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300">{log.message}</p>
                        <div className="font-mono text-[10px] text-slate-500">
                          Generated: {log.ticketsGenerated} · Codes: {log.codesCreated} · Code Fails:{' '}
                          {log.codeFailures} · Settled: {log.ticketsSettled}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: INTEGRATIONS & TRANSFER MARKETS */}
        {activeTab === 'integrations' && (
          <div className="space-y-6">
            <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-6 space-y-5 shadow-xs dark:shadow-none">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.06] pb-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Bookmaker &amp; Transfer Integration Controls
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Enable or pause upstream bookmaker feeds and configure allowed markets for
                    Cross-Bookmaker Bet Transfer.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingPlatform || !platformDraft}
                  onClick={() => void handleSavePlatformSettings()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingPlatform ? 'Saving...' : 'Save Integration Settings'}</span>
                </button>
              </div>

              {loadingOverview && !platformDraft ? (
                <div className="text-xs text-slate-500 py-4">Loading platform settings...</div>
              ) : platformDraft ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <label className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.08] flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-white block">
                          SportyBet Tanzania
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          Allow live/upcoming feeds, scanner, and booking codes.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={platformDraft.sportybetEnabled}
                        onChange={(e) =>
                          setPlatformDraft({
                            ...platformDraft,
                            sportybetEnabled: e.target.checked,
                          })
                        }
                        className="mt-0.5 rounded border-slate-300 dark:border-white/20"
                      />
                    </label>

                    <label className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.08] flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-white block">
                          betPawa Tanzania
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          Allow betPawa v4 sportsbook feed and booking numbers.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={platformDraft.betpawaEnabled}
                        onChange={(e) =>
                          setPlatformDraft({
                            ...platformDraft,
                            betpawaEnabled: e.target.checked,
                          })
                        }
                        className="mt-0.5 rounded border-slate-300 dark:border-white/20"
                      />
                    </label>

                    <label className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.08] flex items-start justify-between gap-3 cursor-pointer">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-white block">
                          Cross-Bookmaker Bet Transfer
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          Master switch for SportyBet ↔ betPawa code matching.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={platformDraft.crossTransferEnabled}
                        onChange={(e) =>
                          setPlatformDraft({
                            ...platformDraft,
                            crossTransferEnabled: e.target.checked,
                          })
                        }
                        className="mt-0.5 rounded border-slate-300 dark:border-white/20"
                      />
                    </label>
                  </div>

                  <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        Supported Cross-Bookmaker Canonical Markets (
                        {platformDraft.supportedTransferMarkets.length} / {canonicalMarkets.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                      {canonicalMarkets.map((m) => {
                        const enabled = platformDraft.supportedTransferMarkets.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleToggleTransferMarket(m.id)}
                            className={`p-3 rounded-lg border text-left transition-colors flex items-start justify-between gap-2 ${
                              enabled
                                ? 'bg-blue-50 border-blue-300 text-blue-900 dark:bg-blue-600/15 dark:border-blue-500/40 dark:text-blue-200'
                                : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-[#0B101B] dark:border-white/10 dark:text-slate-400'
                            }`}
                          >
                            <div>
                              <div className="font-semibold">{m.label}</div>
                              <div className="text-[11px] opacity-80">{m.settlementRule}</div>
                            </div>
                            {enabled && <Check className="w-4 h-4 shrink-0 mt-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </section>

            {/* Firebase Admin Health Box */}
            {firebaseMeta && (
              <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-5 flex flex-wrap items-center justify-between gap-4 text-xs shadow-xs dark:shadow-none">
                <div className="space-y-1">
                  <h4 className="font-semibold text-slate-900 dark:text-white">
                    Firebase Backend Verification &amp; Admin SDK Status
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400">
                    Project <span className="font-mono">{firebaseMeta.projectId}</span> · Database{' '}
                    <span className="font-mono">{firebaseMeta.firestoreDatabaseId}</span>
                  </p>
                </div>
                <span
                  className={`font-mono font-semibold ${
                    firebaseMeta.adminIamConfigured
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {firebaseMeta.adminIamConfigured
                    ? 'Service Account Credentials Active'
                    : 'Token Verification via Firebase Public Keys (Add FIREBASE_SERVICE_ACCOUNT_JSON for Admin Firestore)'}
                </span>
              </section>
            )}
          </div>
        )}

        {/* TAB 3: TRANSFERS & FAILURES */}
        {activeTab === 'transfers' && (
          <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-xs dark:shadow-none">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Cross-Bookmaker Transfer Audit ({filteredTransfers.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Review completed transfers, partially matched slips, manual import fallbacks, and
                  failed booking code attempts.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={transferStatusFilter}
                  onChange={(e) => setTransferStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="TRANSFERRED">Transferred</option>
                  <option value="PARTIALLY_MATCHED">Partially Matched</option>
                  <option value="MANUAL_IMPORT_REQUIRED">Manual Import Required</option>
                  <option value="UNAVAILABLE_SELECTIONS">Unavailable Selections</option>
                  <option value="FAILED">Failed Transfers</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadExtendedOverview()}
                  className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
                  title="Refresh transfer logs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {filteredTransfers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No cross-bookmaker transfers matching filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#0B101B] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.06]">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Time</th>
                      <th className="px-4 py-2.5 font-medium">Direction</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Source → Target</th>
                      <th className="px-4 py-2.5 font-medium">Legs / Odds</th>
                      <th className="px-4 py-2.5 font-medium">Actor</th>
                      <th className="px-4 py-2.5 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                    {filteredTransfers.map((tr) => (
                      <tr key={tr.transferId}>
                        <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                          {formatDateTimeCompact(tr.createdAt)}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                          {tr.sourceBookmaker === 'SPORTYBET_TZ' ? 'SportyBet → betPawa' : 'betPawa → SportyBet'}
                        </td>
                        <td className="px-4 py-2.5 font-mono whitespace-nowrap">{tr.status}</td>
                        <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                          {tr.originalCode} → {tr.targetBookingCode || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono tabular-nums whitespace-nowrap">
                          {tr.matchedCount}/{tr.originalSelectionCount} ·{' '}
                          {tr.originalCombinedOdds.toFixed(2)}x →{' '}
                          {tr.targetCombinedOdds ? `${tr.targetCombinedOdds.toFixed(2)}x` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 truncate max-w-[160px]">
                          {tr.actorEmail || 'Guest'}
                        </td>
                        <td className="px-4 py-2.5 text-rose-600 dark:text-rose-300 truncate max-w-[240px]">
                          {tr.errorMessage || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 4: USERS & ROLES */}
        {activeTab === 'users' && (
          <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-xs dark:shadow-none">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Authenticated Accounts &amp; RBAC ({managedUsers.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Manage backend role assignments and disable or re-enable accounts interacting with
                  the API.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadExtendedOverview()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? 'animate-spin' : ''}`} />
                <span>Refresh Users</span>
              </button>
            </div>

            {managedUsers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No signed-in user sessions recorded on this server instance yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#0B101B] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/[0.06]">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">User</th>
                      <th className="px-4 py-2.5 font-medium">Email Status</th>
                      <th className="px-4 py-2.5 font-medium">Role</th>
                      <th className="px-4 py-2.5 font-medium">Account State</th>
                      <th className="px-4 py-2.5 font-medium">Last Seen</th>
                      <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                    {managedUsers.map((u) => (
                      <tr key={u.uid}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {u.displayName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">{u.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-medium ${
                              u.emailVerified
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {u.emailVerified ? 'Verified' : 'Unverified'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-white">
                          {u.role}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-medium ${
                              u.disabled
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {u.disabled ? 'Disabled' : 'Active'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                          {formatDateTimeCompact(u.lastSeenAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void handleUpdateUser(u.uid, {
                                  role: u.role === 'ADMIN' ? 'USER' : 'ADMIN',
                                })
                              }
                              className="px-2.5 py-1 rounded border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 whitespace-nowrap"
                            >
                              {u.role === 'ADMIN' ? 'Demote to User' : 'Promote to Admin'}
                            </button>
                            <button
                              type="button"
                              disabled={u.uid === user?.uid}
                              onClick={() =>
                                void handleUpdateUser(u.uid, { disabled: !u.disabled })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 disabled:opacity-40 whitespace-nowrap"
                            >
                              <ShieldBan className="w-3 h-3" />
                              <span>{u.disabled ? 'Enable' : 'Disable'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 5: BACKEND & AUTH LOGS */}
        {activeTab === 'logs' && (
          <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-xs dark:shadow-none">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Structured Backend, Auth &amp; Integration Logs ({filteredLogs.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Real-time server audit stream for authentication events, cron runs, transfer
                  matching, and admin updates.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={logCategoryFilter}
                  onChange={(e) => setLogCategoryFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200"
                >
                  <option value="ALL">All Categories</option>
                  <option value="AUTH">AUTH</option>
                  <option value="TRANSFER">TRANSFER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="CRON">CRON</option>
                  <option value="INTEGRATION">INTEGRATION</option>
                  <option value="API">API</option>
                </select>
                <select
                  value={logLevelFilter}
                  onChange={(e) => setLogLevelFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200"
                >
                  <option value="ALL">All Levels</option>
                  <option value="INFO">INFO</option>
                  <option value="WARN">WARN</option>
                  <option value="ERROR">ERROR</option>
                </select>
                <button
                  type="button"
                  onClick={() => void loadExtendedOverview()}
                  className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300"
                  title="Refresh logs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No structured logs match the selected filters.
              </div>
            ) : (
              <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.06]">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="px-5 py-3 text-xs flex flex-wrap items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`font-mono font-semibold ${
                            log.level === 'ERROR'
                              ? 'text-rose-700 dark:text-rose-400'
                              : log.level === 'WARN'
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-blue-700 dark:text-blue-300'
                          }`}
                        >
                          {log.level} · {log.category} · {log.event}
                        </span>
                        {log.actorEmail && (
                          <span className="font-mono text-[11px] text-slate-500">
                            {log.actorEmail}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">{log.message}</p>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500 shrink-0">
                      {formatDateTimeCompact(log.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </ProtectedRouteGate>
  );
}
