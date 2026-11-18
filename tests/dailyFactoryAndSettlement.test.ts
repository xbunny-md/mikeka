import { describe, expect, it } from 'vitest';
import { automationStore, DEFAULT_DAILY_FACTORY_CONFIG } from '../backend/services/automationStore.ts';
import {
  DEFAULT_ODDS_CATEGORIES,
  discoverEligibleSelections,
  generateDailyPortfolioFromMatches,
  getDateKeyInTimezone,
  isOddsWithinStrictBounds,
  normalizeTeamKey,
  revalidateTicketSelectionsAgainstMatches,
} from '../backend/services/dailyFactoryEngine.ts';
import { isAdminEmail } from '../backend/middleware/adminAuth.ts';
import { schedulerService } from '../backend/services/schedulerService.ts';
import {
  computePerformanceAnalytics,
  evaluateTicketSettlement,
  settleSingleSelectionOutcome,
} from '../backend/services/settlementService.ts';
import type {
  DailyFactoryConfig,
  GeneratedTicket,
  NormalizedMatch,
} from '../src/types/sportybet.ts';
import {
  isDisallowedDailyFeedSelection,
  isTicketAllowedInDailyFeed,
} from '../src/utils/dailyFeedFilter.ts';

function buildFixture(
  idx: number,
  overrides: Partial<NormalizedMatch> = {}
): NormalizedMatch {
  const kickoff = Date.parse('2026-11-25T14:00:00.000Z') + idx * 1200000;
  return {
    eventId: `sr:match:${5000 + idx}`,
    gameId: `${5000 + idx}`,
    homeTeam: `HomeClub ${idx}`,
    awayTeam: `AwayClub ${idx}`,
    homeTeamId: `hc_${idx}`,
    awayTeamId: `ac_${idx}`,
    leagueId: idx % 2 === 0 ? 'sr:tournament:17' : 'sr:tournament:8',
    leagueName: idx % 2 === 0 ? 'Premier League' : 'LaLiga',
    country: idx % 2 === 0 ? 'England' : 'Spain',
    countryId: idx % 2 === 0 ? 'sr:category:1' : 'sr:category:32',
    estimateStartTime: kickoff,
    kickoffIso: new Date(kickoff).toISOString(),
    statusCode: 0,
    matchStatus: 'Not start',
    isLive: false,
    score: null,
    playedSeconds: null,
    totalMarketSize: 4,
    dataSource: 'SportyBet TZ (BET_RADAR)',
    retrievedAt: '2026-11-24T08:00:00.000Z',
    markets: [
      {
        marketId: '1',
        name: '1X2',
        desc: '1X2',
        specifier: '',
        status: 0,
        banned: false,
        sourceType: 'BET_RADAR',
        lastOddsChangeTime: null,
        outcomes: [
          { outcomeId: '1', desc: 'Home', odds: 1.95, probability: 0.5, isActive: true },
          { outcomeId: '2', desc: 'Draw', odds: 3.4, probability: 0.28, isActive: true },
          { outcomeId: '3', desc: 'Away', odds: 3.8, probability: 0.22, isActive: true },
        ],
      },
      {
        marketId: '10',
        name: 'Double Chance',
        desc: 'Double Chance',
        specifier: '',
        status: 0,
        banned: false,
        sourceType: 'BET_RADAR',
        lastOddsChangeTime: null,
        outcomes: [
          { outcomeId: '9', desc: 'Home or Draw', odds: 1.18, probability: 0.82, isActive: true },
          { outcomeId: '10', desc: 'Home or Away', odds: 1.24, probability: 0.77, isActive: true },
          { outcomeId: '11', desc: 'Draw or Away', odds: 1.23, probability: 0.75, isActive: true },
        ],
      },
      {
        marketId: '18',
        name: 'Over/Under',
        desc: 'Over/Under',
        specifier: 'total=0.5',
        status: 0,
        banned: false,
        sourceType: 'BET_RADAR',
        lastOddsChangeTime: null,
        outcomes: [
          { outcomeId: '12_05', desc: 'Over 0.5', odds: 1.07, probability: 0.91, isActive: true },
          { outcomeId: '13_05', desc: 'Under 0.5', odds: 7.5, probability: 0.09, isActive: true },
        ],
      },
      {
        marketId: '18',
        name: 'Over/Under',
        desc: 'Over/Under',
        specifier: 'total=1.5',
        status: 0,
        banned: false,
        sourceType: 'BET_RADAR',
        lastOddsChangeTime: null,
        outcomes: [
          { outcomeId: '12', desc: 'Over 1.5', odds: 1.22, probability: 0.79, isActive: true },
          { outcomeId: '13', desc: 'Under 1.5', odds: 3.6, probability: 0.21, isActive: true },
        ],
      },
      {
        marketId: '18',
        name: 'Over/Under',
        desc: 'Over/Under',
        specifier: 'total=4.5',
        status: 0,
        banned: false,
        sourceType: 'BET_RADAR',
        lastOddsChangeTime: null,
        outcomes: [
          { outcomeId: '12_45', desc: 'Over 4.5', odds: 5.2, probability: 0.18, isActive: true },
          { outcomeId: '13_45', desc: 'Under 4.5', odds: 1.14, probability: 0.85, isActive: true },
        ],
      },
      {
        marketId: '29',
        name: 'GG/NG',
        desc: 'Both Teams To Score',
        specifier: '',
        status: 0,
        banned: false,
        sourceType: 'BET_RADAR',
        lastOddsChangeTime: null,
        outcomes: [
          { outcomeId: '74', desc: 'Yes', odds: 1.0, probability: 0.99, isActive: true },
          { outcomeId: '76', desc: 'No', odds: 1.85, probability: 0.52, isActive: true },
        ],
      },
    ],
    ...overrides,
  };
}

describe('Strict Individual Odds Enforcement (1.01 to 1.25 Inclusive)', () => {
  it('accepts 1.01 and 1.25 while strictly rejecting 1.00 and 1.26', () => {
    expect(isOddsWithinStrictBounds(1.0, 1.01, 1.25)).toBe(false);
    expect(isOddsWithinStrictBounds(1.009, 1.01, 1.25)).toBe(false);
    expect(isOddsWithinStrictBounds(1.01, 1.01, 1.25)).toBe(true);
    expect(isOddsWithinStrictBounds(1.18, 1.01, 1.25)).toBe(true);
    expect(isOddsWithinStrictBounds(1.25, 1.01, 1.25)).toBe(true);
    expect(isOddsWithinStrictBounds(1.251, 1.01, 1.25)).toBe(false);
    expect(isOddsWithinStrictBounds(1.26, 1.01, 1.25)).toBe(false);
    expect(isOddsWithinStrictBounds(1.5, 1.01, 1.25)).toBe(false);
  });

  it('filters out 1.00 and 1.26+ selections during fixture discovery and enforces Dar es Salaam window', () => {
    const nowMs = Date.parse('2026-11-25T06:00:00.000Z');
    const nextDayEat = buildFixture(1, {
      eventId: 'sr:match:next_eat',
      estimateStartTime: Date.parse('2026-11-25T22:00:00.000Z'), // 01:00+03:00 next day
    });
    const todayEat = buildFixture(2, {
      eventId: 'sr:match:today_eat',
      estimateStartTime: Date.parse('2026-11-25T15:00:00.000Z'),
    });

    const cfg: DailyFactoryConfig = {
      ...DEFAULT_DAILY_FACTORY_CONFIG,
      datePreset: 'CUSTOM',
      customStartDate: '2026-11-25',
      customEndDate: '2026-11-25',
      windowStartTime: '00:00',
      windowEndTime: '23:59',
      anyMarket: true,
    };

    expect(getDateKeyInTimezone(nextDayEat.estimateStartTime, 'Africa/Dar_es_Salaam')).toBe(
      '2026-11-26'
    );

    const eligible = discoverEligibleSelections([nextDayEat, todayEat], cfg, nowMs);
    // Should include Double Chance 1X (1.18) & X2/Draw or Away (1.23) + Over 0.5 (1.07),
    // Over 1.5 (1.22), Under 4.5 (1.14), while strictly rejecting Double Chance 12 (Home or Away),
    // 1X2 Home/Away, odds 1.00, and odds 1.26+.
    expect(eligible.length).toBe(5);
    expect(eligible.every((s) => s.eventId === 'sr:match:today_eat')).toBe(true);
    expect(eligible.every((s) => s.odds >= 1.01 && s.odds <= 1.25)).toBe(true);
    expect(eligible.some((s) => s.marketId === '10' && s.outcomeDesc === 'Home or Draw')).toBe(true);
    expect(eligible.some((s) => s.marketId === '10' && s.outcomeDesc === 'Draw or Away')).toBe(true);
    expect(eligible.some((s) => s.outcomeDesc === 'Home or Away' || s.outcomeDesc === '12')).toBe(false);
    expect(eligible.every((s) => !isDisallowedDailyFeedSelection(s))).toBe(true);
  });

  it('allows Double Chance 1X & X2/2X while strictly excluding 12 (Home or Away) and straight 1X2/DNB', () => {
    expect(
      isDisallowedDailyFeedSelection({ marketId: '10', marketName: 'Double Chance', outcomeId: '9', outcomeDesc: 'Home or Draw' })
    ).toBe(false);
    expect(
      isDisallowedDailyFeedSelection({ marketId: '10', marketName: 'Double Chance', outcomeId: '11', outcomeDesc: 'Draw or Away' })
    ).toBe(false);
    expect(
      isDisallowedDailyFeedSelection({ marketId: '4693', marketName: 'Double Chance', outcomeDesc: '1X' })
    ).toBe(false);
    expect(
      isDisallowedDailyFeedSelection({ marketId: '4693', marketName: 'Double Chance', outcomeDesc: '2X' })
    ).toBe(false);
    expect(
      isDisallowedDailyFeedSelection({ marketId: '4693', marketName: 'Double Chance', outcomeDesc: 'X2' })
    ).toBe(false);
    expect(
      isDisallowedDailyFeedSelection({ marketId: '10', marketName: 'Double Chance', outcomeId: '10', outcomeDesc: 'Home or Away' })
    ).toBe(true);
    expect(
      isDisallowedDailyFeedSelection({ marketId: '4693', marketName: 'Double Chance', outcomeDesc: '12' })
    ).toBe(true);
    expect(
      isDisallowedDailyFeedSelection({ marketId: '1', marketName: '1X2', outcomeDesc: 'Home' })
    ).toBe(true);
    expect(
      isDisallowedDailyFeedSelection({ marketId: '11', marketName: 'Draw No Bet', outcomeDesc: 'Away' })
    ).toBe(true);
    expect(
      isTicketAllowedInDailyFeed({
        selections: [
          { marketId: '10', marketName: 'Double Chance', outcomeId: '9', outcomeDesc: 'Home or Draw' },
          { marketId: '4693', marketName: 'Double Chance', outcomeDesc: '2X' },
        ],
      })
    ).toBe(true);
    expect(
      isTicketAllowedInDailyFeed({
        selections: [{ marketId: '10', marketName: 'Double Chance', outcomeId: '10', outcomeDesc: 'Home or Away' }],
      })
    ).toBe(false);
    expect(
      isTicketAllowedInDailyFeed({
        selections: [{ marketId: '4693', marketName: 'Double Chance', outcomeDesc: '12' }],
      })
    ).toBe(false);
  });
});

describe('Automatic Daily Generation Engine (50+ Unique Multi-Category Tickets)', () => {
  it('never repeats any match or team across 55 generated cards when enough fixtures are available', () => {
    const nowMs = Date.parse('2026-11-25T06:00:00.000Z');
    // 420 fixtures with unique teams + odds in 1.18–1.25 easily cover 55 disjoint cards
    const matches = Array.from({ length: 420 }, (_, idx) =>
      buildFixture(idx, {
        homeTeam: `UniqueHome ${idx}`,
        awayTeam: `UniqueAway ${idx}`,
        estimateStartTime: Date.parse('2026-11-25T10:00:00.000Z') + idx * 60000,
      })
    );

    const cfg: DailyFactoryConfig = {
      ...DEFAULT_DAILY_FACTORY_CONFIG,
      dailyTicketTarget: 55,
      maxTickets: 100,
      minIndividualOdds: 1.01,
      maxIndividualOdds: 1.25,
      minSelections: 2,
      maxSelections: 15,
      datePreset: 'CUSTOM',
      customStartDate: '2026-11-25',
      customEndDate: '2026-11-26',
      oddsCategories: DEFAULT_ODDS_CATEGORIES,
    };

    const result = generateDailyPortfolioFromMatches({
      matches,
      config: cfg,
      targetCount: 55,
      nowMs,
    });

    expect(result.tickets.length).toBe(55);
    const seenEvents = new Set<string>();
    const seenTeams = new Set<string>();
    for (const t of result.tickets) {
      for (const s of t.selections) {
        expect(seenEvents.has(s.eventId)).toBe(false);
        const hKey = normalizeTeamKey(s.homeTeam);
        const aKey = normalizeTeamKey(s.awayTeam);
        expect(seenTeams.has(hKey)).toBe(false);
        expect(seenTeams.has(aKey)).toBe(false);
        seenEvents.add(s.eventId);
        seenTeams.add(hKey);
        seenTeams.add(aKey);
      }
    }
  });

  it('never bets the same team twice across different fixtures when unused teams exist, and rejects duplicate shareCodes', () => {
    const nowMs = Date.parse('2026-11-25T06:00:00.000Z');
    const sharedTeamMatches = [
      buildFixture(1, { eventId: 'sr:match:sh1', homeTeam: 'Simba SC', awayTeam: 'Azam FC' }),
      buildFixture(2, { eventId: 'sr:match:sh2', homeTeam: 'Simba SC', awayTeam: 'Namungo FC' }),
      buildFixture(3, { eventId: 'sr:match:u3', homeTeam: 'Yanga SC', awayTeam: 'KMC FC' }),
      buildFixture(4, { eventId: 'sr:match:u4', homeTeam: 'Coastal Union', awayTeam: 'Singida FC' }),
      buildFixture(5, { eventId: 'sr:match:u5', homeTeam: 'Dodoma Jiji', awayTeam: 'Tabora Utd' }),
      buildFixture(6, { eventId: 'sr:match:u6', homeTeam: 'Fountain Gate', awayTeam: 'Mashujaa FC' }),
      buildFixture(7, { eventId: 'sr:match:u7', homeTeam: 'JKT Tanzania', awayTeam: 'Pamba Jiji' }),
      buildFixture(8, { eventId: 'sr:match:u8', homeTeam: 'Kagera Sugar', awayTeam: 'Prisons FC' }),
      buildFixture(9, { eventId: 'sr:match:u9', homeTeam: 'Kinondoni MC', awayTeam: 'Mbeya City' }),
      buildFixture(10, { eventId: 'sr:match:u10', homeTeam: 'Mtibwa Sugar', awayTeam: 'Biashara Utd' }),
    ];

    const cfg: DailyFactoryConfig = {
      ...DEFAULT_DAILY_FACTORY_CONFIG,
      dailyTicketTarget: 2,
      maxTickets: 10,
      datePreset: 'CUSTOM',
      customStartDate: '2026-11-25',
      customEndDate: '2026-11-26',
      oddsCategories: [
        {
          id: 'cat_small',
          label: '1.30–2.50',
          minCombinedOdds: 1.3,
          maxCombinedOdds: 2.5,
          targetCombinedOdds: 1.75,
          weight: 100,
        },
      ],
    };

    const result = generateDailyPortfolioFromMatches({
      matches: sharedTeamMatches,
      config: cfg,
      targetCount: 2,
      nowMs,
    });

    expect(result.tickets.length).toBe(2);
    const allTeams = result.tickets.flatMap((t) =>
      t.selections.flatMap((s) => [normalizeTeamKey(s.homeTeam), normalizeTeamKey(s.awayTeam)])
    );
    expect(new Set(allTeams).size).toBe(allTeams.length);
    expect(allTeams.filter((t) => t === 'simba sc').length).toBeLessThanOrEqual(1);

    // Duplicate booking code guard
    const sampleA = { ...result.tickets[0], internalTicketId: 'SB-DUP-TEST-A', shareCode: 'CODE99', bookingCodeStatus: 'GENERATED' as const };
    const sampleB = { ...result.tickets[1], internalTicketId: 'SB-DUP-TEST-B', shareCode: 'CODE99', bookingCodeStatus: 'GENERATED' as const };
    const inserted = automationStore.addTickets([sampleA, sampleB]);
    expect(inserted.find((t) => t.internalTicketId === 'SB-DUP-TEST-A')?.shareCode).toBe('CODE99');
    expect(inserted.find((t) => t.internalTicketId === 'SB-DUP-TEST-B')?.shareCode).toBeNull();
    automationStore.deleteTicket('SB-DUP-TEST-A');
    automationStore.deleteTicket('SB-DUP-TEST-B');
  });

  it('generates 55 distinct tickets across configured odds tiers even when match pool is smaller than 55 disjoint cards (controlled fallback)', () => {
    const nowMs = Date.parse('2026-11-25T06:00:00.000Z');
    const matches = Array.from({ length: 30 }, (_, idx) =>
      buildFixture(idx, {
        estimateStartTime: Date.parse('2026-11-25T10:00:00.000Z') + idx * 600000,
      })
    );

    const cfg: DailyFactoryConfig = {
      ...DEFAULT_DAILY_FACTORY_CONFIG,
      dailyTicketTarget: 55,
      maxTickets: 100,
      minIndividualOdds: 1.01,
      maxIndividualOdds: 1.25,
      minSelections: 2,
      maxSelections: 15,
      datePreset: 'CUSTOM',
      customStartDate: '2026-11-25',
      customEndDate: '2026-11-26',
      oddsCategories: DEFAULT_ODDS_CATEGORIES,
    };

    const result = generateDailyPortfolioFromMatches({
      matches,
      config: cfg,
      targetCount: 55,
      nowMs,
    });

    expect(result.tickets.length).toBeGreaterThanOrEqual(50);
    expect(result.tickets.length).toBeLessThanOrEqual(55);

    const signatures = new Set(result.tickets.map((t) => t.signature));
    expect(signatures.size).toBe(result.tickets.length);

    const categoriesHit = new Set(result.tickets.map((t) => t.categoryId));
    expect(categoriesHit.size).toBeGreaterThanOrEqual(3);

    for (const t of result.tickets) {
      const eventIds = t.selections.map((s) => s.eventId);
      expect(new Set(eventIds).size).toBe(eventIds.length);
      expect(t.selections.every((s) => s.odds >= 1.01 && s.odds <= 1.25)).toBe(true);
    }
  });

  it('rejects tickets during live pre-publish revalidation if an outcome odds shifted outside 1.01–1.25', () => {
    const nowMs = Date.parse('2026-11-25T06:00:00.000Z');
    const m1 = buildFixture(1, { estimateStartTime: Date.parse('2026-11-25T11:00:00.000Z') });
    const m2 = buildFixture(2, { estimateStartTime: Date.parse('2026-11-25T12:00:00.000Z') });
    const m3 = buildFixture(3, { estimateStartTime: Date.parse('2026-11-25T13:00:00.000Z') });
    const m4 = buildFixture(4, { estimateStartTime: Date.parse('2026-11-25T14:00:00.000Z') });

    const cfg: DailyFactoryConfig = {
      ...DEFAULT_DAILY_FACTORY_CONFIG,
      dailyTicketTarget: 2,
      datePreset: 'CUSTOM',
      customStartDate: '2026-11-25',
      customEndDate: '2026-11-26',
      oddsCategories: [
        {
          id: 'cat_small',
          label: '1.30–2.50',
          minCombinedOdds: 1.3,
          maxCombinedOdds: 2.5,
          targetCombinedOdds: 1.8,
          weight: 100,
        },
      ],
    };

    const { tickets } = generateDailyPortfolioFromMatches({
      matches: [m1, m2, m3, m4],
      config: cfg,
      targetCount: 2,
      nowMs,
    });
    expect(tickets.length).toBeGreaterThanOrEqual(1);

    const sample = tickets[0];
    const firstLeg = sample.selections[0];
    const mutatedMatch = buildFixture(1, {
      eventId: firstLeg.eventId,
      markets: [
        {
          marketId: firstLeg.marketId,
          name: firstLeg.marketName,
          desc: firstLeg.marketName,
          specifier: firstLeg.specifier || '',
          status: 0,
          banned: false,
          sourceType: 'BET_RADAR',
          lastOddsChangeTime: null,
          outcomes: [
            { outcomeId: firstLeg.outcomeId, desc: firstLeg.outcomeDesc, odds: 1.35, probability: 0.7, isActive: true },
          ],
        },
      ],
    });

    const lookup = new Map<string, NormalizedMatch | null>([
      [m1.eventId, m1.eventId === firstLeg.eventId ? mutatedMatch : m1],
      [m2.eventId, m2.eventId === firstLeg.eventId ? mutatedMatch : m2],
      [m3.eventId, m3.eventId === firstLeg.eventId ? mutatedMatch : m3],
      [m4.eventId, m4.eventId === firstLeg.eventId ? mutatedMatch : m4],
    ]);

    const check = revalidateTicketSelectionsAgainstMatches(sample.selections, lookup, cfg, nowMs);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain('outside');
  });
});

describe('Admin RBAC Check & Market Settlement Analytics', () => {
  it('authorizes verified jkambi00@gmail.com admin and rejects unverified or non-admin accounts', () => {
    expect(isAdminEmail('jkambi00@gmail.com', true)).toBe(true);
    expect(isAdminEmail('JKAMBI00@GMAIL.COM', true)).toBe(true);
    expect(isAdminEmail('jkambi00@gmail.com', false)).toBe(false);
    expect(isAdminEmail('regular.user@gmail.com', true)).toBe(false);
    expect(isAdminEmail(null, true)).toBe(false);
  });

  it('settles markets and aggregates category/market/league stats honestly', () => {
    expect(
      settleSingleSelectionOutcome(
        { marketId: '10', outcomeId: '9', outcomeDesc: 'Home or Draw', specifier: '' },
        { homeGoals: 2, awayGoals: 2 }
      ).status
    ).toBe('WON');

    expect(
      settleSingleSelectionOutcome(
        { marketId: '18', outcomeId: '12', outcomeDesc: 'Over 1.5', specifier: 'total=1.5' },
        { homeGoals: 1, awayGoals: 0 }
      ).status
    ).toBe('LOST');

    const baseTicket: GeneratedTicket = {
      internalTicketId: 'TKT-TEST-1',
      signature: 'sig1',
      sourceType: 'DAILY_FACTORY',
      categoryId: 'cat_2_3',
      categoryLabel: '2.00–3.00',
      targetOdds: 2.45,
      actualCombinedOdds: 2.2,
      oddsDifference: 0.25,
      selectionCount: 1,
      selections: [
        {
          selectionKey: 'sr:match:999::10::::9',
          eventId: 'sr:match:999',
          homeTeam: 'Alpha',
          awayTeam: 'Beta',
          leagueId: 'l1',
          leagueName: 'Premier League',
          country: 'England',
          estimateStartTime: Date.parse('2026-11-25T12:00:00.000Z'),
          matchStatus: 'Not start',
          isLive: false,
          marketId: '10',
          marketName: 'Double Chance',
          specifier: '',
          outcomeId: '9',
          outcomeDesc: 'Home or Draw',
          odds: 1.2,
          addedAt: '2026-11-25T08:00:00.000Z',
          retrievedAt: '2026-11-25T08:00:00.000Z',
        },
      ],
      kickoffStartMs: Date.parse('2026-11-25T12:00:00.000Z'),
      kickoffEndMs: Date.parse('2026-11-25T12:00:00.000Z'),
      dataSource: 'SportyBet TZ',
      generatedAt: '2026-11-25T08:00:00.000Z',
      generatedDateKey: '2026-11-25',
      published: true,
      revalidatedAt: '2026-11-25T08:00:00.000Z',
      status: 'PENDING',
      effectiveCombinedOdds: 2.2,
      selectionSettlements: [],
      shareCode: null,
      shareUrl: null,
      shareCodeDeadline: null,
      shareCodeVerified: false,
      bookingCodeStatus: 'FAILED',
      bookingCodeError: 'Share endpoint rejected slip',
      settledAt: null,
      lastCheckedAt: null,
    };

    const unverified = evaluateTicketSettlement(
      baseTicket,
      new Map([['sr:match:999', null]]),
      Date.parse('2026-11-25T18:00:00.000Z')
    );
    expect(unverified.status).toBe('UNVERIFIED');

    const analytics = computePerformanceAnalytics(
      [
        {
          ...baseTicket,
          internalTicketId: 't1',
          status: 'WON',
          shareCode: 'ABC123',
          shareCodeVerified: true,
          bookingCodeStatus: 'GENERATED',
        },
        { ...baseTicket, internalTicketId: 't2', status: 'LOST' },
        { ...baseTicket, internalTicketId: 't3', status: 'VOID' },
        unverified,
      ],
      { todayKey: '2026-11-25', dailyTarget: 55 }
    );

    expect(analytics.generatedToday).toBe(4);
    expect(analytics.validSharingCodes).toBe(1);
    expect(analytics.failedBookingCodes).toBe(3);
    expect(analytics.settledNonVoidDenominator).toBe(2);
    expect(analytics.winRatePct).toBe(50.0);
    expect(analytics.byCategory[0]?.label).toBe('2.00–3.00');
  });

  it('checks scheduler Africa/Dar_es_Salaam operating window', () => {
    expect(
      schedulerService.isWithinOperatingWindow(
        {
          ...DEFAULT_DAILY_FACTORY_CONFIG,
          windowStartTime: '06:00',
          windowEndTime: '23:00',
        },
        Date.parse('2026-11-25T07:00:00.000Z') // 10:00 EAT
      )
    ).toBe(true);
    expect(
      schedulerService.isWithinOperatingWindow(
        {
          ...DEFAULT_DAILY_FACTORY_CONFIG,
          windowStartTime: '06:00',
          windowEndTime: '23:00',
        },
        Date.parse('2026-11-25T22:00:00.000Z') // 01:00 EAT
      )
    ).toBe(false);
  });

  it('generates BP-prefixed betPawa TZ tickets with mapped market IDs and settles betPawa markets', () => {
    const nowMs = Date.parse('2026-11-25T06:00:00.000Z');
    const bpMatches: NormalizedMatch[] = Array.from({ length: 8 }, (_, idx) => ({
      ...buildFixture(idx, {
        eventId: `bp_ev_${idx}`,
        bookmakerId: 'BETPAWA_TZ',
        bookmakerName: 'betPawa Tanzania',
        dataSource: 'betPawa TZ Sportsbook API',
        estimateStartTime: Date.parse('2026-11-25T11:00:00.000Z') + idx * 600000,
      }),
      markets: [
        {
          marketId: '4693',
          name: 'Double Chance',
          desc: 'Double Chance',
          specifier: '',
          status: 0,
          banned: false,
          sourceType: 'BETPAWA_SPORTSBOOK',
          lastOddsChangeTime: null,
          outcomes: [
            { outcomeId: `p_${idx}_1`, desc: '1X', odds: 1.18, probability: 0.8, isActive: true },
            { outcomeId: `p_${idx}_2`, desc: 'X2', odds: 1.24, probability: 0.75, isActive: true },
          ],
        },
        {
          marketId: '4693',
          name: 'Double Chance',
          desc: 'Double Chance',
          specifier: '',
          status: 0,
          banned: false,
          sourceType: 'BETPAWA_SPORTSBOOK',
          lastOddsChangeTime: null,
          outcomes: [
            { outcomeId: `p_${idx}_dc1x`, desc: '1X', odds: 1.18, probability: 0.8, isActive: true },
            { outcomeId: `p_${idx}_dc12`, desc: '12', odds: 1.20, probability: 0.79, isActive: true },
            { outcomeId: `p_${idx}_dc2x`, desc: '2X', odds: 1.22, probability: 0.76, isActive: true },
          ],
        },
        {
          marketId: '5000',
          name: 'Total Goals',
          desc: 'Total Goals',
          specifier: 'total=0.5',
          status: 0,
          banned: false,
          sourceType: 'BETPAWA_SPORTSBOOK',
          lastOddsChangeTime: null,
          outcomes: [
            {
              outcomeId: `p_${idx}_1`,
              desc: 'Over 0.5',
              odds: 1.09,
              probability: 0.89,
              isActive: true,
            },
          ],
        },
        {
          marketId: '5000',
          name: 'Total Goals',
          desc: 'Total Goals',
          specifier: 'total=1.5',
          status: 0,
          banned: false,
          sourceType: 'BETPAWA_SPORTSBOOK',
          lastOddsChangeTime: null,
          outcomes: [
            {
              outcomeId: `p_${idx}_3`,
              desc: 'Over 1.5',
              odds: 1.21,
              probability: 0.78,
              isActive: true,
            },
          ],
        },
        {
          marketId: '3795',
          name: 'Both Teams To Score',
          desc: 'Both Teams To Score',
          specifier: '',
          status: 0,
          banned: false,
          sourceType: 'BETPAWA_SPORTSBOOK',
          lastOddsChangeTime: null,
          outcomes: [
            {
              outcomeId: `p_${idx}_4`,
              desc: 'No',
              odds: 1.24,
              probability: 0.75,
              isActive: true,
            },
          ],
        },
      ],
    }));

    const cfg: DailyFactoryConfig = {
      ...DEFAULT_DAILY_FACTORY_CONFIG,
      activeBookmaker: 'BETPAWA_TZ',
      dailyTicketTarget: 5,
      maxTickets: 10,
      markets: ['10', '18', '29'], // SportyBet IDs auto-mapped to 4693, 5000 & 3795 when BETPAWA_TZ is active
      datePreset: 'CUSTOM',
      customStartDate: '2026-11-25',
      customEndDate: '2026-11-26',
      oddsCategories: [
        {
          id: 'cat_bp_small',
          label: '1.30–2.50',
          minCombinedOdds: 1.3,
          maxCombinedOdds: 2.5,
          targetCombinedOdds: 1.7,
          weight: 100,
        },
      ],
    };

    const { tickets } = generateDailyPortfolioFromMatches({
      matches: bpMatches,
      config: cfg,
      targetCount: 5,
      nowMs,
    });

    expect(tickets.length).toBeGreaterThanOrEqual(3);
    for (const t of tickets) {
      expect(t.internalTicketId.startsWith('BP-')).toBe(true);
      expect(t.bookmakerId).toBe('BETPAWA_TZ');
      expect(
        t.selections.every((s) => s.marketId === '4693' || s.marketId === '5000' || s.marketId === '3795')
      ).toBe(true);
      expect(t.selections.some((s) => s.outcomeDesc === '12')).toBe(false);
      expect(isTicketAllowedInDailyFeed(t)).toBe(true);
    }

    expect(
      settleSingleSelectionOutcome(
        { marketId: '4693', outcomeId: 'p1', outcomeDesc: '1X', specifier: '' },
        { homeGoals: 1, awayGoals: 1 }
      ).status
    ).toBe('WON');
    expect(
      settleSingleSelectionOutcome(
        { marketId: '5000', outcomeId: 'p2', outcomeDesc: 'Over 1.5', specifier: 'total=1.5' },
        { homeGoals: 1, awayGoals: 0 }
      ).status
    ).toBe('LOST');
    expect(
      settleSingleSelectionOutcome(
        { marketId: '3795', outcomeId: 'p3', outcomeDesc: 'Yes', specifier: '' },
        { homeGoals: 2, awayGoals: 1 }
      ).status
    ).toBe('WON');
  });
});
