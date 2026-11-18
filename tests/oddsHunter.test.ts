import { describe, expect, it } from 'vitest';
import { BetPawaClient } from '../backend/integrations/betpawaClient.ts';
import { assertSameBookmakerSelections } from '../backend/integrations/bookmakerRegistry.ts';
import { SportyBetClient, SportyBetIntegrationError } from '../backend/integrations/sportybetClient.ts';
import { scannerConfigSchema, betslipPayloadSchema } from '../backend/middleware/validation.ts';
import {
  calculateCombinedOdds,
  calculateEstimatedReturn,
  detectDuplicateSelections,
  validateBetslipAgainstMatches,
} from '../backend/services/betslipService.ts';
import { filterAndScanMatches } from '../backend/services/scannerService.ts';
import type { BetslipSelection, NormalizedMatch, ScannerConfig } from '../src/types/sportybet.ts';

function makeMatch(overrides: Partial<NormalizedMatch> = {}): NormalizedMatch {
  return {
    eventId: 'sr:match:1001',
    gameId: '999',
    homeTeam: 'Simba SC',
    awayTeam: 'Young Africans',
    homeTeamId: 'sr:competitor:1',
    awayTeamId: 'sr:competitor:2',
    leagueId: 'sr:tournament:500',
    leagueName: 'Premier League',
    country: 'Tanzania',
    countryId: 'sr:category:100',
    estimateStartTime: Date.parse('2026-11-22T16:00:00.000Z'),
    kickoffIso: '2026-11-22T16:00:00.000Z',
    statusCode: 0,
    matchStatus: 'Not start',
    isLive: false,
    score: null,
    playedSeconds: null,
    totalMarketSize: 3,
    dataSource: 'SportyBet TZ (BET_RADAR)',
    retrievedAt: '2026-11-18T10:00:00.000Z',
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
          { outcomeId: '1', desc: 'Home', odds: 2.1, probability: 0.45, isActive: true },
          { outcomeId: '2', desc: 'Draw', odds: 3.2, probability: 0.28, isActive: true },
          { outcomeId: '3', desc: 'Away', odds: 3.4, probability: 0.27, isActive: true },
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
          { outcomeId: '9', desc: 'Home or Draw', odds: 1.28, probability: 0.74, isActive: true },
          { outcomeId: '10', desc: 'Home or Away', odds: 1.32, probability: 0.72, isActive: true },
          { outcomeId: '11', desc: 'Draw or Away', odds: 1.68, probability: 0.55, isActive: true },
        ],
      },
    ],
    ...overrides,
  };
}

function makeSelection(overrides: Partial<BetslipSelection> = {}): BetslipSelection {
  return {
    selectionKey: 'sr:match:1001::10::::9',
    eventId: 'sr:match:1001',
    homeTeam: 'Simba SC',
    awayTeam: 'Young Africans',
    leagueName: 'Premier League',
    country: 'Tanzania',
    estimateStartTime: Date.parse('2026-11-22T16:00:00.000Z'),
    matchStatus: 'Not start',
    isLive: false,
    marketId: '10',
    marketName: 'Double Chance',
    specifier: '',
    outcomeId: '9',
    outcomeDesc: 'Home or Draw',
    odds: 1.28,
    addedAt: '2026-11-18T10:00:00.000Z',
    ...overrides,
  };
}

describe('Odds Scanner Engine', () => {
  const baseConfig: ScannerConfig = {
    minOdds: 1.1,
    maxOdds: 1.5,
    startDate: '2026-11-18',
    endDate: '2026-11-30',
    sportId: 'sr:sport:1',
    leagues: [],
    matchStatus: 'ALL',
    markets: ['10'],
    maxResults: 50,
  };

  it('filters strictly by decimal odds bounds and market ID', () => {
    const matches = [makeMatch()];
    const results = filterAndScanMatches(matches, baseConfig);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.odds >= 1.1 && r.odds <= 1.5)).toBe(true);
    expect(results.every((r) => r.marketId === '10')).toBe(true);
  });

  it('filters strictly by startDate and endDate window', () => {
    const inRange = makeMatch({ eventId: 'sr:match:in' });
    const outOfRange = makeMatch({
      eventId: 'sr:match:out',
      estimateStartTime: Date.parse('2026-12-10T16:00:00.000Z'),
      kickoffIso: '2026-12-10T16:00:00.000Z',
    });

    const results = filterAndScanMatches([inRange, outOfRange], baseConfig);
    expect(results.every((r) => r.eventId === 'sr:match:in')).toBe(true);
  });

  it('skips suspended markets, banned markets, inactive outcomes, and invalid fixtures', () => {
    const client = new SportyBetClient();
    expect(client.normalizeEvent({ eventId: 'bad' } as never, {}, false, '')).toBeNull();
    expect(
      client.normalizeMarket({
        id: '1',
        outcomes: [{ id: '1', desc: 'Bad', odds: '1.00', isActive: 1 }],
      })
    ).toBeNull();

    const suspendedMatch = makeMatch({
      markets: [
        {
          marketId: '10',
          name: 'Double Chance',
          desc: 'Double Chance',
          specifier: '',
          status: 1, // suspended
          banned: false,
          sourceType: 'BET_RADAR',
          lastOddsChangeTime: null,
          outcomes: [
            { outcomeId: '9', desc: 'Home or Draw', odds: 1.25, probability: 0.7, isActive: true },
          ],
        },
        {
          marketId: '10',
          name: 'Double Chance',
          desc: 'Double Chance',
          specifier: 'alt',
          status: 0,
          banned: false,
          sourceType: 'BET_RADAR',
          lastOddsChangeTime: null,
          outcomes: [
            { outcomeId: '9', desc: 'Home or Draw', odds: 1.3, probability: 0.7, isActive: false },
          ],
        },
      ],
    });

    expect(filterAndScanMatches([suspendedMatch], baseConfig)).toHaveLength(0);
  });

  it('deduplicates identical selection keys across duplicate match objects', () => {
    const m = makeMatch();
    const results = filterAndScanMatches([m, m], baseConfig);
    expect(results).toHaveLength(2);
  });
});

describe('Bet Slip Math & Validation Engine', () => {
  it('calculates combined decimal odds and estimated returns accurately', () => {
    const combined = calculateCombinedOdds([{ odds: 1.25 }, { odds: 1.4 }, { odds: 1.6 }]);
    expect(combined).toBe(2.8);
    const { estimatedReturnTzs, potentialProfitTzs } = calculateEstimatedReturn(combined, 10000);
    expect(estimatedReturnTzs).toBe(28000);
    expect(potentialProfitTzs).toBe(18000);
  });

  it('detects duplicate events and duplicate selection keys', () => {
    const s1 = makeSelection({ selectionKey: 'k1', eventId: 'e1' });
    const s2 = makeSelection({ selectionKey: 'k2', eventId: 'e1', outcomeId: '10' });
    const { duplicateEvents } = detectDuplicateSelections([s1, s2]);
    expect(duplicateEvents.has('e1')).toBe(true);
  });

  it('detects odds changes, suspended markets, missing selections, and started matches', () => {
    const matchUpdated = makeMatch({
      eventId: 'sr:match:1001',
      markets: [
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
            { outcomeId: '9', desc: 'Home or Draw', odds: 1.42, probability: 0.65, isActive: true },
          ],
        },
      ],
    });

    const matchSuspended = makeMatch({
      eventId: 'sr:match:1002',
      isLive: true,
      markets: [
        {
          marketId: '10',
          name: 'Double Chance',
          desc: 'Double Chance',
          specifier: '',
          status: 2,
          banned: true,
          sourceType: 'BET_RADAR',
          lastOddsChangeTime: null,
          outcomes: [
            { outcomeId: '9', desc: 'Home or Draw', odds: 1.2, probability: 0.7, isActive: true },
          ],
        },
      ],
    });

    const lookup = new Map<string, NormalizedMatch | null>([
      ['sr:match:1001', matchUpdated],
      ['sr:match:1002', matchSuspended],
      ['sr:match:1003', null],
    ]);

    const slip: BetslipSelection[] = [
      makeSelection({ eventId: 'sr:match:1001', selectionKey: 's1', odds: 1.28 }),
      makeSelection({ eventId: 'sr:match:1002', selectionKey: 's2', odds: 1.2, isLive: false }),
      makeSelection({ eventId: 'sr:match:1003', selectionKey: 's3', odds: 1.35 }),
    ];

    const res = validateBetslipAgainstMatches(
      slip,
      lookup,
      Date.parse('2026-11-22T15:00:00.000Z')
    );

    expect(res.valid).toBe(false);
    expect(res.hasOddsChanges).toBe(true);
    expect(res.hasSuspendedMarkets).toBe(true);
    expect(res.hasStartedMatches).toBe(true);
    expect(res.hasMissingSelections).toBe(true);
    expect(res.items[0].oddsDiff).toBe(0.14);
  });
});

describe('Input Validation & Integration Failure Handling', () => {
  it('rejects invalid scanner bounds where maxOdds < minOdds', () => {
    const parsed = scannerConfigSchema.safeParse({
      minOdds: 2.0,
      maxOdds: 1.5,
      markets: ['10'],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects empty betslip payloads', () => {
    const parsed = betslipPayloadSchema.safeParse({ selections: [] });
    expect(parsed.success).toBe(false);
  });

  it('throws SportyBetIntegrationError on invalid booking code format without fake fallback', async () => {
    const client = new SportyBetClient();
    await expect(client.verifyBookingCode('!!')).rejects.toThrow(SportyBetIntegrationError);
  });
});

describe('betPawa TZ Normalization & Strict Multi-Bookmaker Isolation', () => {
  it('normalizes raw betPawa events, templates, handicaps, and suspended prices accurately', () => {
    const client = new BetPawaClient();
    const match = client.normalizeEvent(
      {
        id: '3141592',
        name: 'Yanga SC - Azam FC',
        startTime: '2026-11-28T16:00:00Z',
        participants: [
          { id: '11', name: 'Yanga SC', position: 1 },
          { id: '22', name: 'Azam FC', position: 2 },
        ],
        region: { id: 'tz', name: 'Tanzania' },
        competition: { id: '900', name: 'Ligi Kuu Bara' },
        markets: [
          {
            marketType: { id: '4693', name: 'Double Chance', displayName: 'Double Chance' },
            row: [
              {
                prices: [
                  { id: '9001', displayName: '{home} or Draw', odds: 1.15, suspended: false },
                  { id: '9002', displayName: 'Draw or {away}', odds: 2.1, suspended: true },
                ],
              },
            ],
          },
          {
            marketType: { id: '5000', name: 'Over/Under', displayName: 'Total Goals' },
            row: [
              {
                handicap: '1.5',
                prices: [
                  { id: '9011', displayName: 'Over {formattedHandicap}', odds: 1.22, handicap: '1.5' },
                  { id: '9012', displayName: 'Under {formattedHandicap}', odds: 3.4, handicap: '1.5' },
                ],
              },
            ],
          },
        ],
      },
      false,
      '2026-11-27T10:00:00.000Z'
    );

    expect(match).not.toBeNull();
    expect(match?.bookmakerId).toBe('BETPAWA_TZ');
    expect(match?.bookmakerName).toBe('betPawa Tanzania');
    expect(match?.markets).toHaveLength(2);
    expect(match?.markets[0].outcomes[0].desc).toBe('Yanga SC or Draw');
    expect(match?.markets[0].outcomes[1].isActive).toBe(false);
    expect(match?.markets[1].specifier).toBe('total=1.5');
    expect(match?.markets[1].outcomes[0].desc).toBe('Over 1.5');
  });

  it('enforces strict bookmaker isolation across betslip and booking code adapters', async () => {
    const bpSelection = makeSelection({
      bookmakerId: 'BETPAWA_TZ',
      bookmakerName: 'betPawa Tanzania',
      outcomeId: '9001',
    });
    const sbSelection = makeSelection({
      bookmakerId: 'SPORTYBET_TZ',
      bookmakerName: 'SportyBet Tanzania',
      outcomeId: '9',
    });

    expect(() => assertSameBookmakerSelections([bpSelection], 'SPORTYBET_TZ')).toThrow(
      /Platform isolation violation/
    );
    expect(() => assertSameBookmakerSelections([sbSelection], 'BETPAWA_TZ')).toThrow(
      /Platform isolation violation/
    );

    const bpClient = new BetPawaClient();
    await expect(bpClient.createBookingCode([sbSelection])).rejects.toThrow(
      /Cross-bookmaker isolation error/
    );

    const validation = validateBetslipAgainstMatches(
      [bpSelection, sbSelection],
      new Map(),
      Date.parse('2026-11-18T10:00:00.000Z')
    );
    expect(
      validation.globalWarnings.some((w) => w.includes('Keep SportyBet TZ and betPawa TZ'))
    ).toBe(true);
  });
});
