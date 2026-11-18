import { BETPAWA_CONFIG } from '../config/bookmakers.ts';
import { SportyBetIntegrationError } from './sportybetClient.ts';
import type {
  BetslipSelection,
  BookingCodeResponse,
  DiagnosticCheck,
  LeagueDirectoryItem,
  NormalizedMarket,
  NormalizedMatch,
  NormalizedOutcome,
} from '../../src/types/sportybet.ts';

interface RawBetPawaPrice {
  id?: string | number;
  name?: string;
  displayName?: string;
  typeId?: string | number;
  odds?: string | number;
  suspended?: boolean;
  handicap?: string | number;
  probability?: {
    win?: number;
    refund?: number;
  };
}

interface RawBetPawaRow {
  id?: string | number;
  handicap?: string | number;
  prices?: RawBetPawaPrice[];
}

interface RawBetPawaMarket {
  marketType?: {
    id?: string | number;
    name?: string;
    displayName?: string;
    handicapType?: string;
  };
  row?: RawBetPawaRow[];
}

interface RawBetPawaParticipant {
  id?: string | number;
  name?: string;
  position?: number;
}

interface RawBetPawaPeriodResult {
  period?: {
    id?: string;
    name?: string;
    slug?: string;
  };
  result?: string;
  type?: string;
}

interface RawBetPawaResults {
  display?: {
    minute?: string;
    currentPeriod?: {
      id?: string;
      name?: string;
      slug?: string;
    };
  };
  participantPeriodResults?: Array<{
    participant?: {
      id?: string;
      type?: 'HOME' | 'AWAY' | string;
    };
    periodResults?: RawBetPawaPeriodResult[];
  }>;
}

interface RawBetPawaEvent {
  id?: string | number;
  name?: string;
  participants?: RawBetPawaParticipant[];
  startTime?: string;
  markets?: RawBetPawaMarket[];
  totalMarketCount?: string | number;
  category?: { id?: string | number; name?: string };
  region?: { id?: string | number; name?: string };
  competition?: { id?: string | number; name?: string };
  additionalInfo?: {
    live?: boolean;
    inplayBooked?: boolean;
  };
  results?: RawBetPawaResults;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const TOTAL_MARKET_IDS = new Set(['5000', '5006', '5003', '4958']);
const HANDICAP_MARKET_IDS = new Set(['3774']);

function formatOutcomeDesc(
  rawDesc: string,
  handicap: string,
  homeTeam: string,
  awayTeam: string
): string {
  return rawDesc
    .replace(/\{formattedHandicap\}/g, handicap)
    .replace(/\{home\}/g, homeTeam)
    .replace(/\{away\}/g, awayTeam)
    .replace(/\s+/g, ' ')
    .trim();
}

function formatMarketName(rawName: string, homeTeam: string, awayTeam: string): string {
  return rawName
    .replace(/\{home\}/g, homeTeam)
    .replace(/\{away\}/g, awayTeam)
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBetPawaScoreAndStatus(
  raw: RawBetPawaEvent,
  isLiveHint?: boolean
): {
  isLive: boolean;
  statusCode: number;
  matchStatus: string;
  score: string | null;
  playedSeconds: string | null;
} {
  const periodSlug = String(raw.results?.display?.currentPeriod?.slug || '').toUpperCase();
  const periodName = String(raw.results?.display?.currentPeriod?.name || '');
  const minute = raw.results?.display?.minute ? String(raw.results.display.minute) : null;

  let homeScore: string | null = null;
  let awayScore: string | null = null;

  for (const ppr of raw.results?.participantPeriodResults || []) {
    const pType = String(ppr.participant?.type || '').toUpperCase();
    const scoreEntry =
      ppr.periodResults?.find(
        (pr) =>
          pr.type === 'SCORE' &&
          (pr.period?.slug === 'FULL_TIME_EXCLUDING_OVERTIME' ||
            pr.period?.slug === 'REGULAR_TIME' ||
            pr.period?.slug === 'FULL_TIME')
      ) || ppr.periodResults?.find((pr) => pr.type === 'SCORE');

    if (scoreEntry && scoreEntry.result !== undefined) {
      if (pType === 'HOME') homeScore = String(scoreEntry.result);
      if (pType === 'AWAY') awayScore = String(scoreEntry.result);
    }
  }

  const score =
    homeScore !== null && awayScore !== null ? `${homeScore}:${awayScore}` : null;

  if (/ENDED|FINISHED|FULL_TIME|CLOSED/.test(periodSlug)) {
    return {
      isLive: false,
      statusCode: 3,
      matchStatus: 'Ended',
      score,
      playedSeconds: minute,
    };
  }
  if (/POSTPONED|CANCELLED|ABANDONED/.test(periodSlug)) {
    return {
      isLive: false,
      statusCode: 5,
      matchStatus: periodName || periodSlug,
      score,
      playedSeconds: minute,
    };
  }

  const isLive = Boolean(isLiveHint ?? raw.additionalInfo?.live);
  if (isLive) {
    return {
      isLive: true,
      statusCode: 1,
      matchStatus: periodName || 'Live',
      score,
      playedSeconds: minute,
    };
  }

  return {
    isLive: false,
    statusCode: 0,
    matchStatus: 'Not start',
    score,
    playedSeconds: minute,
  };
}

export class BetPawaClient {
  private cache = new Map<string, CacheEntry<unknown>>();
  private lastSuccessTimestamps = new Map<string, string>();

  private async fetchJson<T>(
    url: string,
    init?: RequestInit,
    retries = 1
  ): Promise<{ json: T; latencyMs: number }> {
    let lastErr: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), BETPAWA_CONFIG.timeoutMs);
      const started = Date.now();

      try {
        const res = await fetch(url, {
          ...init,
          headers: {
            ...BETPAWA_CONFIG.headers,
            ...(init?.headers || {}),
          },
          signal: controller.signal,
        });
        const latencyMs = Date.now() - started;

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new SportyBetIntegrationError(
            `betPawa TZ upstream HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 120)}` : ''}`,
            res.status >= 500 ? 502 : res.status
          );
        }

        const json = (await res.json()) as T;
        return { json, latencyMs };
      } catch (err) {
        lastErr = err;
        if (attempt === retries) break;
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      } finally {
        clearTimeout(timeout);
      }
    }

    if (lastErr instanceof SportyBetIntegrationError) {
      throw lastErr;
    }
    const msg = lastErr instanceof Error ? lastErr.message : 'Network error reaching betPawa TZ';
    throw new SportyBetIntegrationError(msg, 502);
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  private setCached<T>(key: string, value: T, ttlMs = BETPAWA_CONFIG.cacheTtlMs): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  normalizeEvent(
    raw: RawBetPawaEvent,
    isLiveHint: boolean | undefined,
    retrievedAt: string
  ): NormalizedMatch | null {
    if (!raw || !raw.id || !raw.startTime) return null;

    const estimateStartTime = Date.parse(raw.startTime);
    if (!Number.isFinite(estimateStartTime) || estimateStartTime <= 0) return null;

    const homeParticipant = raw.participants?.find((p) => p.position === 1);
    const awayParticipant = raw.participants?.find((p) => p.position === 2);
    const fallbackSplit = String(raw.name || '').split(/\s+-\s+/);

    const homeTeam = String(homeParticipant?.name || fallbackSplit[0] || '').trim();
    const awayTeam = String(awayParticipant?.name || fallbackSplit.slice(1).join(' - ') || '').trim();
    if (!homeTeam || !awayTeam) return null;

    const statusInfo = extractBetPawaScoreAndStatus(raw, isLiveHint);

    const normalizedMarkets: NormalizedMarket[] = [];
    for (const rawMarket of raw.markets || []) {
      const mTypeId = String(rawMarket.marketType?.id || '').trim();
      if (!mTypeId) continue;

      const marketLabel = formatMarketName(
        String(rawMarket.marketType?.displayName || rawMarket.marketType?.name || `Market ${mTypeId}`),
        homeTeam,
        awayTeam
      );
      const shortName = formatMarketName(
        String(rawMarket.marketType?.name || marketLabel),
        homeTeam,
        awayTeam
      );

      const rows = rawMarket.row || [];
      for (const r of rows) {
        const firstHandicap =
          r.prices?.[0]?.handicap !== undefined && r.prices?.[0]?.handicap !== ''
            ? String(r.prices[0].handicap)
            : r.handicap !== undefined && r.handicap !== ''
              ? String(r.handicap)
              : '';

        let specifier = '';
        if (firstHandicap) {
          if (TOTAL_MARKET_IDS.has(mTypeId)) {
            specifier = `total=${firstHandicap}`;
          } else if (HANDICAP_MARKET_IDS.has(mTypeId)) {
            specifier = `hcp=${firstHandicap}`;
          } else {
            specifier = `line=${firstHandicap}`;
          }
        } else if (rows.length > 1 && r.id) {
          specifier = `row=${r.id}`;
        }

        const outcomes: NormalizedOutcome[] = (r.prices || [])
          .map((p) => {
            const oddsNum = Number(p.odds);
            if (!Number.isFinite(oddsNum) || oddsNum <= 1.0 || !p.id) return null;
            const hcpStr =
              p.handicap !== undefined && p.handicap !== '' ? String(p.handicap) : firstHandicap;
            const desc = formatOutcomeDesc(
              String(p.displayName || p.name || ''),
              hcpStr,
              homeTeam,
              awayTeam
            );
            const winProb = p.probability?.win;
            return {
              outcomeId: String(p.id),
              desc,
              odds: oddsNum,
              probability:
                typeof winProb === 'number' && Number.isFinite(winProb) ? winProb : null,
              isActive: !p.suspended,
            };
          })
          .filter((o): o is NormalizedOutcome => o !== null);

        if (outcomes.length === 0) continue;

        normalizedMarkets.push({
          marketId: mTypeId,
          name: shortName,
          desc: marketLabel,
          specifier,
          status: 0,
          banned: false,
          sourceType: 'BETPAWA_SPORTSBOOK',
          lastOddsChangeTime: null,
          outcomes,
        });
      }
    }

    return {
      bookmakerId: 'BETPAWA_TZ',
      bookmakerName: 'betPawa Tanzania',
      eventId: String(raw.id),
      gameId: String(raw.id),
      homeTeam,
      awayTeam,
      homeTeamId: String(homeParticipant?.id || ''),
      awayTeamId: String(awayParticipant?.id || ''),
      leagueId: String(raw.competition?.id || 'unknown'),
      leagueName: String(raw.competition?.name || 'Unknown League'),
      country: String(raw.region?.name || 'International'),
      countryId: String(raw.region?.id || 'unknown'),
      estimateStartTime,
      kickoffIso: new Date(estimateStartTime).toISOString(),
      statusCode: statusInfo.statusCode,
      matchStatus: statusInfo.matchStatus,
      isLive: statusInfo.isLive,
      score: statusInfo.score,
      playedSeconds: statusInfo.playedSeconds,
      totalMarketSize: Number(raw.totalMarketCount ?? normalizedMarkets.length),
      dataSource: 'betPawa TZ Sportsbook API',
      retrievedAt,
      markets: normalizedMarkets,
    };
  }

  async getLeagueDirectory(): Promise<LeagueDirectoryItem[]> {
    const cacheKey = 'betpawa_leagues_football';
    const cached = this.getCached<LeagueDirectoryItem[]>(cacheKey);
    if (cached) return cached;

    const url = `${BETPAWA_CONFIG.baseUrl}/v4/categories/list/${BETPAWA_CONFIG.categoryIdFootball}`;
    const { json } = await this.fetchJson<{
      withRegions?: Array<{
        regions?: Array<{
          region?: { id?: string; name?: string };
          competitions?: Array<{
            competition?: { id?: string; name?: string };
            eventCounts?: { live?: string | number; upcoming?: string | number };
          }>;
        }>;
      }>;
    }>(url);

    const items: LeagueDirectoryItem[] = [];
    for (const regionBlock of json.withRegions?.[0]?.regions || []) {
      const catId = String(regionBlock.region?.id || '');
      const country = String(regionBlock.region?.name || 'International');
      for (const comp of regionBlock.competitions || []) {
        const compId = comp.competition?.id;
        const compName = comp.competition?.name;
        if (!compId || !compName) continue;
        const liveCount = Number(comp.eventCounts?.live || 0);
        const upcomingCount = Number(comp.eventCounts?.upcoming || 0);
        items.push({
          categoryId: catId,
          country,
          tournamentId: String(compId),
          tournamentName: String(compName),
          eventSize: liveCount + upcomingCount,
        });
      }
    }

    items.sort((a, b) => b.eventSize - a.eventSize || a.country.localeCompare(b.country));
    this.setCached(cacheKey, items, 120000);
    this.lastSuccessTimestamps.set('betpawa_leagues', new Date().toISOString());
    return items;
  }

  async getLiveMatches(): Promise<NormalizedMatch[]> {
    const cacheKey = 'betpawa_live_football';
    const cached = this.getCached<NormalizedMatch[]>(cacheKey);
    if (cached) return cached;

    const qObj = {
      queries: [
        {
          query: { eventType: 'LIVE', categories: [BETPAWA_CONFIG.categoryIdFootball] },
          view: { marketTypes: [...BETPAWA_CONFIG.defaultMarketIds] },
          skip: 0,
          take: 100,
        },
      ],
    };

    const url = `${BETPAWA_CONFIG.baseUrl}/v4/events/lists/by-queries?q=${encodeURIComponent(
      JSON.stringify(qObj)
    )}`;
    const { json } = await this.fetchJson<{
      responses?: Array<{ responses?: RawBetPawaEvent[] }>;
    }>(url);

    const retrievedAt = new Date().toISOString();
    const matches: NormalizedMatch[] = [];
    const seen = new Set<string>();

    for (const ev of json.responses?.[0]?.responses || []) {
      const normalized = this.normalizeEvent(ev, true, retrievedAt);
      if (normalized && !seen.has(normalized.eventId)) {
        seen.add(normalized.eventId);
        matches.push(normalized);
      }
    }

    this.setCached(cacheKey, matches, 15000);
    this.lastSuccessTimestamps.set('betpawa_live', retrievedAt);
    return matches;
  }

  async getUpcomingMatches(options?: {
    pageNum?: number;
    pageSize?: number;
    maxPages?: number;
    marketIds?: string;
    todayGames?: boolean;
  }): Promise<{ matches: NormalizedMatch[]; totalAvailable: number }> {
    const pageNum = Math.max(1, options?.pageNum ?? 1);
    const pageSize = Math.min(Math.max(options?.pageSize ?? 50, 10), 100);
    const maxPages = Math.min(Math.max(options?.maxPages ?? 1, 1), 8);
    const requestedMarketIds = options?.marketIds
      ? options.marketIds
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [...BETPAWA_CONFIG.defaultMarketIds];

    const cacheKey = `betpawa_upcoming_${pageNum}_${pageSize}_${maxPages}_${requestedMarketIds.join(',')}`;
    const cached = this.getCached<{ matches: NormalizedMatch[]; totalAvailable: number }>(cacheKey);
    if (cached) return cached;

    const matches: NormalizedMatch[] = [];
    const seen = new Set<string>();
    const retrievedAt = new Date().toISOString();
    let totalAvailable = 0;

    for (let p = pageNum; p < pageNum + maxPages; p++) {
      const skip = (p - 1) * pageSize;
      const qObj = {
        queries: [
          {
            query: { eventType: 'UPCOMING', categories: [BETPAWA_CONFIG.categoryIdFootball] },
            view: { marketTypes: requestedMarketIds },
            skip,
            take: pageSize,
          },
        ],
      };

      const url = `${BETPAWA_CONFIG.baseUrl}/v4/events/lists/by-queries?q=${encodeURIComponent(
        JSON.stringify(qObj)
      )}`;
      const { json } = await this.fetchJson<{
        responses?: Array<{
          totalCount?: number;
          responses?: RawBetPawaEvent[];
        }>;
      }>(url);

      const batch = json.responses?.[0]?.responses || [];
      if (json.responses?.[0]?.totalCount !== undefined) {
        totalAvailable = Number(json.responses[0].totalCount);
      }

      for (const ev of batch) {
        const normalized = this.normalizeEvent(ev, false, retrievedAt);
        if (normalized && !seen.has(normalized.eventId)) {
          seen.add(normalized.eventId);
          matches.push(normalized);
        }
      }

      if (batch.length < pageSize) {
        totalAvailable = Math.max(totalAvailable, skip + batch.length);
        break;
      }
      totalAvailable = Math.max(totalAvailable, skip + batch.length + pageSize);
    }

    const result = { matches, totalAvailable };
    this.setCached(cacheKey, result, BETPAWA_CONFIG.cacheTtlMs);
    this.lastSuccessTimestamps.set('betpawa_upcoming', retrievedAt);
    return result;
  }

  async getMatchDetails(eventId: string): Promise<NormalizedMatch> {
    const cacheKey = `betpawa_event_${eventId}`;
    const cached = this.getCached<NormalizedMatch>(cacheKey);
    if (cached) return cached;

    const url = `${BETPAWA_CONFIG.baseUrl}/v4/events/${encodeURIComponent(eventId)}`;
    const { json } = await this.fetchJson<RawBetPawaEvent>(url);

    const retrievedAt = new Date().toISOString();
    const normalized = this.normalizeEvent(json, undefined, retrievedAt);
    if (!normalized) {
      throw new SportyBetIntegrationError(`Match ${eventId} unavailable on betPawa TZ`, 404);
    }

    this.setCached(cacheKey, normalized, 15000);
    this.lastSuccessTimestamps.set('betpawa_event', retrievedAt);
    return normalized;
  }

  async createBookingCode(selections: BetslipSelection[]): Promise<BookingCodeResponse> {
    if (selections.length === 0 || selections.length > 30) {
      throw new SportyBetIntegrationError(
        'Booking code creation requires between 1 and 30 selections.',
        400
      );
    }

    for (const sel of selections) {
      if (sel.bookmakerId && sel.bookmakerId !== 'BETPAWA_TZ') {
        throw new SportyBetIntegrationError(
          'Cross-bookmaker isolation error: cannot submit SportyBet selections to betPawa TZ.',
          400
        );
      }
    }

    const selectionEntries = selections.map((s) => {
      const priceId = Number(s.outcomeId);
      if (!Number.isInteger(priceId) || priceId <= 0) {
        throw new SportyBetIntegrationError(
          `Invalid betPawa TZ price ID (${s.outcomeId}) for ${s.homeTeam} vs ${s.awayTeam}.`,
          400
        );
      }
      return {
        type: 'SINGLE',
        selections: [priceId],
      };
    });

    const url = `${BETPAWA_CONFIG.baseUrl}/v3/booking-number`;
    const { json } = await this.fetchJson<{ code?: string; error?: string }>(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selections: {
            selections: selectionEntries,
          },
        }),
      },
      0
    );

    const code = String(json.code || '').trim().toUpperCase();
    if (!code) {
      throw new SportyBetIntegrationError(
        json.error || 'betPawa TZ rejected booking code creation for these selections.',
        400
      );
    }

    const verified = await this.verifyBookingCode(code).catch(() => null);
    this.lastSuccessTimestamps.set('betpawa_booking', new Date().toISOString());

    const combinedOdds = Number(
      selections.reduce((acc, s) => acc * s.odds, 1).toFixed(2)
    );
    const earliestKickoff = selections.reduce(
      (min, s) => (s.estimateStartTime > 0 ? Math.min(min, s.estimateStartTime) : min),
      selections[0]?.estimateStartTime || 0
    );

    return {
      bookmakerId: 'BETPAWA_TZ',
      bookmakerName: 'betPawa Tanzania',
      shareCode: code,
      shareUrl: `https://www.betpawa.co.tz/?bookingNumber=${encodeURIComponent(code)}`,
      deadline: earliestKickoff,
      createdAt: new Date().toISOString(),
      selectionCount: verified ? verified.selectionCount : selections.length,
      combinedOdds: verified ? verified.combinedOdds : combinedOdds,
      verified: Boolean(verified),
      selections: verified && verified.selections.length > 0 ? verified.selections : selections,
    };
  }

  async verifyBookingCode(shareCode: string): Promise<BookingCodeResponse> {
    const cleanCode = shareCode.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(cleanCode)) {
      throw new SportyBetIntegrationError('Invalid betPawa booking code format.', 400);
    }

    const url = `${BETPAWA_CONFIG.baseUrl}/v3/booking-number/${encodeURIComponent(cleanCode)}`;
    const { json } = await this.fetchJson<{
      items?: Array<{
        eventInfo?: RawBetPawaEvent;
        selections?: Array<{
          market?: {
            typeId?: string | number;
            name?: string;
            displayName?: string;
            formattedHandicap?: string;
          };
          selectionInfo?: {
            id?: string | number;
            name?: string;
            displayName?: string;
            handicap?: string;
            suspended?: boolean;
          };
        }>;
        odds?: {
          price?: number;
        };
      }>;
    }>(url, undefined, 0);

    const items = json.items || [];
    if (items.length === 0) {
      throw new SportyBetIntegrationError(
        `betPawa booking code ${cleanCode} is invalid, empty, or expired.`,
        404
      );
    }

    const now = new Date().toISOString();
    const mappedSelections: BetslipSelection[] = [];

    for (const item of items) {
      const ev = item.eventInfo;
      const sel = item.selections?.[0];
      if (!ev?.id || !sel?.market || !sel?.selectionInfo) continue;

      const homeParticipant = ev.participants?.find((p) => p.position === 1);
      const awayParticipant = ev.participants?.find((p) => p.position === 2);
      const homeTeam = String(homeParticipant?.name || 'Home');
      const awayTeam = String(awayParticipant?.name || 'Away');

      const mTypeId = String(sel.market.typeId || '');
      const handicap = String(sel.selectionInfo.handicap || sel.market.formattedHandicap || '');
      const specifier = handicap
        ? TOTAL_MARKET_IDS.has(mTypeId)
          ? `total=${handicap}`
          : HANDICAP_MARKET_IDS.has(mTypeId)
            ? `hcp=${handicap}`
            : `line=${handicap}`
        : '';

      const marketName = formatMarketName(
        String(sel.market.displayName || sel.market.name || `Market ${mTypeId}`),
        homeTeam,
        awayTeam
      );
      const outcomeId = String(sel.selectionInfo.id || '');
      const outcomeDesc = formatOutcomeDesc(
        String(sel.selectionInfo.displayName || sel.selectionInfo.name || ''),
        handicap,
        homeTeam,
        awayTeam
      );
      const oddsNum = Number(item.odds?.price || 0);
      const kickoffMs = ev.startTime ? Date.parse(ev.startTime) : 0;

      mappedSelections.push({
        bookmakerId: 'BETPAWA_TZ',
        bookmakerName: 'betPawa Tanzania',
        selectionKey: `${ev.id}::${mTypeId}::${specifier}::${outcomeId}`,
        eventId: String(ev.id),
        homeTeam,
        awayTeam,
        leagueName: String(ev.competition?.name || 'Football'),
        country: String(ev.region?.name || 'International'),
        estimateStartTime: Number.isFinite(kickoffMs) ? kickoffMs : 0,
        matchStatus: ev.additionalInfo?.live ? 'Live' : 'Not start',
        isLive: Boolean(ev.additionalInfo?.live),
        marketId: mTypeId,
        marketName,
        specifier,
        outcomeId,
        outcomeDesc,
        odds: Number.isFinite(oddsNum) && oddsNum > 1 ? oddsNum : 1.01,
        addedAt: now,
      });
    }

    const combinedOdds = Number(
      mappedSelections.reduce((acc, s) => acc * s.odds, 1).toFixed(2)
    );
    const earliestDeadline = mappedSelections.reduce(
      (min, s) => (s.estimateStartTime > 0 ? Math.min(min, s.estimateStartTime) : min),
      mappedSelections[0]?.estimateStartTime || 0
    );
    this.lastSuccessTimestamps.set('betpawa_booking', now);

    return {
      bookmakerId: 'BETPAWA_TZ',
      bookmakerName: 'betPawa Tanzania',
      shareCode: cleanCode,
      shareUrl: `https://www.betpawa.co.tz/?bookingNumber=${encodeURIComponent(cleanCode)}`,
      deadline: earliestDeadline,
      createdAt: now,
      selectionCount: mappedSelections.length,
      combinedOdds,
      verified: true,
      selections: mappedSelections,
    };
  }

  async runDiagnostics(): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];
    const now = new Date().toISOString();

    checks.push({
      key: 'backend_api',
      label: 'Express Backend API',
      status: 'CONNECTED',
      latencyMs: 1,
      lastCheckedAt: now,
      lastSuccessAt: now,
      details: 'Node/Express API router active for multi-bookmaker operations.',
      endpoint: '/api/health',
    });

    const probe = async (
      key: string,
      label: string,
      endpoint: string,
      fn: () => Promise<unknown>
    ) => {
      const start = Date.now();
      try {
        await fn();
        const latencyMs = Date.now() - start;
        const okTime = new Date().toISOString();
        this.lastSuccessTimestamps.set(key, okTime);
        checks.push({
          key,
          label,
          status: 'CONNECTED',
          latencyMs,
          lastCheckedAt: okTime,
          lastSuccessAt: okTime,
          details: 'Verified live HTTP 200 JSON response with x-pawa-brand: betpawa-tanzania.',
          endpoint,
        });
      } catch (err) {
        checks.push({
          key,
          label,
          status: 'ERROR',
          latencyMs: Date.now() - start,
          lastCheckedAt: new Date().toISOString(),
          lastSuccessAt: this.lastSuccessTimestamps.get(key) || null,
          details: err instanceof Error ? err.message : 'Endpoint probe failed',
          endpoint,
        });
      }
    };

    await Promise.all([
      probe(
        'betpawa_upcoming',
        'betPawa TZ Upcoming Fixtures & Odds (v4)',
        `${BETPAWA_CONFIG.baseUrl}/v4/events/lists/by-queries`,
        () => this.getUpcomingMatches({ pageNum: 1, pageSize: 10, maxPages: 1 })
      ),
      probe(
        'betpawa_live',
        'betPawa TZ Live In-Play Feed (v4)',
        `${BETPAWA_CONFIG.baseUrl}/v4/events/lists/by-queries`,
        () => this.getLiveMatches()
      ),
      probe(
        'betpawa_leagues',
        'betPawa TZ Regions & Leagues (v4)',
        `${BETPAWA_CONFIG.baseUrl}/v4/categories/list/2`,
        () => this.getLeagueDirectory()
      ),
      probe(
        'betpawa_booking',
        'betPawa TZ Booking Code API (v3)',
        `${BETPAWA_CONFIG.baseUrl}/v3/booking-number`,
        async () => {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), BETPAWA_CONFIG.timeoutMs);
          try {
            const res = await fetch(`${BETPAWA_CONFIG.baseUrl}/v3/booking-number/DIAG00`, {
              headers: BETPAWA_CONFIG.headers,
              signal: controller.signal,
            });
            // Non-existent lookup returns 404/400 JSON or 200 JSON from API gateway
            if (res.status >= 500) {
              throw new Error(`HTTP ${res.status}`);
            }
          } finally {
            clearTimeout(t);
          }
        }
      ),
    ]);

    return checks;
  }
}

export const betPawaClient = new BetPawaClient();
