import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import {
  deleteFavoriteTicket,
  deletePublicTicketBundle,
  saveAdminAuditLogRecord,
  saveAdminSettingsRecord,
  saveBookingCodeRecord,
  saveFavoriteTicket,
  saveNotificationRecord,
  savePublicStatsRecord,
  saveScanHistoryRecord,
  syncPublicTicketBundle,
  updateUserPreferences,
  type AppNotificationRecord,
} from '../firebase/firestore/repository.ts';
import { apiClient } from '../services/apiClient.ts';
import {
  DEFAULT_ALLOWED_DAILY_FEED_MARKETS,
  isTicketAllowedInDailyFeed,
} from '../utils/dailyFeedFilter.ts';
import { getTodayInputDate } from '../utils/formatters.ts';
import type {
  AutomationJobLog,
  BetslipSelection,
  BetslipValidationResponse,
  BookmakerCatalogInfo,
  BookmakerId,
  BookingCodeResponse,
  DailyFactoryConfig,
  DiagnosticCheck,
  GeneratedTicket,
  LeagueDirectoryItem,
  MarketCatalogItem,
  NormalizedMatch,
  OddsCategoryConfig,
  PerformanceAnalyticsSummary,
  PlatformSettings,
  QualifyingSelection,
  ResearchReport,
  ScannerConfig,
  ScanResult,
  SchedulerStatus,
} from '../types/sportybet.ts';

const BOOKMAKER_STORAGE_KEY = 'odds_hunter_bookmaker';

export const DEFAULT_BOOKMAKER_LIST: BookmakerCatalogInfo[] = [
  {
    id: 'SPORTYBET_TZ',
    name: 'SportyBet Tanzania',
    shortName: 'SportyBet TZ',
    country: 'Tanzania',
    websiteUrl: 'https://www.sportybet.com/tz/m/',
    apiBaseUrl: 'https://www.sportybet.com/api/tz',
    bookingCodeSupported: true,
    bookingCodeMechanism: 'POST /api/tz/orders/share',
    notes: 'Full upcoming/live football odds and sharing codes.',
  },
  {
    id: 'BETPAWA_TZ',
    name: 'betPawa Tanzania',
    shortName: 'betPawa TZ',
    country: 'Tanzania',
    websiteUrl: 'https://www.betpawa.co.tz/bets',
    apiBaseUrl: 'https://www.betpawa.co.tz/api/sportsbook',
    bookingCodeSupported: true,
    bookingCodeMechanism: 'POST /api/sportsbook/v3/booking-number',
    notes: 'Isolated betPawa TZ v4 sportsbook feed and native booking numbers.',
  },
];

function readStoredBookmaker(): BookmakerId {
  try {
    const saved = window.localStorage.getItem(BOOKMAKER_STORAGE_KEY);
    return saved === 'BETPAWA_TZ' ? 'BETPAWA_TZ' : 'SPORTYBET_TZ';
  } catch {
    return 'SPORTYBET_TZ';
  }
}

export type NavSection =
  | 'feed'
  | 'ticket-details'
  | 'transfer'
  | 'stats'
  | 'favorites'
  | 'admin-control'
  | 'live'
  | 'upcoming'
  | 'scanner'
  | 'filters'
  | 'betslip'
  | 'booking-codes'
  | 'history'
  | 'data-sources'
  | 'settings'
  | 'diagnostics';

const PATH_TO_SECTION: Record<string, NavSection> = {
  '/': 'feed',
  '/feed': 'feed',
  '/transfer': 'transfer',
  '/bet-transfer': 'transfer',
  '/stats': 'stats',
  '/favorites': 'favorites',
  '/admin': 'admin-control',
  '/admin-control': 'admin-control',
  '/live': 'live',
  '/upcoming': 'upcoming',
  '/scanner': 'scanner',
  '/filters': 'filters',
  '/betslip': 'betslip',
  '/booking-codes': 'booking-codes',
  '/history': 'history',
  '/data-sources': 'data-sources',
  '/settings': 'settings',
  '/diagnostics': 'diagnostics',
};

const SECTION_TO_PATH: Partial<Record<NavSection, string>> = {
  feed: '/',
  transfer: '/transfer',
  stats: '/stats',
  favorites: '/favorites',
  'admin-control': '/admin',
  live: '/live',
  upcoming: '/upcoming',
  scanner: '/scanner',
  filters: '/filters',
  betslip: '/betslip',
  'booking-codes': '/booking-codes',
  history: '/history',
  'data-sources': '/data-sources',
  settings: '/settings',
  diagnostics: '/diagnostics',
};

function readInitialSectionFromPath(): NavSection {
  try {
    const cleanPath = window.location.pathname.replace(/\/+$/, '') || '/';
    return PATH_TO_SECTION[cleanPath] || 'feed';
  } catch {
    return 'feed';
  }
}

export interface LocalNotification {
  id: string;
  type: AppNotificationRecord['type'];
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export const DEFAULT_ODDS_CATEGORIES_UI: OddsCategoryConfig[] = [
  {
    id: 'cat_2_3',
    label: '2.00–3.00',
    minCombinedOdds: 2.0,
    maxCombinedOdds: 3.0,
    targetCombinedOdds: 2.45,
    weight: 30,
  },
  {
    id: 'cat_3_5',
    label: '3.00–5.00',
    minCombinedOdds: 3.0,
    maxCombinedOdds: 5.0,
    targetCombinedOdds: 3.9,
    weight: 30,
  },
  {
    id: 'cat_5_10',
    label: '5.00–10.00',
    minCombinedOdds: 5.0,
    maxCombinedOdds: 10.0,
    targetCombinedOdds: 7.2,
    weight: 25,
  },
  {
    id: 'cat_10_20',
    label: '10.00–20.00',
    minCombinedOdds: 10.0,
    maxCombinedOdds: 20.0,
    targetCombinedOdds: 13.5,
    weight: 15,
  },
];

export const DEFAULT_FACTORY_CONFIG_UI: DailyFactoryConfig = {
  enabled: true,
  paused: false,
  activeBookmaker: 'SPORTYBET_TZ',
  minIndividualOdds: 1.01,
  maxIndividualOdds: 1.25,
  dailyTicketTarget: 55,
  maxTickets: 100,
  minSelections: 2,
  maxSelections: 15,
  sportIds: ['sr:sport:1'],
  markets: [...DEFAULT_ALLOWED_DAILY_FEED_MARKETS],
  anyMarket: false,
  leagues: [],
  datePreset: 'TODAY',
  customStartDate: '',
  customEndDate: '',
  windowStartTime: '00:00',
  windowEndTime: '23:59',
  timezone: 'Africa/Dar_es_Salaam',
  oddsCategories: DEFAULT_ODDS_CATEGORIES_UI,
  duplicatePrevention: true,
  autoCreateBookingCodes: true,
  scheduleIntervalMinutes: 60,
};

interface OddsHunterContextValue {
  activeSection: NavSection;
  setActiveSection: (s: NavSection) => void;
  selectedTicketId: string | null;
  selectedTicket: GeneratedTicket | null;
  openTicketDetails: (internalTicketId: string) => void;
  closeTicketDetails: () => void;

  // Platform Enablement Status
  platformSettings: PlatformSettings | null;
  refreshPlatformStatus: () => Promise<void>;

  // Multi-Bookmaker Switching & Isolation
  bookmakers: BookmakerCatalogInfo[];
  activeBookmaker: BookmakerId;
  activeBookmakerInfo: BookmakerCatalogInfo;
  setActiveBookmaker: (id: BookmakerId) => void;

  markets: MarketCatalogItem[];
  leagues: LeagueDirectoryItem[];
  liveMatches: NormalizedMatch[];
  upcomingMatches: NormalizedMatch[];
  upcomingTotal: number;
  upcomingPage: number;
  loadingLive: boolean;
  loadingUpcoming: boolean;
  loadingLeagues: boolean;
  liveError: string | null;
  upcomingError: string | null;
  refreshLiveMatches: () => Promise<void>;
  loadUpcomingMatches: (pageNum?: number, todayGames?: boolean) => Promise<void>;
  selectedMatchId: string | null;
  openMatchDetail: (eventId: string) => void;
  closeMatchDetail: () => void;

  // Scanner
  scannerConfig: ScannerConfig;
  setScannerConfig: React.Dispatch<React.SetStateAction<ScannerConfig>>;
  resetScannerConfig: () => void;
  scanResult: ScanResult | null;
  setScanResult: React.Dispatch<React.SetStateAction<ScanResult | null>>;
  scanning: boolean;
  scanError: string | null;
  executeScan: (overrideConfig?: ScannerConfig) => Promise<ScanResult | null>;
  autoRescanSec: number;
  setAutoRescanSec: (sec: number) => void;

  // Betslip
  betslip: BetslipSelection[];
  stakeTzs: number;
  setStakeTzs: (stake: number) => void;
  addToBetslip: (sel: Omit<BetslipSelection, 'addedAt'>) => void;
  updateBetslipSelection: (
    oldSelectionKey: string,
    replacement: Omit<BetslipSelection, 'addedAt'>
  ) => void;
  acceptUpdatedOdds: (selectionKey: string, newOdds: number) => void;
  removeFromBetslip: (selectionKey: string) => void;
  replaceBetslip: (selections: BetslipSelection[]) => void;
  clearBetslip: () => void;
  validation: BetslipValidationResponse | null;
  validatingSlip: boolean;
  validateSlipNow: () => Promise<BetslipValidationResponse | null>;

  // Booking Codes
  latestBookingCode: BookingCodeResponse | null;
  generatingCode: boolean;
  codeError: string | null;
  generateBookingCode: () => Promise<BookingCodeResponse | null>;
  verifyAndLoadBookingCode: (
    code: string,
    loadIntoSlip?: boolean,
    targetBookmaker?: BookmakerId
  ) => Promise<BookingCodeResponse | null>;

  // Diagnostics & Research
  diagnostics: DiagnosticCheck[];
  diagnosticsCheckedAt: string | null;
  loadingDiagnostics: boolean;
  runDiagnosticsCheck: () => Promise<void>;
  researchReport: ResearchReport | null;

  // Notifications
  notifications: LocalNotification[];
  unreadCount: number;
  pushNotification: (
    type: AppNotificationRecord['type'],
    title: string,
    message: string
  ) => void;
  markLocalNotificationRead: (id: string) => void;

  // Public Daily Feed, Favorites & Admin Daily Factory Controls
  portfolioTickets: GeneratedTicket[];
  loadingPortfolio: boolean;
  refreshPortfolio: () => Promise<void>;
  isTicketFavorited: (internalTicketId: string) => boolean;
  toggleFavoriteTicket: (ticket: GeneratedTicket) => Promise<void>;
  analyticsSummary: PerformanceAnalyticsSummary | null;
  refreshAnalytics: () => Promise<void>;
  schedulerStatus: SchedulerStatus | null;
  refreshScheduler: () => Promise<void>;

  // Admin-Only State & Controls
  factoryConfig: DailyFactoryConfig;
  setFactoryConfig: React.Dispatch<React.SetStateAction<DailyFactoryConfig>>;
  automationLogs: AutomationJobLog[];
  loadingAdminState: boolean;
  runningFactory: boolean;
  trackingResults: boolean;
  retryingCodes: boolean;
  loadAdminFactoryState: () => Promise<void>;
  saveFactoryConfig: (cfg: DailyFactoryConfig) => Promise<void>;
  toggleAutomation: (mode: 'start' | 'stop' | 'pause' | 'resume') => Promise<void>;
  runFactoryNow: () => Promise<void>;
  deletePortfolioTicket: (internalTicketId: string) => Promise<void>;
  createBookingCodeForTicket: (internalTicketId: string) => Promise<GeneratedTicket | null>;
  retryFailedBookingCodes: (ticketIds?: string[]) => Promise<void>;
  trackAllResultsNow: (ticketIds?: string[]) => Promise<void>;
}

const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  minOdds: 1.01,
  maxOdds: 1.25,
  startDate: getTodayInputDate(0),
  endDate: getTodayInputDate(12),
  sportId: 'sr:sport:1',
  leagues: [],
  matchStatus: 'ALL',
  markets: ['10', '18'],
  maxResults: 100,
  searchQuery: '',
  sortBy: 'kickoff_asc',
};

const OddsHunterContext = createContext<OddsHunterContextValue | null>(null);

export function OddsHunterProvider({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, favoriteTickets, getIdToken, profile, openAuthModal } = useFirebase();

  const [activeSection, setActiveSectionState] = useState<NavSection>(readInitialSectionFromPath);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);

  const setActiveSection = useCallback((section: NavSection) => {
    setActiveSectionState(section);
    try {
      const targetPath = SECTION_TO_PATH[section];
      if (targetPath && window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath);
      }
    } catch {
      // Ignore history error in restricted sandboxes
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setActiveSectionState(readInitialSectionFromPath());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [bookmakers, setBookmakers] = useState<BookmakerCatalogInfo[]>(DEFAULT_BOOKMAKER_LIST);
  const [activeBookmaker, setActiveBookmakerState] = useState<BookmakerId>(readStoredBookmaker);
  const lastHydratedBookmakerUidRef = useRef<string | null>(null);

  const activeBookmakerInfo =
    bookmakers.find((b) => b.id === activeBookmaker) || DEFAULT_BOOKMAKER_LIST[0];

  const [markets, setMarkets] = useState<MarketCatalogItem[]>([]);
  const [leagues, setLeagues] = useState<LeagueDirectoryItem[]>([]);
  const [liveMatches, setLiveMatches] = useState<NormalizedMatch[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<NormalizedMatch[]>([]);
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [upcomingPage, setUpcomingPage] = useState(1);

  const [loadingLive, setLoadingLive] = useState(false);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);

  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const [scannerConfig, setScannerConfig] = useState<ScannerConfig>(() => ({
    ...DEFAULT_SCANNER_CONFIG,
    bookmakerId: readStoredBookmaker(),
    markets: readStoredBookmaker() === 'BETPAWA_TZ' ? ['4693', '5000'] : ['10', '18'],
  }));
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [autoRescanSec, setAutoRescanSec] = useState(0);

  const [betslip, setBetslip] = useState<BetslipSelection[]>([]);
  const [stakeTzs, setStakeTzs] = useState(10000);
  const [validation, setValidation] = useState<BetslipValidationResponse | null>(null);
  const [validatingSlip, setValidatingSlip] = useState(false);

  const [latestBookingCode, setLatestBookingCode] = useState<BookingCodeResponse | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [diagnostics, setDiagnostics] = useState<DiagnosticCheck[]>([]);
  const [diagnosticsCheckedAt, setDiagnosticsCheckedAt] = useState<string | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [researchReport, setResearchReport] = useState<ResearchReport | null>(null);

  const [notifications, setNotifications] = useState<LocalNotification[]>([]);

  // Shared Daily Factory Feed & Analytics
  const [portfolioTickets, setPortfolioTickets] = useState<GeneratedTicket[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [analyticsSummary, setAnalyticsSummary] = useState<PerformanceAnalyticsSummary | null>(
    null
  );
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);

  // Admin-Only State
  const [factoryConfig, setFactoryConfig] = useState<DailyFactoryConfig>(
    DEFAULT_FACTORY_CONFIG_UI
  );
  const [automationLogs, setAutomationLogs] = useState<AutomationJobLog[]>([]);
  const [loadingAdminState, setLoadingAdminState] = useState(false);
  const [runningFactory, setRunningFactory] = useState(false);
  const [trackingResults, setTrackingResults] = useState(false);
  const [retryingCodes, setRetryingCodes] = useState(false);

  const refreshPlatformStatus = useCallback(async () => {
    try {
      const res = await apiClient.getPlatformStatus();
      setPlatformSettings(res.settings);
    } catch {
      // Non-fatal
    }
  }, []);

  const pushNotification = useCallback(
    (type: AppNotificationRecord['type'], title: string, message: string) => {
      const item: LocalNotification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        title,
        message,
        read: false,
        createdAt: new Date().toISOString(),
      };
      setNotifications((prev) => [item, ...prev].slice(0, 50));
      if (user && user.emailVerified) {
        void saveNotificationRecord(user.uid, { type, title, message }).catch(() => {});
      }
    },
    [user]
  );

  const markLocalNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  useEffect(() => {
    if (profile) {
      setStakeTzs(profile.defaultStakeTzs);
      setAutoRescanSec(profile.autoScanIntervalSec);
      setScannerConfig((prev) => ({
        ...prev,
        minOdds: profile.defaultMinOdds,
        maxOdds: profile.defaultMaxOdds,
      }));
      if (
        user &&
        profile.preferredBookmaker &&
        (profile.preferredBookmaker === 'SPORTYBET_TZ' ||
          profile.preferredBookmaker === 'BETPAWA_TZ') &&
        lastHydratedBookmakerUidRef.current !== user.uid
      ) {
        lastHydratedBookmakerUidRef.current = user.uid;
        setActiveBookmakerState(profile.preferredBookmaker);
        try {
          window.localStorage.setItem(BOOKMAKER_STORAGE_KEY, profile.preferredBookmaker);
        } catch {
          // Ignore storage error
        }
      }
    } else if (!user) {
      lastHydratedBookmakerUidRef.current = null;
    }
  }, [profile, user]);

  useEffect(() => {
    void refreshPlatformStatus();
    apiClient
      .getBookmakers()
      .then((res) => {
        if (Array.isArray(res.bookmakers) && res.bookmakers.length > 0) {
          setBookmakers(res.bookmakers);
        }
      })
      .catch(() => {});
  }, [refreshPlatformStatus]);

  const setActiveBookmaker = useCallback(
    (nextId: BookmakerId) => {
      if (nextId === activeBookmaker) return;
      setActiveBookmakerState(nextId);
      try {
        window.localStorage.setItem(BOOKMAKER_STORAGE_KEY, nextId);
      } catch {
        // Ignore storage error
      }
      if (user && user.emailVerified) {
        lastHydratedBookmakerUidRef.current = user.uid;
        void updateUserPreferences(user.uid, { preferredBookmaker: nextId }).catch(() => {});
      }
      setScannerConfig((prev) => ({
        ...prev,
        bookmakerId: nextId,
        leagues: [],
        markets: nextId === 'BETPAWA_TZ' ? ['4693', '5000'] : ['10', '18'],
      }));
      setScanResult(null);
      setScanError(null);
      const nextInfo = bookmakers.find((b) => b.id === nextId) || DEFAULT_BOOKMAKER_LIST[0];
      pushNotification(
        'SCAN_COMPLETE',
        `Switched Bookmaker: ${nextInfo.shortName}`,
        `Active data source switched to ${nextInfo.name}. Existing daily tickets remain preserved.`
      );
    },
    [activeBookmaker, bookmakers, pushNotification, user]
  );

  const openTicketDetails = useCallback(
    (internalTicketId: string) => {
      setSelectedTicketId(internalTicketId);
      setActiveSection('ticket-details');
    },
    [setActiveSection]
  );

  const closeTicketDetails = useCallback(() => {
    setSelectedTicketId(null);
    setActiveSection('feed');
  }, [setActiveSection]);

  const selectedTicket =
    portfolioTickets.find((t) => t.internalTicketId === selectedTicketId) || null;

  const isTicketFavorited = useCallback(
    (internalTicketId: string) => {
      return favoriteTickets.some((f) => f.internalTicketId === internalTicketId);
    },
    [favoriteTickets]
  );

  const toggleFavoriteTicket = useCallback(
    async (ticket: GeneratedTicket) => {
      if (!user) {
        pushNotification(
          'SCAN_COMPLETE',
          'Sign In to Bookmark Tickets',
          'Sign in or create an account to save favorite daily tickets to your profile.'
        );
        openAuthModal('signin');
        return;
      }

      if (!user.emailVerified) {
        pushNotification(
          'INTEGRATION_ERROR',
          'Email Verification Required',
          'Verify your email address first to save bookmarks to your Firestore profile.'
        );
        return;
      }

      if (isTicketFavorited(ticket.internalTicketId)) {
        await deleteFavoriteTicket(user.uid, ticket.internalTicketId);
        pushNotification(
          'SCAN_COMPLETE',
          'Removed Favorite Ticket',
          `Ticket ${ticket.internalTicketId} removed from your favorites.`
        );
      } else {
        await saveFavoriteTicket(user.uid, ticket);
        pushNotification(
          'SCAN_COMPLETE',
          'Ticket Bookmarked',
          `Saved ticket ${ticket.internalTicketId} (${ticket.actualCombinedOdds.toFixed(
            2
          )} odds) to Favorites.`
        );
      }
    },
    [isTicketFavorited, openAuthModal, pushNotification, user]
  );

  const refreshLiveMatches = useCallback(async () => {
    setLoadingLive(true);
    setLiveError(null);
    try {
      const res = await apiClient.getLiveMatches(activeBookmaker);
      setLiveMatches(res.matches);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load live matches';
      setLiveError(msg);
    } finally {
      setLoadingLive(false);
    }
  }, [activeBookmaker]);

  const loadUpcomingMatches = useCallback(
    async (pageNum = 1, todayGames = false) => {
      setLoadingUpcoming(true);
      setUpcomingError(null);
      try {
        const res = await apiClient.getUpcomingMatches({
          pageNum,
          pageSize: 50,
          todayGames,
          bookmaker: activeBookmaker,
        });
        setUpcomingMatches(res.matches);
        setUpcomingTotal(res.totalAvailable);
        setUpcomingPage(res.pageNum);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load upcoming matches';
        setUpcomingError(msg);
      } finally {
        setLoadingUpcoming(false);
      }
    },
    [activeBookmaker]
  );

  const runDiagnosticsCheck = useCallback(async () => {
    setLoadingDiagnostics(true);
    try {
      const res = await apiClient.getDiagnostics(activeBookmaker);
      setDiagnostics(res.checks);
      setDiagnosticsCheckedAt(res.checkedAt);
    } catch (err) {
      pushNotification(
        'INTEGRATION_ERROR',
        'Diagnostics Probe Failed',
        err instanceof Error ? err.message : 'Unable to probe backend diagnostics.'
      );
    } finally {
      setLoadingDiagnostics(false);
    }
  }, [activeBookmaker, pushNotification]);

  const refreshPortfolio = useCallback(async () => {
    setLoadingPortfolio(true);
    try {
      const res = await apiClient.listTickets();
      setPortfolioTickets(res.tickets.filter((t) => isTicketAllowedInDailyFeed(t)));
    } catch {
      // Preserve last fetched feed on transient error
    } finally {
      setLoadingPortfolio(false);
    }
  }, []);

  const refreshAnalytics = useCallback(async () => {
    try {
      const summary = await apiClient.getPerformanceAnalytics();
      setAnalyticsSummary(summary);
    } catch {
      // Ignore transient analytics fetch error
    }
  }, []);

  const refreshScheduler = useCallback(async () => {
    try {
      const res = await apiClient.getSchedulerStatus();
      setSchedulerStatus(res.status);
    } catch {
      // Ignore transient scheduler fetch error
    }
  }, []);

  const loadAdminFactoryState = useCallback(async () => {
    if (!isAdmin) return;
    const token = await getIdToken();
    if (!token) return;
    setLoadingAdminState(true);
    try {
      const res = await apiClient.getDailyFactoryAdminState(token);
      setFactoryConfig(res.config);
      setSchedulerStatus(res.status);
      setAutomationLogs(res.logs);
    } catch (err) {
      pushNotification(
        'INTEGRATION_ERROR',
        'Admin State Load Error',
        err instanceof Error ? err.message : 'Unable to fetch Admin Control Center state.'
      );
    } finally {
      setLoadingAdminState(false);
    }
  }, [getIdToken, isAdmin, pushNotification]);

  useEffect(() => {
    apiClient
      .getMarkets(activeBookmaker)
      .then((res) => setMarkets(res.markets))
      .catch(() => {});
    apiClient
      .getResearchReport(activeBookmaker)
      .then((res) => setResearchReport(res))
      .catch(() => {});
    setLoadingLeagues(true);
    apiClient
      .getLeagues(activeBookmaker)
      .then((res) => setLeagues(res.leagues))
      .catch(() => {})
      .finally(() => setLoadingLeagues(false));

    void refreshLiveMatches();
    void loadUpcomingMatches(1, false);
    void runDiagnosticsCheck();
    void refreshPortfolio();
    void refreshAnalytics();
    void refreshScheduler();
  }, [
    activeBookmaker,
    refreshLiveMatches,
    loadUpcomingMatches,
    runDiagnosticsCheck,
    refreshPortfolio,
    refreshAnalytics,
    refreshScheduler,
  ]);

  useEffect(() => {
    if (isAdmin) {
      void loadAdminFactoryState();
    }
  }, [isAdmin, loadAdminFactoryState]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshPortfolio();
      void refreshAnalytics();
      void refreshScheduler();
    }, 30000);
    return () => clearInterval(timer);
  }, [refreshPortfolio, refreshAnalytics, refreshScheduler]);

  const executeScan = useCallback(
    async (overrideConfig?: ScannerConfig): Promise<ScanResult | null> => {
      const cfg: ScannerConfig = {
        ...(overrideConfig || scannerConfig),
        bookmakerId: (overrideConfig || scannerConfig).bookmakerId || activeBookmaker,
      };
      setScanning(true);
      setScanError(null);
      try {
        const result = await apiClient.runScanner(cfg);
        setScanResult(result);
        pushNotification(
          'SCAN_COMPLETE',
          `Scan Complete: ${result.qualifyingCount} Selections`,
          `Scanned ${result.totalMatchesScanned} matches on ${activeBookmakerInfo.shortName} (${cfg.minOdds.toFixed(
            2
          )}–${cfg.maxOdds.toFixed(2)}).`
        );
        if (user && user.emailVerified) {
          void saveScanHistoryRecord(user.uid, result).catch(() => {});
        }
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Odds scan failed';
        setScanError(msg);
        pushNotification('INTEGRATION_ERROR', 'Scanner Execution Failed', msg);
        return null;
      } finally {
        setScanning(false);
      }
    },
    [activeBookmaker, activeBookmakerInfo.shortName, scannerConfig, pushNotification, user]
  );

  useEffect(() => {
    if (!autoRescanSec || autoRescanSec < 15) return;
    const timer = setInterval(() => {
      void executeScan();
    }, autoRescanSec * 1000);
    return () => clearInterval(timer);
  }, [autoRescanSec, executeScan]);

  const resetScannerConfig = useCallback(() => {
    setScannerConfig({
      ...DEFAULT_SCANNER_CONFIG,
      bookmakerId: activeBookmaker,
      markets: activeBookmaker === 'BETPAWA_TZ' ? ['4693', '5000'] : ['10', '18'],
      startDate: getTodayInputDate(0),
      endDate: getTodayInputDate(12),
    });
  }, [activeBookmaker]);

  const addToBetslip = useCallback(
    (sel: Omit<BetslipSelection, 'addedAt'>) => {
      const taggedSel: BetslipSelection = {
        ...sel,
        bookmakerId: sel.bookmakerId || activeBookmaker,
        bookmakerName: sel.bookmakerName || activeBookmakerInfo.name,
        addedAt: new Date().toISOString(),
      };
      let rejectedReason: string | null = null;

      setBetslip((prev) => {
        if (prev.length > 0) {
          const slipBk = prev[0].bookmakerId || 'SPORTYBET_TZ';
          if (slipBk !== taggedSel.bookmakerId) {
            const slipBkName =
              bookmakers.find((b) => b.id === slipBk)?.shortName || slipBk;
            rejectedReason = `Cannot mix ${taggedSel.bookmakerName} with existing ${slipBkName} selections on one betslip. Clear the betslip first.`;
            return prev;
          }
        }
        if (prev.some((p) => p.selectionKey === taggedSel.selectionKey)) {
          return prev;
        }
        return [...prev, taggedSel];
      });

      if (rejectedReason) {
        pushNotification('INTEGRATION_ERROR', 'Platform Isolation Guard', rejectedReason);
        return;
      }
      setValidation(null);
    },
    [activeBookmaker, activeBookmakerInfo.name, bookmakers, pushNotification]
  );

  const updateBetslipSelection = useCallback(
    (oldSelectionKey: string, replacement: Omit<BetslipSelection, 'addedAt'>) => {
      setBetslip((prev) =>
        prev.map((s) =>
          s.selectionKey === oldSelectionKey
            ? { ...replacement, addedAt: new Date().toISOString() }
            : s
        )
      );
      setValidation(null);
    },
    []
  );

  const acceptUpdatedOdds = useCallback((selectionKey: string, newOdds: number) => {
    setBetslip((prev) =>
      prev.map((s) => (s.selectionKey === selectionKey ? { ...s, odds: newOdds } : s))
    );
    setValidation(null);
  }, []);

  const removeFromBetslip = useCallback((selectionKey: string) => {
    setBetslip((prev) => prev.filter((s) => s.selectionKey !== selectionKey));
    setValidation(null);
  }, []);

  const replaceBetslip = useCallback(
    (selections: BetslipSelection[]) => {
      if (selections.length === 0) {
        setBetslip([]);
        setValidation(null);
        return;
      }
      const baseBookmaker = selections[0]?.bookmakerId || activeBookmaker;
      const baseInfo = bookmakers.find((b) => b.id === baseBookmaker) || activeBookmakerInfo;
      const normalized = selections
        .filter((s) => (s.bookmakerId || baseBookmaker) === baseBookmaker)
        .map((s) => ({
          ...s,
          bookmakerId: baseBookmaker,
          bookmakerName: s.bookmakerName || baseInfo.name,
        }));
      setBetslip(normalized);
      setValidation(null);
    },
    [activeBookmaker, activeBookmakerInfo, bookmakers]
  );

  const clearBetslip = useCallback(() => {
    setBetslip([]);
    setValidation(null);
  }, []);

  const validateSlipNow = useCallback(async (): Promise<BetslipValidationResponse | null> => {
    if (betslip.length === 0) return null;
    const slipBookmaker = betslip[0]?.bookmakerId || activeBookmaker;
    const slipBookmakerName =
      bookmakers.find((b) => b.id === slipBookmaker)?.shortName || activeBookmakerInfo.shortName;
    setValidatingSlip(true);
    try {
      const res = await apiClient.validateBetslip(betslip, slipBookmaker);
      setValidation(res);
      if (res.hasOddsChanges) {
        pushNotification(
          'ODDS_SHIFT',
          'Odds Movement Detected',
          `One or more selections on your betslip changed odds on ${slipBookmakerName}.`
        );
      }
      if (res.hasSuspendedMarkets || res.hasMissingSelections) {
        pushNotification(
          'MARKET_UNAVAILABLE',
          'Market Suspension / Removal',
          'One or more betslip selections are suspended or no longer offered.'
        );
      }
      return res;
    } catch (err) {
      pushNotification(
        'INTEGRATION_ERROR',
        'Betslip Validation Failed',
        err instanceof Error
          ? err.message
          : `Unable to validate betslip against ${slipBookmakerName}.`
      );
      return null;
    } finally {
      setValidatingSlip(false);
    }
  }, [activeBookmaker, activeBookmakerInfo.shortName, betslip, bookmakers, pushNotification]);

  const generateBookingCode = useCallback(async (): Promise<BookingCodeResponse | null> => {
    if (betslip.length === 0) return null;
    const slipBookmaker = betslip[0]?.bookmakerId || activeBookmaker;
    const slipBookmakerName =
      bookmakers.find((b) => b.id === slipBookmaker)?.shortName || activeBookmakerInfo.shortName;
    setGeneratingCode(true);
    setCodeError(null);
    try {
      const booking = await apiClient.createBookingCode(betslip, slipBookmaker);
      setLatestBookingCode(booking);
      pushNotification(
        'CODE_CREATED',
        `Booking Code Created: ${booking.shareCode}`,
        `Verified ${booking.selectionCount} legs @ ${booking.combinedOdds.toFixed(
          2
        )} total odds on ${slipBookmakerName}.`
      );
      if (user && user.emailVerified) {
        void saveBookingCodeRecord(user.uid, booking, stakeTzs).catch(() => {});
      }
      return booking;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create booking code';
      setCodeError(msg);
      pushNotification('INTEGRATION_ERROR', 'Booking Code Generation Failed', msg);
      return null;
    } finally {
      setGeneratingCode(false);
    }
  }, [activeBookmaker, activeBookmakerInfo.shortName, betslip, bookmakers, pushNotification, user, stakeTzs]);

  const verifyAndLoadBookingCode = useCallback(
    async (
      code: string,
      loadIntoSlip = false,
      targetBookmaker?: BookmakerId
    ): Promise<BookingCodeResponse | null> => {
      setCodeError(null);
      const bk = targetBookmaker || activeBookmaker;
      try {
        const res = await apiClient.verifyBookingCode(code, bk);
        setLatestBookingCode(res);
        if (loadIntoSlip && res.selections.length > 0) {
          setBetslip(res.selections);
          setValidation(null);
        }
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Booking code lookup failed';
        setCodeError(msg);
        return null;
      }
    },
    [activeBookmaker]
  );

  // Admin Control Center Actions
  const requireAdminToken = useCallback(async (): Promise<string> => {
    if (!isAdmin) {
      throw new Error('Administrator authorization is required.');
    }
    const token = await getIdToken();
    if (!token) {
      throw new Error('Missing Firebase authentication token.');
    }
    return token;
  }, [getIdToken, isAdmin]);

  const syncPublicMirrorIfAdmin = useCallback(
    async (ticketsToSync: GeneratedTicket[], status: SchedulerStatus) => {
      if (!user || !user.emailVerified || !isAdmin) return;
      for (const t of ticketsToSync.slice(0, 60)) {
        void syncPublicTicketBundle(user.uid, t).catch(() => {});
      }
      void savePublicStatsRecord({
        dailyTicketTarget: status.dailyTicketTarget,
        totalGeneratedToday: status.totalDailyTicketsToday,
        bookingCodesGeneratedToday: status.bookingCodesGeneratedToday,
        lastScanningAt: status.lastScanningAt,
        lastSettlementAt: status.lastSettlementAt,
      }).catch(() => {});
    },
    [isAdmin, user]
  );

  const saveFactoryConfig = useCallback(
    async (cfg: DailyFactoryConfig) => {
      const token = await requireAdminToken();
      const res = await apiClient.updateDailyFactoryConfig(cfg, token);
      setFactoryConfig(res.config);
      setSchedulerStatus(res.status);
      setAutomationLogs(res.logs);
      if (user && user.emailVerified && isAdmin) {
        void saveAdminSettingsRecord(user, res.config).catch(() => {});
        if (res.logs[0]) {
          void saveAdminAuditLogRecord(user, res.logs[0]).catch(() => {});
        }
      }
      pushNotification(
        'SCAN_COMPLETE',
        'Daily Factory Settings Updated',
        `Saved ${res.config.minIndividualOdds.toFixed(2)}–${res.config.maxIndividualOdds.toFixed(
          2
        )} individual odds, ${res.config.dailyTicketTarget} daily target.`
      );
    },
    [isAdmin, pushNotification, requireAdminToken, user]
  );

  const toggleAutomation = useCallback(
    async (mode: 'start' | 'stop' | 'pause' | 'resume') => {
      const token = await requireAdminToken();
      const res = await apiClient.toggleFactoryAutomation(mode, token);
      setFactoryConfig(res.config);
      setSchedulerStatus(res.status);
      setAutomationLogs(res.logs);
      if (user && user.emailVerified && isAdmin) {
        void saveAdminSettingsRecord(user, res.config).catch(() => {});
        if (res.logs[0]) {
          void saveAdminAuditLogRecord(user, res.logs[0]).catch(() => {});
        }
      }
      pushNotification(
        'SCAN_COMPLETE',
        `Factory ${mode.toUpperCase()}`,
        res.logs[0]?.message || `Automation ${mode} executed.`
      );
    },
    [isAdmin, pushNotification, requireAdminToken, user]
  );

  const runFactoryNow = useCallback(async () => {
    setRunningFactory(true);
    try {
      const token = await requireAdminToken();
      const res = await apiClient.runDailyFactoryNow(token);
      setPortfolioTickets(res.tickets.filter((t) => isTicketAllowedInDailyFeed(t)));
      setSchedulerStatus(res.status);
      setAutomationLogs(res.logs);
      await refreshAnalytics();
      void syncPublicMirrorIfAdmin(res.newTickets, res.status);
      if (user && user.emailVerified && isAdmin) {
        void saveAdminAuditLogRecord(user, res.log).catch(() => {});
      }
      pushNotification('SCAN_COMPLETE', 'Daily Factory Executed', res.log.message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Daily Factory execution failed';
      pushNotification('INTEGRATION_ERROR', 'Daily Factory Error', msg);
    } finally {
      setRunningFactory(false);
    }
  }, [isAdmin, pushNotification, refreshAnalytics, requireAdminToken, syncPublicMirrorIfAdmin, user]);

  const deletePortfolioTicket = useCallback(
    async (internalTicketId: string) => {
      const token = await requireAdminToken();
      await apiClient.deleteTicket(internalTicketId, token);
      setPortfolioTickets((prev) => prev.filter((t) => t.internalTicketId !== internalTicketId));
      if (selectedTicketId === internalTicketId) {
        setSelectedTicketId(null);
        setActiveSection('feed');
      }
      await refreshAnalytics();
      await refreshScheduler();
      if (isAdmin && user?.emailVerified) {
        void deletePublicTicketBundle(internalTicketId).catch(() => {});
      }
    },
    [isAdmin, refreshAnalytics, refreshScheduler, requireAdminToken, selectedTicketId, setActiveSection, user?.emailVerified]
  );

  const createBookingCodeForTicket = useCallback(
    async (internalTicketId: string): Promise<GeneratedTicket | null> => {
      try {
        const token = await requireAdminToken();
        const res = await apiClient.createTicketBookingCode(internalTicketId, token);
        if (res.ticket) {
          setPortfolioTickets((prev) =>
            prev.map((t) => (t.internalTicketId === internalTicketId ? res.ticket : t))
          );
          await refreshAnalytics();
          await refreshScheduler();
          if (user && user.emailVerified && isAdmin) {
            void syncPublicTicketBundle(user.uid, res.ticket).catch(() => {});
          }
          pushNotification(
            'CODE_CREATED',
            `Booking Code: ${res.booking.shareCode}`,
            `Attached genuine booking code to ${internalTicketId}.`
          );
          return res.ticket;
        }
        return null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Booking code creation failed';
        await refreshPortfolio();
        pushNotification('INTEGRATION_ERROR', 'Booking Code Failed', msg);
        throw err;
      }
    },
    [isAdmin, pushNotification, refreshAnalytics, refreshPortfolio, refreshScheduler, requireAdminToken, user]
  );

  const retryFailedBookingCodes = useCallback(
    async (ticketIds?: string[]) => {
      setRetryingCodes(true);
      try {
        const token = await requireAdminToken();
        const res = await apiClient.retryFailedBookingCodes(token, ticketIds);
        setPortfolioTickets(res.tickets.filter((t) => isTicketAllowedInDailyFeed(t)));
        setSchedulerStatus(res.status);
        setAutomationLogs(res.logs);
        await refreshAnalytics();
        void syncPublicMirrorIfAdmin(res.tickets, res.status);
        if (user && user.emailVerified && isAdmin) {
          void saveAdminAuditLogRecord(user, res.log).catch(() => {});
        }
        pushNotification('CODE_CREATED', 'Booking Code Retry Complete', res.log.message);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Retry booking codes failed';
        pushNotification('INTEGRATION_ERROR', 'Retry Booking Codes Error', msg);
      } finally {
        setRetryingCodes(false);
      }
    },
    [isAdmin, pushNotification, refreshAnalytics, requireAdminToken, syncPublicMirrorIfAdmin, user]
  );

  const trackAllResultsNow = useCallback(
    async (ticketIds?: string[]) => {
      setTrackingResults(true);
      try {
        const token = await requireAdminToken();
        const res = await apiClient.trackTicketsResults(token, ticketIds);
        setPortfolioTickets(res.tickets.filter((t) => isTicketAllowedInDailyFeed(t)));
        setSchedulerStatus(res.status);
        setAutomationLogs(res.logs);
        await refreshAnalytics();
        void syncPublicMirrorIfAdmin(res.updatedTickets, res.status);
        if (user && user.emailVerified && isAdmin) {
          void saveAdminAuditLogRecord(user, res.log).catch(() => {});
        }
        pushNotification('SCAN_COMPLETE', 'Settlement Tracker Updated', res.log.message);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Results check failed';
        pushNotification('INTEGRATION_ERROR', 'Results Tracking Error', msg);
      } finally {
        setTrackingResults(false);
      }
    },
    [isAdmin, pushNotification, refreshAnalytics, requireAdminToken, syncPublicMirrorIfAdmin, user]
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <OddsHunterContext.Provider
      value={{
        activeSection,
        setActiveSection,
        selectedTicketId,
        selectedTicket,
        openTicketDetails,
        closeTicketDetails,
        platformSettings,
        refreshPlatformStatus,
        bookmakers,
        activeBookmaker,
        activeBookmakerInfo,
        setActiveBookmaker,
        markets,
        leagues,
        liveMatches,
        upcomingMatches,
        upcomingTotal,
        upcomingPage,
        loadingLive,
        loadingUpcoming,
        loadingLeagues,
        liveError,
        upcomingError,
        refreshLiveMatches,
        loadUpcomingMatches,
        selectedMatchId,
        openMatchDetail: (id) => setSelectedMatchId(id),
        closeMatchDetail: () => setSelectedMatchId(null),
        scannerConfig,
        setScannerConfig,
        resetScannerConfig,
        scanResult,
        setScanResult,
        scanning,
        scanError,
        executeScan,
        autoRescanSec,
        setAutoRescanSec,
        betslip,
        stakeTzs,
        setStakeTzs,
        addToBetslip,
        updateBetslipSelection,
        acceptUpdatedOdds,
        removeFromBetslip,
        replaceBetslip,
        clearBetslip,
        validation,
        validatingSlip,
        validateSlipNow,
        latestBookingCode,
        generatingCode,
        codeError,
        generateBookingCode,
        verifyAndLoadBookingCode,
        diagnostics,
        diagnosticsCheckedAt,
        loadingDiagnostics,
        runDiagnosticsCheck,
        researchReport,
        notifications,
        unreadCount,
        pushNotification,
        markLocalNotificationRead,
        portfolioTickets,
        loadingPortfolio,
        refreshPortfolio,
        isTicketFavorited,
        toggleFavoriteTicket,
        analyticsSummary,
        refreshAnalytics,
        schedulerStatus,
        refreshScheduler,
        factoryConfig,
        setFactoryConfig,
        automationLogs,
        loadingAdminState,
        runningFactory,
        trackingResults,
        retryingCodes,
        loadAdminFactoryState,
        saveFactoryConfig,
        toggleAutomation,
        runFactoryNow,
        deletePortfolioTicket,
        createBookingCodeForTicket,
        retryFailedBookingCodes,
        trackAllResultsNow,
      }}
    >
      {children}
    </OddsHunterContext.Provider>
  );
}

export function useOddsHunter(): OddsHunterContextValue {
  const ctx = useContext(OddsHunterContext);
  if (!ctx) {
    throw new Error('useOddsHunter must be used inside OddsHunterProvider');
  }
  return ctx;
}

export function selectionFromQualifying(q: QualifyingSelection): Omit<BetslipSelection, 'addedAt'> {
  return {
    selectionKey: q.selectionKey,
    bookmakerId: q.bookmakerId,
    bookmakerName: q.bookmakerName,
    eventId: q.eventId,
    homeTeam: q.homeTeam,
    awayTeam: q.awayTeam,
    leagueName: q.leagueName,
    country: q.country,
    estimateStartTime: q.estimateStartTime,
    matchStatus: q.matchStatus,
    isLive: q.isLive,
    marketId: q.marketId,
    marketName: q.marketName,
    specifier: q.specifier,
    outcomeId: q.outcomeId,
    outcomeDesc: q.outcomeDesc,
    odds: q.odds,
  };
}
