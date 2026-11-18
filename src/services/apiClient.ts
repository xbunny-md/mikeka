import type {
  AutomationJobLog,
  BackendLogEntry,
  BetslipSelection,
  BetslipValidationResponse,
  BookmakerCatalogInfo,
  BookmakerId,
  BookingCodeResponse,
  CanonicalMarketId,
  CanonicalMarketInfo,
  DailyFactoryConfig,
  DiagnosticCheck,
  GeneratedTicket,
  LeagueDirectoryItem,
  ManagedUserAccessRecord,
  MarketCatalogItem,
  NormalizedMatch,
  PerformanceAnalyticsSummary,
  PlatformSettings,
  ResearchReport,
  ScannerConfig,
  ScanResult,
  SchedulerStatus,
  TransferConfirmResponse,
  TransferDirection,
  TransferHistoryEntry,
  TransferPreviewResponse,
  TransferSourceSelection,
} from '../types/sportybet.ts';

async function apiFetch<T>(
  url: string,
  init?: RequestInit,
  bearerToken?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      typeof data?.error === 'string'
        ? data.error
        : `Request failed with HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return data as T;
}

function withBookmaker(path: string, bookmaker?: BookmakerId): string {
  if (!bookmaker) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}bookmaker=${encodeURIComponent(bookmaker)}`;
}

export const apiClient = {
  getHealth: () =>
    apiFetch<{ ok: boolean; service?: string; runtime?: string; timestamp: string }>('/api/health'),
  getPlatformStatus: () =>
    apiFetch<{
      settings: PlatformSettings;
      crossTransferEnabled: boolean;
      bookmakerStatus: Record<BookmakerId, boolean>;
    }>('/api/platform/status'),
  getBookmakers: () =>
    apiFetch<{
      bookmakers: BookmakerCatalogInfo[];
      factoryBookmaker: BookmakerId;
      enabledMap?: Record<BookmakerId, boolean>;
      crossTransferEnabled?: boolean;
    }>('/api/bookmakers'),
  getResearchReport: (bookmaker?: BookmakerId) =>
    apiFetch<ResearchReport>(withBookmaker('/api/research-report', bookmaker)),
  getMarkets: (bookmaker?: BookmakerId) =>
    apiFetch<{ bookmakerId?: BookmakerId; markets: MarketCatalogItem[] }>(
      withBookmaker('/api/markets', bookmaker)
    ),
  getDiagnostics: (bookmaker?: BookmakerId) =>
    apiFetch<{ bookmakerId?: BookmakerId; checkedAt: string; checks: DiagnosticCheck[] }>(
      withBookmaker('/api/diagnostics', bookmaker)
    ),
  getLeagues: (bookmaker?: BookmakerId) =>
    apiFetch<{ bookmakerId?: BookmakerId; leagues: LeagueDirectoryItem[] }>(
      withBookmaker('/api/sports/leagues', bookmaker)
    ),
  getLiveMatches: (bookmaker?: BookmakerId) =>
    apiFetch<{
      bookmakerId?: BookmakerId;
      matches: NormalizedMatch[];
      count: number;
      retrievedAt: string;
      dataSource: string;
    }>(withBookmaker('/api/matches/live', bookmaker)),
  getUpcomingMatches: (params?: {
    pageNum?: number;
    pageSize?: number;
    todayGames?: boolean;
    bookmaker?: BookmakerId;
  }) => {
    const qs = new URLSearchParams();
    if (params?.pageNum) qs.set('pageNum', String(params.pageNum));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params?.todayGames) qs.set('todayGames', 'true');
    if (params?.bookmaker) qs.set('bookmaker', params.bookmaker);
    return apiFetch<{
      bookmakerId?: BookmakerId;
      matches: NormalizedMatch[];
      pageNum: number;
      pageSize: number;
      totalAvailable: number;
      retrievedAt: string;
      dataSource: string;
    }>(`/api/matches/upcoming?${qs.toString()}`);
  },
  getMatchDetails: (eventId: string, bookmaker?: BookmakerId) =>
    apiFetch<{ bookmakerId?: BookmakerId; match: NormalizedMatch }>(
      withBookmaker(`/api/matches/${encodeURIComponent(eventId)}`, bookmaker)
    ),
  runScanner: (config: ScannerConfig) =>
    apiFetch<ScanResult>('/api/scanner/run', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  validateBetslip: (selections: BetslipSelection[], bookmakerId?: BookmakerId) =>
    apiFetch<BetslipValidationResponse>('/api/betslip/validate', {
      method: 'POST',
      body: JSON.stringify({ bookmakerId, selections }),
    }),
  createBookingCode: (selections: BetslipSelection[], bookmakerId?: BookmakerId) =>
    apiFetch<BookingCodeResponse>('/api/booking-codes/create', {
      method: 'POST',
      body: JSON.stringify({ bookmakerId, selections }),
    }),
  verifyBookingCode: (code: string, bookmaker?: BookmakerId) =>
    apiFetch<BookingCodeResponse>(
      withBookmaker(`/api/booking-codes/verify/${encodeURIComponent(code)}`, bookmaker)
    ),

  // Authentication Session
  getAuthSession: (token: string) =>
    apiFetch<{
      authenticated: boolean;
      uid: string;
      email: string;
      displayName: string;
      emailVerified: boolean;
      isAdmin: boolean;
      role: 'USER' | 'ADMIN';
      disabled: boolean;
      serverTimestamp: string;
    }>('/api/auth/session', undefined, token),

  // Cross-Bookmaker Bet Transfer (SportyBet TZ <-> betPawa TZ)
  getTransferMarkets: () =>
    apiFetch<{
      markets: CanonicalMarketInfo[];
      enabledMarkets: CanonicalMarketId[];
      crossTransferEnabled: boolean;
      bookmakerStatus: Record<BookmakerId, boolean>;
    }>('/api/transfer/markets'),
  previewTransfer: (
    payload: {
      direction: TransferDirection;
      bookingCode?: string;
      manualSelections?: TransferSourceSelection[];
    },
    token?: string | null
  ) =>
    apiFetch<TransferPreviewResponse>(
      '/api/transfer/preview',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    ),
  confirmTransfer: (
    payload: {
      transferId?: string;
      direction: TransferDirection;
      originalCode: string;
      originalSelectionCount: number;
      originalCombinedOdds: number;
      confirmedSelections: BetslipSelection[];
    },
    token?: string | null
  ) =>
    apiFetch<TransferConfirmResponse>(
      '/api/transfer/confirm',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    ),
  getUserTransferHistory: (token: string) =>
    apiFetch<{ transfers: TransferHistoryEntry[]; count: number }>(
      '/api/transfer/history',
      undefined,
      token
    ),

  // Public Shared Daily Feed, Analytics & Status
  checkAdminStatus: (token: string) =>
    apiFetch<{ isAdmin: boolean; email: string | null }>('/api/admin/me', undefined, token),
  listTickets: (bookmaker?: BookmakerId) =>
    apiFetch<{ tickets: GeneratedTicket[]; count: number }>(
      withBookmaker('/api/tickets', bookmaker)
    ),
  getTicketById: (internalTicketId: string) =>
    apiFetch<{ ticket: GeneratedTicket }>(
      `/api/tickets/${encodeURIComponent(internalTicketId)}`
    ),
  getPerformanceAnalytics: () =>
    apiFetch<PerformanceAnalyticsSummary>('/api/analytics/performance'),
  getSchedulerStatus: () =>
    apiFetch<{ status: SchedulerStatus }>('/api/scheduler/status'),

  // Administrator Control Center Endpoints (Bearer ID Token Protected)
  getDailyFactoryAdminState: (token: string) =>
    apiFetch<{
      config: DailyFactoryConfig;
      status: SchedulerStatus;
      logs: AutomationJobLog[];
    }>('/api/factory/config', undefined, token),
  updateDailyFactoryConfig: (config: DailyFactoryConfig, token: string) =>
    apiFetch<{
      config: DailyFactoryConfig;
      status: SchedulerStatus;
      logs: AutomationJobLog[];
    }>(
      '/api/factory/config',
      {
        method: 'PUT',
        body: JSON.stringify(config),
      },
      token
    ),
  toggleFactoryAutomation: (
    mode: 'start' | 'stop' | 'pause' | 'resume',
    token: string
  ) =>
    apiFetch<{
      config: DailyFactoryConfig;
      status: SchedulerStatus;
      logs: AutomationJobLog[];
    }>(
      '/api/factory/toggle',
      {
        method: 'POST',
        body: JSON.stringify({ mode }),
      },
      token
    ),
  runDailyFactoryNow: (token: string) =>
    apiFetch<{
      tickets: GeneratedTicket[];
      newTickets: GeneratedTicket[];
      log: AutomationJobLog;
      shortfallReason: string | null;
      status: SchedulerStatus;
      logs: AutomationJobLog[];
    }>('/api/factory/run', { method: 'POST' }, token),
  deleteTicket: (internalTicketId: string, token: string) =>
    apiFetch<{ deleted: boolean; internalTicketId: string }>(
      `/api/tickets/${encodeURIComponent(internalTicketId)}`,
      { method: 'DELETE' },
      token
    ),
  createTicketBookingCode: (internalTicketId: string, token: string) =>
    apiFetch<{ ticket: GeneratedTicket; booking: BookingCodeResponse }>(
      `/api/tickets/${encodeURIComponent(internalTicketId)}/booking-code`,
      { method: 'POST' },
      token
    ),
  retryFailedBookingCodes: (token: string, ticketIds?: string[]) =>
    apiFetch<{
      attempted: number;
      succeeded: number;
      failed: number;
      tickets: GeneratedTicket[];
      log: AutomationJobLog;
      status: SchedulerStatus;
      logs: AutomationJobLog[];
    }>(
      '/api/tickets/retry-booking-codes',
      {
        method: 'POST',
        body: JSON.stringify({ ticketIds }),
      },
      token
    ),
  trackTicketsResults: (token: string, ticketIds?: string[]) =>
    apiFetch<{
      updatedTickets: GeneratedTicket[];
      log: AutomationJobLog;
      status: SchedulerStatus;
      tickets: GeneratedTicket[];
      logs: AutomationJobLog[];
    }>(
      '/api/tickets/track-results',
      {
        method: 'POST',
        body: JSON.stringify({ ticketIds }),
      },
      token
    ),

  // Extended Admin: Platform Integrations, Transfers, Users & Logs
  getAdminOverview: (token: string) =>
    apiFetch<{
      platformSettings: PlatformSettings;
      canonicalMarkets: CanonicalMarketInfo[];
      transferHistory: TransferHistoryEntry[];
      backendLogs: BackendLogEntry[];
      managedUsers: ManagedUserAccessRecord[];
      firebaseMeta: {
        projectId: string;
        firestoreDatabaseId: string;
        adminIamConfigured: boolean;
      };
    }>('/api/admin/overview', undefined, token),
  updatePlatformSettings: (
    settings: {
      sportybetEnabled: boolean;
      betpawaEnabled: boolean;
      crossTransferEnabled: boolean;
      supportedTransferMarkets: CanonicalMarketId[];
    },
    token: string
  ) =>
    apiFetch<{ platformSettings: PlatformSettings }>(
      '/api/admin/platform-settings',
      {
        method: 'PUT',
        body: JSON.stringify(settings),
      },
      token
    ),
  updateUserAccess: (
    uid: string,
    updates: { role?: 'USER' | 'ADMIN'; disabled?: boolean },
    token: string
  ) =>
    apiFetch<{ user: ManagedUserAccessRecord }>(
      `/api/admin/users/${encodeURIComponent(uid)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      },
      token
    ),
  getAdminTransfers: (token: string, status?: string) =>
    apiFetch<{ transfers: TransferHistoryEntry[]; count: number }>(
      `/api/admin/transfers${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      undefined,
      token
    ),
  getAdminLogs: (token: string, filter?: { level?: string; category?: string }) => {
    const qs = new URLSearchParams();
    if (filter?.level) qs.set('level', filter.level);
    if (filter?.category) qs.set('category', filter.category);
    const queryStr = qs.toString();
    return apiFetch<{ logs: BackendLogEntry[]; count: number }>(
      `/api/admin/logs${queryStr ? `?${queryStr}` : ''}`,
      undefined,
      token
    );
  },
};
