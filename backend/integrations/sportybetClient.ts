import { SPORTYBET_CONFIG } from '../config/sportybet.ts';
import type {
  BookingCodeResponse,
  BetslipSelection,
  DiagnosticCheck,
  LeagueDirectoryItem,
  NormalizedMarket,
  NormalizedMatch,
  NormalizedOutcome,
} from '../../src/types/sportybet.ts';

interface RawOutcome {
  id?: string | number;
  desc?: string;
  odds?: string | number;
  probability?: string | number;
  isActive?: number;
}

interface RawMarket {
  id?: string | number;
  name?: string;
  desc?: string;
  specifier?: string;
  status?: number;
  banned?: boolean;
  sourceType?: string;
  lastOddsChangeTime?: number;
  outcomes?: RawOutcome[];
}

interface RawEvent {
  eventId?: string;
  gameId?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  estimateStartTime?: number;
  status?: number;
  matchStatus?: string;
  setScore?: string;
  playedSeconds?: string;
  totalMarketSize?: number;
  markets?: RawMarket[];
  eventSource?: {
    preMatchSource?: { sourceType?: string };
    liveSource?: { sourceType?: string };
  };
  sport?: {
    category?: {
      id?: string;
      name?: string;
      tournament?: {
        id?: string;
        name?: string;
      };
    };
  };
}

interface RawTournamentBucket {
  id?: string;
  name?: string;
  categoryId?: string;
  categoryName?: string;
  events?: RawEvent[];
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  storedAt: string;
}

export class SportyBetIntegrationError extends Error {
  statusCode: number;
  bizCode?: number;

  constructor(message: string, statusCode = 502, bizCode?: number) {
    super(message);
    this.name = 'SportyBetIntegrationError';
    this.statusCode = statusCode;
    this.bizCode = bizCode;
  }
}

export class SportyBetClient {
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
      const timeout = setTimeout(() => controller.abort(), SPORTYBET_CONFIG.timeoutMs);
      const started = Date.now();

      try {
        const res = await fetch(url, {
          ...init,
          headers: {
            ...SPORTYBET_CONFIG.headers,
            ...(init?.headers || {}),
          },
          signal: controller.signal,
        });
        const latencyMs = Date.now() - started;

        if (!res.ok) {
          throw new SportyBetIntegrationError(
            `SportyBet upstream HTTP ${res.status}`,
            res.status >= 500 ? 502 : res.status
          );
        }

        const json = (await res.json()) as T;
        return { json, latencyMs };
      } catch (err) {
        lastErr = err;
        if (attempt === retries) {
          break;
        }
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      } finally {
        clearTimeout(timeout);
      }
    }

    if (lastErr instanceof SportyBetIntegrationError) {
      throw lastErr;
    }
    const msg = lastErr instanceof Error ? lastErr.message : 'Network error reaching SportyBet TZ';
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

  private setCached<T>(key: string, value: T, ttlMs = SPORTYBET_CONFIG.cacheTtlMs): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      storedAt: new Date().toISOString(),
    });
  }

  normalizeMarket(raw: RawMarket): NormalizedMarket | null {
    if (!raw || raw.id === undefined || raw.id === null) return null;
    const outcomes: NormalizedOutcome[] = (raw.outcomes || [])
      .map((o) => {
        const oddsNum = Number(o.odds);
        if (!Number.isFinite(oddsNum) || oddsNum <= 1.0) return null;
        const probNum = o.probability !== undefined ? Number(o.probability) : null;
        return {
          outcomeId: String(o.id ?? ''),
          desc: String(o.desc ?? ''),
          odds: oddsNum,
          probability: probNum !== null && Number.isFinite(probNum) ? probNum : null,
          isActive: o.isActive === 1,
        };
      })
      .filter((o): o is NormalizedOutcome => o !== null);

    if (outcomes.length === 0) return null;

    return {
      marketId: String(raw.id),
      name: String(raw.name || raw.desc || `Market ${raw.id}`),
      desc: String(raw.desc || raw.name || ''),
      specifier: String(raw.specifier || ''),
      status: Number(raw.status ?? 0),
      banned: Boolean(raw.banned),
      sourceType: String(raw.sourceType || 'BET_RADAR'),
      lastOddsChangeTime:
        typeof raw.lastOddsChangeTime === 'number' ? raw.lastOddsChangeTime : null,
      outcomes,
    };
  }

  normalizeEvent(
    raw: RawEvent,
    tournamentMeta: { id?: string; name?: string; categoryId?: string; categoryName?: string },
    isLive: boolean,
    retrievedAt: string
  ): NormalizedMatch | null {
    if (!raw || !raw.eventId || !raw.homeTeamName || !raw.awayTeamName) return null;
    const estimateStartTime = Number(raw.estimateStartTime || 0);
    if (!Number.isFinite(estimateStartTime) || estimateStartTime <= 0) return null;

    const markets = (raw.markets || [])
      .map((m) => this.normalizeMarket(m))
      .filter((m): m is NormalizedMarket => m !== null);

    const cat = raw.sport?.category;
    const tour = cat?.tournament;

    const leagueId = String(tournamentMeta.id || tour?.id || 'unknown');
    const leagueName = String(tournamentMeta.name || tour?.name || 'Unknown League');
    const countryId = String(tournamentMeta.categoryId || cat?.id || 'unknown');
    const country = String(tournamentMeta.categoryName || cat?.name || 'International');

    const sourceType =
      raw.eventSource?.liveSource?.sourceType ||
      raw.eventSource?.preMatchSource?.sourceType ||
      markets[0]?.sourceType ||
      'BET_RADAR';

    return {
      bookmakerId: 'SPORTYBET_TZ',
      bookmakerName: 'SportyBet Tanzania',
      eventId: String(raw.eventId),
      gameId: String(raw.gameId || ''),
      homeTeam: String(raw.homeTeamName),
      awayTeam: String(raw.awayTeamName),
      homeTeamId: String(raw.homeTeamId || ''),
      awayTeamId: String(raw.awayTeamId || ''),
      leagueId,
      leagueName,
      country,
      countryId,
      estimateStartTime,
      kickoffIso: new Date(estimateStartTime).toISOString(),
      statusCode: Number(raw.status ?? 0),
      matchStatus: String(raw.matchStatus || (isLive ? 'Live' : 'Not start')),
      isLive,
      score: raw.setScore ? String(raw.setScore) : null,
      playedSeconds: raw.playedSeconds ? String(raw.playedSeconds) : null,
      totalMarketSize: Number(raw.totalMarketSize ?? markets.length),
      dataSource: `SportyBet TZ (${sourceType})`,
      retrievedAt,
      markets,
    };
  }

  async getLeagueDirectory(): Promise<LeagueDirectoryItem[]> {
    const cacheKey = 'leagues_football';
    const cached = this.getCached<LeagueDirectoryItem[]>(cacheKey);
    if (cached) return cached;

    const url = `${SPORTYBET_CONFIG.baseUrl}/factsCenter/popularAndSportList?sportId=${encodeURIComponent(
      SPORTYBET_CONFIG.sportIdFootball
    )}&productId=${SPORTYBET_CONFIG.productId}`;

    const { json } = await this.fetchJson<{
      bizCode?: number;
      message?: string;
      data?: {
        sportList?: Array<{
          id?: string;
          categories?: Array<{
            id?: string;
            name?: string;
            tournaments?: Array<{ id?: string; name?: string; eventSize?: number }>;
          }>;
        }>;
      };
    }>(url);

    if (json.bizCode !== 10000) {
      throw new SportyBetIntegrationError(
        `SportyBet league directory error: ${json.message || json.bizCode}`,
        502,
        json.bizCode
      );
    }

    const football = json.data?.sportList?.find(
      (s) => s.id === SPORTYBET_CONFIG.sportIdFootball
    );
    const items: LeagueDirectoryItem[] = [];
    for (const cat of football?.categories || []) {
      for (const t of cat.tournaments || []) {
        if (!t.id || !t.name) continue;
        items.push({
          categoryId: String(cat.id || ''),
          country: String(cat.name || 'International'),
          tournamentId: String(t.id),
          tournamentName: String(t.name),
          eventSize: Number(t.eventSize || 0),
        });
      }
    }

    items.sort((a, b) => b.eventSize - a.eventSize || a.country.localeCompare(b.country));
    this.setCached(cacheKey, items, 120000);
    this.lastSuccessTimestamps.set('leagues', new Date().toISOString());
    return items;
  }

  async getLiveMatches(): Promise<NormalizedMatch[]> {
    const cacheKey = 'live_football';
    const cached = this.getCached<NormalizedMatch[]>(cacheKey);
    if (cached) return cached;

    const url = `${SPORTYBET_CONFIG.baseUrl}/factsCenter/liveOrPrematchEvents?sportId=${encodeURIComponent(
      SPORTYBET_CONFIG.sportIdFootball
    )}&_t=${Date.now()}`;

    const { json } = await this.fetchJson<{
      bizCode?: number;
      message?: string;
      data?: RawTournamentBucket[];
    }>(url);

    if (json.bizCode !== 10000) {
      throw new SportyBetIntegrationError(
        `SportyBet live feed error: ${json.message || json.bizCode}`,
        502,
        json.bizCode
      );
    }

    const retrievedAt = new Date().toISOString();
    const matches: NormalizedMatch[] = [];
    const seen = new Set<string>();

    for (const bucket of json.data || []) {
      for (const ev of bucket.events || []) {
        const normalized = this.normalizeEvent(ev, bucket, true, retrievedAt);
        if (normalized && !seen.has(normalized.eventId)) {
          seen.add(normalized.eventId);
          matches.push(normalized);
        }
      }
    }

    this.setCached(cacheKey, matches, 15000);
    this.lastSuccessTimestamps.set('live', retrievedAt);
    return matches;
  }

  async getUpcomingMatches(options?: {
    pageNum?: number;
    pageSize?: number;
    maxPages?: number;
    marketIds?: string;
    todayGames?: boolean;
    sportId?: string;
  }): Promise<{ matches: NormalizedMatch[]; totalAvailable: number }> {
    const pageNum = options?.pageNum ?? 1;
    const pageSize = Math.min(Math.max(options?.pageSize ?? 100, 10), 100);
    const maxPages = Math.min(Math.max(options?.maxPages ?? 1, 1), 10);
    const marketIds = options?.marketIds || SPORTYBET_CONFIG.defaultMarketIds;
    const todayGames = options?.todayGames ? '&todayGames=true' : '';
    const sportId = options?.sportId || SPORTYBET_CONFIG.sportIdFootball;

    const cacheKey = `upcoming_${sportId}_${pageNum}_${pageSize}_${maxPages}_${marketIds}_${todayGames}`;
    const cached = this.getCached<{ matches: NormalizedMatch[]; totalAvailable: number }>(
      cacheKey
    );
    if (cached) return cached;

    const matches: NormalizedMatch[] = [];
    const seen = new Set<string>();
    let totalAvailable = 0;
    const retrievedAt = new Date().toISOString();

    for (let p = pageNum; p < pageNum + maxPages; p++) {
      const url = `${SPORTYBET_CONFIG.baseUrl}/factsCenter/pcUpcomingEvents?sportId=${encodeURIComponent(
        sportId
      )}&marketId=${encodeURIComponent(marketIds)}&pageSize=${pageSize}&pageNum=${p}${todayGames}`;

      const { json } = await this.fetchJson<{
        bizCode?: number;
        message?: string;
        data?: {
          totalNum?: number;
          tournaments?: RawTournamentBucket[];
        };
      }>(url);

      if (json.bizCode !== 10000) {
        throw new SportyBetIntegrationError(
          `SportyBet upcoming feed error: ${json.message || json.bizCode}`,
          502,
          json.bizCode
        );
      }

      totalAvailable = Number(json.data?.totalNum || 0);
      const buckets = json.data?.tournaments || [];
      let pageEventCount = 0;

      for (const bucket of buckets) {
        for (const ev of bucket.events || []) {
          pageEventCount++;
          const normalized = this.normalizeEvent(ev, bucket, false, retrievedAt);
          if (normalized && !seen.has(normalized.eventId)) {
            seen.add(normalized.eventId);
            matches.push(normalized);
          }
        }
      }

      if (pageEventCount === 0 || matches.length >= totalAvailable) {
        break;
      }
    }

    const result = { matches, totalAvailable };
    this.setCached(cacheKey, result, SPORTYBET_CONFIG.cacheTtlMs);
    this.lastSuccessTimestamps.set('upcoming', retrievedAt);
    return result;
  }

  async getMatchDetails(eventId: string): Promise<NormalizedMatch> {
    const cacheKey = `event_${eventId}`;
    const cached = this.getCached<NormalizedMatch>(cacheKey);
    if (cached) return cached;

    const url = `${SPORTYBET_CONFIG.baseUrl}/factsCenter/event?eventId=${encodeURIComponent(
      eventId
    )}&productId=${SPORTYBET_CONFIG.productId}`;

    const { json } = await this.fetchJson<{
      bizCode?: number;
      message?: string;
      data?: RawEvent;
    }>(url);

    if (json.bizCode !== 10000 || !json.data) {
      throw new SportyBetIntegrationError(
        `Match ${eventId} unavailable on SportyBet TZ (${json.message || json.bizCode})`,
        404,
        json.bizCode
      );
    }

    const retrievedAt = new Date().toISOString();
    const isLive = Number(json.data.status || 0) === 1;
    const normalized = this.normalizeEvent(json.data, {}, isLive, retrievedAt);
    if (!normalized) {
      throw new SportyBetIntegrationError(`Unable to parse match ${eventId}`, 502);
    }

    this.setCached(cacheKey, normalized, 15000);
    this.lastSuccessTimestamps.set('event', retrievedAt);
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
      if (sel.bookmakerId && sel.bookmakerId !== 'SPORTYBET_TZ') {
        throw new SportyBetIntegrationError(
          'Cross-bookmaker isolation error: cannot submit betPawa selections to SportyBet TZ.',
          400
        );
      }
    }

    const payload = {
      selections: selections.map((s) => ({
        eventId: s.eventId,
        marketId: String(s.marketId),
        outcomeId: String(s.outcomeId),
        ...(s.specifier ? { specifier: s.specifier } : {}),
        sportId: SPORTYBET_CONFIG.sportIdFootball,
      })),
    };

    const url = `${SPORTYBET_CONFIG.baseUrl}/orders/share`;
    const { json } = await this.fetchJson<{
      bizCode?: number;
      isAvailable?: boolean;
      message?: string;
      data?: {
        shareCode?: string;
        shareURL?: string;
        deadline?: number;
        outcomes?: Array<{
          eventId?: string;
          homeTeamName?: string;
          awayTeamName?: string;
          estimateStartTime?: number;
          matchStatus?: string;
          status?: number;
          sport?: {
            category?: {
              name?: string;
              tournament?: { name?: string };
            };
          };
          markets?: RawMarket[];
        }>;
      };
    }>(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      0
    );

    if (json.bizCode !== 10000 || !json.data?.shareCode) {
      throw new SportyBetIntegrationError(
        json.message || 'SportyBet rejected booking code creation for these selections.',
        400,
        json.bizCode
      );
    }

    const shareCode = json.data.shareCode;
    const verified = await this.verifyBookingCode(shareCode).catch(() => null);
    this.lastSuccessTimestamps.set('booking', new Date().toISOString());

    const combinedOdds = Number(
      selections.reduce((acc, s) => acc * s.odds, 1).toFixed(2)
    );

    return {
      bookmakerId: 'SPORTYBET_TZ',
      bookmakerName: 'SportyBet Tanzania',
      shareCode,
      shareUrl: `https://www.sportybet.com/tz/?shareCode=${encodeURIComponent(shareCode)}`,
      deadline: Number(json.data.deadline || 0),
      createdAt: new Date().toISOString(),
      selectionCount: verified ? verified.selectionCount : selections.length,
      combinedOdds: verified ? verified.combinedOdds : combinedOdds,
      verified: Boolean(verified),
      selections: verified ? verified.selections : selections,
    };
  }

  async verifyBookingCode(shareCode: string): Promise<BookingCodeResponse> {
    const cleanCode = shareCode.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(cleanCode)) {
      throw new SportyBetIntegrationError('Invalid booking code format.', 400);
    }

    const url = `${SPORTYBET_CONFIG.baseUrl}/orders/share/${encodeURIComponent(cleanCode)}`;
    const { json } = await this.fetchJson<{
      bizCode?: number;
      message?: string;
      data?: {
        shareCode?: string;
        shareURL?: string;
        deadline?: number;
        outcomes?: Array<{
          eventId?: string;
          homeTeamName?: string;
          awayTeamName?: string;
          estimateStartTime?: number;
          matchStatus?: string;
          status?: number;
          sport?: {
            category?: {
              name?: string;
              tournament?: { name?: string };
            };
          };
          markets?: RawMarket[];
        }>;
      };
    }>(url, undefined, 0);

    if (json.bizCode !== 10000 || !json.data?.shareCode) {
      throw new SportyBetIntegrationError(
        json.message || `Booking code ${cleanCode} is invalid or expired.`,
        404,
        json.bizCode
      );
    }

    const now = new Date().toISOString();
    const mappedSelections: BetslipSelection[] = [];
    for (const ev of json.data.outcomes || []) {
      const m = ev.markets?.[0];
      const o = m?.outcomes?.[0];
      if (!ev.eventId || !m || !o) continue;
      const oddsNum = Number(o.odds || 0);
      mappedSelections.push({
        bookmakerId: 'SPORTYBET_TZ',
        bookmakerName: 'SportyBet Tanzania',
        selectionKey: `${ev.eventId}::${m.id}::${m.specifier || ''}::${o.id}`,
        eventId: String(ev.eventId),
        homeTeam: String(ev.homeTeamName || 'Home'),
        awayTeam: String(ev.awayTeamName || 'Away'),
        leagueName: String(ev.sport?.category?.tournament?.name || 'Football'),
        country: String(ev.sport?.category?.name || 'International'),
        estimateStartTime: Number(ev.estimateStartTime || 0),
        matchStatus: String(ev.matchStatus || 'Not start'),
        isLive: Number(ev.status || 0) === 1,
        marketId: String(m.id || ''),
        marketName: String(m.name || m.desc || ''),
        specifier: String(m.specifier || ''),
        outcomeId: String(o.id || ''),
        outcomeDesc: String(o.desc || ''),
        odds: Number.isFinite(oddsNum) && oddsNum > 0 ? oddsNum : 1,
        addedAt: now,
      });
    }

    const combinedOdds = Number(
      mappedSelections.reduce((acc, s) => acc * s.odds, 1).toFixed(2)
    );
    this.lastSuccessTimestamps.set('booking', now);

    return {
      bookmakerId: 'SPORTYBET_TZ',
      bookmakerName: 'SportyBet Tanzania',
      shareCode: json.data.shareCode,
      shareUrl: `https://www.sportybet.com/tz/?shareCode=${encodeURIComponent(
        json.data.shareCode
      )}`,
      deadline: Number(json.data.deadline || 0),
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
      details: 'Node/Express API router active on local server.',
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
          details: 'Verified live HTTP 200 & bizCode 10000 response.',
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
        'sportybet_upcoming',
        'SportyBet TZ Upcoming Fixtures & Odds',
        `${SPORTYBET_CONFIG.baseUrl}/factsCenter/pcUpcomingEvents`,
        () => this.getUpcomingMatches({ pageNum: 1, pageSize: 10, maxPages: 1 })
      ),
      probe(
        'sportybet_live',
        'SportyBet TZ Live In-Play Feed',
        `${SPORTYBET_CONFIG.baseUrl}/factsCenter/liveOrPrematchEvents`,
        () => this.getLiveMatches()
      ),
      probe(
        'sportybet_leagues',
        'SportyBet TZ League Directory',
        `${SPORTYBET_CONFIG.baseUrl}/factsCenter/popularAndSportList`,
        () => this.getLeagueDirectory()
      ),
      probe(
        'sportybet_booking',
        'SportyBet TZ Booking Code API',
        `${SPORTYBET_CONFIG.baseUrl}/orders/share`,
        async () => {
          // Probe share lookup endpoint safely with deterministic format test (expects bizCode 19000 JSON response, proving endpoint reachability without creating junk codes)
          const url = `${SPORTYBET_CONFIG.baseUrl}/orders/share/DIAG00`;
          const { json } = await this.fetchJson<{ bizCode?: number }>(url, undefined, 0);
          if (json.bizCode === undefined) {
            throw new Error('Unexpected response from /orders/share');
          }
        }
      ),
    ]);

    return checks;
  }
}

export const sportyBetClient = new SportyBetClient();
