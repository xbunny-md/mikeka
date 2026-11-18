export type ThemeMode = 'dark' | 'light';

export type BookmakerId = 'SPORTYBET_TZ' | 'BETPAWA_TZ';

export interface BookmakerCatalogInfo {
  id: BookmakerId;
  name: string;
  shortName: string;
  country: string;
  websiteUrl: string;
  apiBaseUrl: string;
  bookingCodeSupported: boolean;
  bookingCodeMechanism: string;
  notes: string;
}

export type MatchStatusFilter = 'ALL' | 'UPCOMING' | 'LIVE';

export type DiagnosticStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'UNVERIFIED'
  | 'UNAVAILABLE'
  | 'ERROR';

export type TicketStatus =
  | 'PENDING'
  | 'LIVE'
  | 'WON'
  | 'LOST'
  | 'VOID'
  | 'PARTIALLY_SETTLED'
  | 'UNVERIFIED';

export type SelectionSettlementStatus =
  | 'PENDING'
  | 'LIVE'
  | 'WON'
  | 'LOST'
  | 'VOID'
  | 'UNVERIFIED';

export type BookingCodeStatus = 'GENERATED' | 'FAILED' | 'NOT_REQUESTED';

export interface MarketCatalogItem {
  id: string;
  name: string;
  shortName: string;
  description: string;
}

export interface NormalizedOutcome {
  outcomeId: string;
  desc: string;
  odds: number;
  probability: number | null;
  isActive: boolean;
}

export interface NormalizedMarket {
  marketId: string;
  name: string;
  desc: string;
  specifier: string;
  status: number;
  banned: boolean;
  sourceType: string;
  lastOddsChangeTime: number | null;
  outcomes: NormalizedOutcome[];
}

export interface NormalizedMatch {
  bookmakerId?: BookmakerId;
  bookmakerName?: string;
  eventId: string;
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamId: string;
  awayTeamId: string;
  leagueId: string;
  leagueName: string;
  country: string;
  countryId: string;
  estimateStartTime: number;
  kickoffIso: string;
  statusCode: number;
  matchStatus: string;
  isLive: boolean;
  score: string | null;
  playedSeconds: string | null;
  totalMarketSize: number;
  dataSource: string;
  retrievedAt: string;
  markets: NormalizedMarket[];
}

export interface ScannerConfig {
  bookmakerId?: BookmakerId;
  minOdds: number;
  maxOdds: number;
  startDate: string;
  endDate: string;
  sportId: string;
  leagues: string[];
  matchStatus: MatchStatusFilter;
  markets: string[];
  maxResults: number;
  searchQuery?: string;
  sortBy?: 'kickoff_asc' | 'odds_asc' | 'odds_desc';
}

export interface QualifyingSelection {
  bookmakerId?: BookmakerId;
  bookmakerName?: string;
  selectionKey: string;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  leagueId: string;
  leagueName: string;
  country: string;
  estimateStartTime: number;
  kickoffIso: string;
  matchStatus: string;
  isLive: boolean;
  marketId: string;
  marketName: string;
  specifier: string;
  outcomeId: string;
  outcomeDesc: string;
  odds: number;
  probability: number | null;
  dataSource: string;
  retrievedAt: string;
}

export interface ScanResult {
  bookmakerId?: BookmakerId;
  bookmakerName?: string;
  scanId: string;
  scannedAt: string;
  dataSource: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  totalMatchesScanned: number;
  qualifyingCount: number;
  results: QualifyingSelection[];
  appliedConfig: ScannerConfig;
  warnings: string[];
}

export interface BetslipSelection {
  bookmakerId?: BookmakerId;
  bookmakerName?: string;
  selectionKey: string;
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  country: string;
  estimateStartTime: number;
  matchStatus: string;
  isLive: boolean;
  marketId: string;
  marketName: string;
  specifier: string;
  outcomeId: string;
  outcomeDesc: string;
  odds: number;
  addedAt: string;
}

export interface BetslipValidationItem {
  selectionKey: string;
  eventId: string;
  valid: boolean;
  currentOdds: number | null;
  previousOdds: number;
  oddsChanged: boolean;
  oddsDiff: number;
  marketSuspended: boolean;
  matchStarted: boolean;
  duplicateEvent: boolean;
  missingSelection: boolean;
  warnings: string[];
}

export interface BetslipValidationResponse {
  valid: boolean;
  combinedOdds: number;
  selectionCount: number;
  hasDuplicates: boolean;
  hasSuspendedMarkets: boolean;
  hasOddsChanges: boolean;
  hasStartedMatches: boolean;
  hasMissingSelections: boolean;
  items: BetslipValidationItem[];
  globalWarnings: string[];
  checkedAt: string;
}

export interface BookingCodeResponse {
  bookmakerId?: BookmakerId;
  bookmakerName?: string;
  shareCode: string;
  shareUrl: string;
  deadline: number;
  createdAt: string;
  selectionCount: number;
  combinedOdds: number;
  verified: boolean;
  selections: BetslipSelection[];
}

export interface LeagueDirectoryItem {
  categoryId: string;
  country: string;
  tournamentId: string;
  tournamentName: string;
  eventSize: number;
}

export interface DiagnosticCheck {
  key: string;
  label: string;
  status: DiagnosticStatus;
  latencyMs: number | null;
  lastCheckedAt: string;
  lastSuccessAt: string | null;
  details: string;
  endpoint: string;
}

export interface ResearchReport {
  targetWebsite: string;
  researchedAt: string;
  summary: string;
  bookingCodeSupported: boolean;
  bookingCodeMechanism: string;
  endpoints: {
    name: string;
    method: 'GET' | 'POST';
    url: string;
    authRequired: boolean;
    format: string;
    purpose: string;
    verifiedStatus: string;
  }[];
  marketCatalog: MarketCatalogItem[];
  limitations: string[];
  complianceBoundaries: string[];
}

// ==================================================
// AUTOMATIC DAILY ODDS FACTORY & SETTLEMENT TYPES
// ==================================================

export interface OddsCategoryConfig {
  id: string;
  label: string;
  minCombinedOdds: number;
  maxCombinedOdds: number;
  targetCombinedOdds: number;
  weight: number;
}

export interface TicketSelectionRecord extends BetslipSelection {
  leagueId: string;
  retrievedAt: string;
}

export interface SelectionSettlementRecord {
  selectionKey: string;
  eventId: string;
  status: SelectionSettlementStatus;
  officialMatchStatus: string;
  score: string | null;
  playedSeconds: string | null;
  currentOdds: number | null;
  oddsChanged: boolean;
  reason: string;
  checkedAt: string;
}

export interface GeneratedTicket {
  internalTicketId: string;
  bookmakerId?: BookmakerId;
  bookmakerName?: string;
  bookmakerUrl?: string;
  signature: string;
  sourceType: 'DAILY_FACTORY' | 'ADMIN_MANUAL';
  categoryId: string;
  categoryLabel: string;
  targetOdds: number;
  actualCombinedOdds: number;
  oddsDifference: number;
  selectionCount: number;
  selections: TicketSelectionRecord[];
  kickoffStartMs: number;
  kickoffEndMs: number;
  dataSource: string;
  generatedAt: string;
  generatedDateKey: string; // YYYY-MM-DD in Africa/Dar_es_Salaam
  published: boolean;
  revalidatedAt: string;
  // Separate mutable settlement & booking code fields
  status: TicketStatus;
  effectiveCombinedOdds: number;
  selectionSettlements: SelectionSettlementRecord[];
  shareCode: string | null;
  shareUrl: string | null;
  shareCodeDeadline: number | null;
  shareCodeVerified: boolean;
  bookingCodeStatus: BookingCodeStatus;
  bookingCodeError: string | null;
  settledAt: string | null;
  lastCheckedAt: string | null;
}

export interface DailyFactoryConfig {
  activeBookmaker?: BookmakerId;
  enabled: boolean;
  paused: boolean;
  minIndividualOdds: number; // Strictly 1.01 by default
  maxIndividualOdds: number; // Strictly 1.25 by default
  dailyTicketTarget: number; // Default >= 50 (e.g. 55)
  maxTickets: number;
  minSelections: number;
  maxSelections: number;
  sportIds: string[];
  markets: string[];
  anyMarket: boolean;
  leagues: string[];
  datePreset: 'TODAY' | 'TOMORROW' | 'CUSTOM';
  customStartDate: string;
  customEndDate: string;
  windowStartTime: string;
  windowEndTime: string;
  timezone: string; // Africa/Dar_es_Salaam
  oddsCategories: OddsCategoryConfig[];
  duplicatePrevention: boolean;
  autoCreateBookingCodes: boolean;
  scheduleIntervalMinutes: number;
}

export interface AutomationJobLog {
  logId: string;
  actionType:
    | 'AUTO_SCHEDULE'
    | 'MANUAL_TRIGGER'
    | 'SETTINGS_UPDATE'
    | 'RETRY_CODES'
    | 'RESULTS_CHECK'
    | 'SYSTEM_TOGGLE';
  jobType: 'DAILY_FACTORY' | 'RESULTS_TRACKER' | 'ADMIN_ACTION';
  status: 'SUCCESS' | 'PARTIAL' | 'SKIPPED' | 'FAILED';
  actorEmail: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  ticketsGenerated: number;
  codesCreated: number;
  codeFailures: number;
  ticketsChecked: number;
  ticketsSettled: number;
  message: string;
}

export interface SchedulerStatus {
  enabled: boolean;
  paused: boolean;
  factoryRunning: boolean;
  resultsTrackerRunning: boolean;
  resultsIntervalMinutes: number;
  lastFactoryRunAt: string | null;
  lastResultsRunAt: string | null;
  lastScanningAt: string | null;
  lastSettlementAt: string | null;
  nextFactoryRunAt: string | null;
  totalDailyTicketsToday: number;
  dailyTicketTarget: number;
  bookingCodesGeneratedToday: number;
  bookingCodeFailuresToday: number;
  dailyShortfallReason: string | null;
}

export interface PerformanceBreakdownRow {
  label: string;
  total: number;
  won: number;
  lost: number;
  voided: number;
  pending: number;
  settledNonVoid: number;
  winRatePct: number | null;
}

export interface PerformanceAnalyticsSummary {
  totalGenerated: number;
  generatedToday: number;
  dailyTarget: number;
  totalSettled: number;
  wonCount: number;
  lostCount: number;
  voidCount: number;
  partiallySettledCount: number;
  pendingOrLiveCount: number;
  unverifiedCount: number;
  validSharingCodes: number;
  failedBookingCodes: number;
  settledNonVoidDenominator: number;
  winRatePct: number | null;
  lastScanningAt: string | null;
  lastSettlementAt: string | null;
  byCategory: PerformanceBreakdownRow[];
  byMarket: PerformanceBreakdownRow[];
  byLeague: PerformanceBreakdownRow[];
  dailyTrends: {
    dateKey: string;
    generated: number;
    won: number;
    lost: number;
    voided: number;
  }[];
  performanceDisclaimer: string;
}

// ==================================================
// CROSS-BOOKMAKER BET TRANSFER TYPES (SPORTYBET <-> BETPAWA)
// ==================================================

export type TransferDirection = 'SPORTYBET_TO_BETPAWA' | 'BETPAWA_TO_SPORTYBET';

export type TransferStatus =
  | 'READY_TO_REVIEW'
  | 'PARTIALLY_MATCHED'
  | 'UNAVAILABLE_SELECTIONS'
  | 'WAITING_FOR_CONFIRMATION'
  | 'TRANSFERRED'
  | 'MANUAL_IMPORT_REQUIRED'
  | 'FAILED';

export type TransferLegStatus =
  | 'MATCHED'
  | 'ODDS_CHANGED'
  | 'UNAVAILABLE'
  | 'UNMATCHED'
  | 'MATCH_STARTED';

export type CanonicalMarketId =
  | '1X2_FT'
  | 'DOUBLE_CHANCE_FT'
  | 'OVER_UNDER_FT'
  | 'BTTS_FT'
  | 'DRAW_NO_BET_FT'
  | 'ODD_EVEN_FT'
  | 'HOME_OU_FT'
  | 'AWAY_OU_FT'
  | 'ASIAN_HANDICAP_FT'
  | 'HT_1X2'
  | 'HT_OVER_UNDER'
  | 'HT_DOUBLE_CHANCE'
  | 'HT_BTTS';

export interface CanonicalMarketInfo {
  id: CanonicalMarketId;
  label: string;
  sportybetMarketId: string;
  betpawaMarketId: string;
  settlementRule: string;
}

export interface TransferSourceSelection {
  id: string;
  homeTeam: string;
  awayTeam: string;
  leagueName?: string;
  country?: string;
  estimateStartTime?: number;
  marketId?: string;
  marketName: string;
  specifier?: string;
  outcomeId?: string;
  outcomeDesc: string;
  odds: number;
  eventId?: string;
}

export interface TransferMatchCandidate {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  country: string;
  estimateStartTime: number;
  confidenceScore: number;
  reason: string;
}

export interface TransferLegResult {
  sourceSelection: TransferSourceSelection;
  status: TransferLegStatus;
  canonicalMarket: CanonicalMarketId | null;
  canonicalOutcome: string | null;
  targetSelection: BetslipSelection | null;
  targetOdds: number | null;
  oddsDifference: number | null;
  matchConfidence: number;
  settlementRuleNote: string;
  reason: string;
  candidateMatches?: TransferMatchCandidate[];
}

export interface TransferPreviewResponse {
  transferId: string;
  direction: TransferDirection;
  sourceBookmaker: BookmakerId;
  sourceBookmakerName: string;
  targetBookmaker: BookmakerId;
  targetBookmakerName: string;
  originalCode: string;
  status: TransferStatus;
  originalSelectionCount: number;
  matchedCount: number;
  unmatchedCount: number;
  unavailableCount: number;
  originalCombinedOdds: number;
  targetCombinedOdds: number | null;
  legs: TransferLegResult[];
  matchedSelections: BetslipSelection[];
  warnings: string[];
  manualHandoffUrl: string;
  checkedAt: string;
}

export interface TransferConfirmResponse {
  transferId: string;
  direction: TransferDirection;
  sourceBookmaker: BookmakerId;
  targetBookmaker: BookmakerId;
  originalCode: string;
  status: TransferStatus;
  targetBookingCode: string | null;
  targetShareUrl: string | null;
  verified: boolean;
  selectionCount: number;
  originalCombinedOdds: number;
  targetCombinedOdds: number;
  confirmedSelections: BetslipSelection[];
  manualHandoffUrl: string;
  errorMessage: string | null;
  confirmedAt: string;
}

export interface TransferHistoryEntry {
  transferId: string;
  direction: TransferDirection;
  sourceBookmaker: BookmakerId;
  targetBookmaker: BookmakerId;
  originalCode: string;
  targetBookingCode: string | null;
  targetShareUrl: string | null;
  status: TransferStatus;
  originalSelectionCount: number;
  matchedCount: number;
  unmatchedCount: number;
  originalCombinedOdds: number;
  targetCombinedOdds: number | null;
  actorUid: string | null;
  actorEmail: string | null;
  errorMessage: string | null;
  createdAt: string;
}

// ==================================================
// PLATFORM SETTINGS, LOGGING & USER ACCESS TYPES
// ==================================================

export interface PlatformSettings {
  sportybetEnabled: boolean;
  betpawaEnabled: boolean;
  crossTransferEnabled: boolean;
  supportedTransferMarkets: CanonicalMarketId[];
  updatedAt: string;
  updatedByEmail: string | null;
}

export interface BackendLogEntry {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  category: 'AUTH' | 'API' | 'TRANSFER' | 'INTEGRATION' | 'CRON' | 'ADMIN';
  event: string;
  message: string;
  actorUid?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface ManagedUserAccessRecord {
  uid: string;
  email: string;
  displayName: string;
  role: 'USER' | 'ADMIN';
  disabled: boolean;
  emailVerified: boolean;
  lastSeenAt: string;
  updatedByEmail?: string | null;
}

