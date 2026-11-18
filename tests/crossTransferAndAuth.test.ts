import { describe, expect, it, vi } from 'vitest';
import {
  computeTeamSimilarity,
  findExactTargetMarketOutcome,
  matchFixtureToCandidates,
  normalizeTeamName,
  resolveCanonicalSelection,
} from '../backend/services/crossTransferService.ts';
import {
  isAdminEmail,
  isUserAuthorizedAdmin,
  requireAuthenticated,
  requireCronOrAdmin,
} from '../backend/middleware/adminAuth.ts';
import { platformConfigService } from '../backend/services/platformConfigService.ts';
import type { NormalizedMatch } from '../src/types/sportybet.ts';

function makeCandidateMatch(overrides: Partial<NormalizedMatch> = {}): NormalizedMatch {
  return {
    bookmakerId: 'BETPAWA_TZ',
    bookmakerName: 'betPawa Tanzania',
    eventId: 'bp_1001',
    gameId: '1001',
    homeTeam: 'Simba Sports Club',
    awayTeam: 'Young Africans',
    homeTeamId: 'h1',
    awayTeamId: 'a1',
    leagueId: 'tz_pl',
    leagueName: 'Tanzania Premier League',
    country: 'Tanzania',
    countryId: 'tz',
    estimateStartTime: Date.parse('2026-11-25T16:00:00.000Z'),
    kickoffIso: '2026-11-25T16:00:00.000Z',
    statusCode: 0,
    matchStatus: 'Not start',
    isLive: false,
    score: null,
    playedSeconds: null,
    totalMarketSize: 4,
    dataSource: 'betPawa TZ',
    retrievedAt: '2026-11-25T10:00:00.000Z',
    markets: [
      {
        marketId: '4693',
        name: 'Double Chance',
        desc: 'Double Chance',
        specifier: '',
        status: 0,
        banned: false,
        sourceType: 'BETPAWA',
        lastOddsChangeTime: null,
        outcomes: [
          { outcomeId: '1x', desc: '1X', odds: 1.24, probability: null, isActive: true },
          { outcomeId: '12', desc: '12', odds: 1.29, probability: null, isActive: true },
          { outcomeId: 'x2', desc: 'X2', odds: 1.55, probability: null, isActive: true },
        ],
      },
      {
        marketId: '5000',
        name: 'Over/Under',
        desc: 'Total Goals Over/Under',
        specifier: 'total=2.5',
        status: 0,
        banned: false,
        sourceType: 'BETPAWA',
        lastOddsChangeTime: null,
        outcomes: [
          { outcomeId: 'over_25', desc: 'Over 2.5', odds: 2.05, probability: null, isActive: true },
          { outcomeId: 'under_25', desc: 'Under 2.5', odds: 1.72, probability: null, isActive: true },
        ],
      },
      {
        marketId: '3795',
        name: 'Both Teams To Score',
        desc: 'GG/NG',
        specifier: '',
        status: 0,
        banned: false,
        sourceType: 'BETPAWA',
        lastOddsChangeTime: null,
        outcomes: [
          { outcomeId: 'yes', desc: 'Yes', odds: 1.9, probability: null, isActive: true },
          { outcomeId: 'no', desc: 'No', odds: 1.82, probability: null, isActive: true },
        ],
      },
    ],
    ...overrides,
  };
}

describe('Cross-Bookmaker Fixture Matching & Squad Safety', () => {
  it('normalizes club prefixes/suffixes cleanly', () => {
    expect(normalizeTeamName('Simba SC')).toBe('simba');
    expect(normalizeTeamName('Arsenal FC')).toBe('arsenal');
  });

  it('rejects Women, U21, and Reserve squads from matching senior teams', () => {
    expect(computeTeamSimilarity('Arsenal', 'Arsenal Women')).toBe(0);
    expect(computeTeamSimilarity('Chelsea', 'Chelsea U21')).toBe(0);
    expect(computeTeamSimilarity('Barcelona', 'Barcelona B')).toBe(0);
  });

  it('rejects conflicting rival pairs like Manchester United vs Manchester City', () => {
    expect(computeTeamSimilarity('Manchester United', 'Manchester City')).toBeLessThan(0.2);
  });

  it('matches genuine equivalent fixtures within kickoff tolerance and rejects distant matchweeks', () => {
    const candidate = makeCandidateMatch();
    const matched = matchFixtureToCandidates(
      {
        homeTeam: 'Simba SC',
        awayTeam: 'Young Africans',
        leagueName: 'Premier League',
        estimateStartTime: Date.parse('2026-11-25T16:15:00.000Z'),
      },
      [candidate]
    );
    expect(matched.bestMatch?.eventId).toBe('bp_1001');
    expect(matched.confidence).toBeGreaterThanOrEqual(0.7);

    // Same teams 5 days later -> must NOT match across matchweeks
    const distant = matchFixtureToCandidates(
      {
        homeTeam: 'Simba SC',
        awayTeam: 'Young Africans',
        estimateStartTime: Date.parse('2026-11-30T16:00:00.000Z'),
      },
      [candidate]
    );
    expect(distant.bestMatch).toBeNull();
  });
});

describe('Canonical Market & Strict Outcome Mapping', () => {
  it('maps SportyBet Double Chance 1X / 12 / X2 to exact betPawa Double Chance outcomes without substitution', () => {
    const targetMatch = makeCandidateMatch();

    const dc1X = resolveCanonicalSelection({
      bookmakerId: 'SPORTYBET_TZ',
      marketId: '10',
      marketName: 'Double Chance',
      outcomeId: '9',
      outcomeDesc: 'Home or Draw',
      homeTeam: 'Simba SC',
      awayTeam: 'Young Africans',
    });
    expect(dc1X?.canonicalMarket).toBe('DOUBLE_CHANCE_FT');
    expect(dc1X?.canonicalOutcome).toBe('1X');

    const hit1X = findExactTargetMarketOutcome(targetMatch, 'BETPAWA_TZ', dc1X!);
    expect(hit1X?.outcome.desc).toBe('1X');
    expect(hit1X?.outcome.odds).toBe(1.24);

    const dcX2 = resolveCanonicalSelection({
      bookmakerId: 'SPORTYBET_TZ',
      marketId: '10',
      marketName: 'Double Chance',
      outcomeId: '11',
      outcomeDesc: 'Draw or Away',
      homeTeam: 'Simba SC',
      awayTeam: 'Young Africans',
    });
    const hitX2 = findExactTargetMarketOutcome(targetMatch, 'BETPAWA_TZ', dcX2!);
    expect(hitX2?.outcome.desc).toBe('X2');
  });

  it('requires exact Over/Under goal line and refuses to substitute Over 1.5 with Over 2.5', () => {
    const targetMatch = makeCandidateMatch();

    const over15 = resolveCanonicalSelection({
      bookmakerId: 'SPORTYBET_TZ',
      marketId: '18',
      marketName: 'Over/Under',
      specifier: 'total=1.5',
      outcomeDesc: 'Over 1.5',
      homeTeam: 'Simba SC',
      awayTeam: 'Young Africans',
    });
    expect(over15?.line).toBe('1.5');
    // targetMatch only has 2.5 -> must return null instead of substituting
    expect(findExactTargetMarketOutcome(targetMatch, 'BETPAWA_TZ', over15!)).toBeNull();

    const over25 = resolveCanonicalSelection({
      bookmakerId: 'SPORTYBET_TZ',
      marketId: '18',
      marketName: 'Over/Under',
      specifier: 'total=2.5',
      outcomeDesc: 'Over 2.5',
      homeTeam: 'Simba SC',
      awayTeam: 'Young Africans',
    });
    const hit25 = findExactTargetMarketOutcome(targetMatch, 'BETPAWA_TZ', over25!);
    expect(hit25?.outcome.desc).toBe('Over 2.5');
  });

  it('keeps 1st Half isolated from Full Time and blocks corner/card/2H markets', () => {
    const targetMatch = makeCandidateMatch();
    const ht1x2 = resolveCanonicalSelection({
      bookmakerId: 'SPORTYBET_TZ',
      marketId: '60',
      marketName: '1st Half - 1X2',
      outcomeDesc: 'Home',
      homeTeam: 'Simba SC',
      awayTeam: 'Young Africans',
    });
    expect(ht1x2?.canonicalMarket).toBe('HT_1X2');
    expect(findExactTargetMarketOutcome(targetMatch, 'BETPAWA_TZ', ht1x2!)).toBeNull();

    const corners = resolveCanonicalSelection({
      bookmakerId: 'SPORTYBET_TZ',
      marketName: 'Total Corners Over/Under',
      specifier: 'total=8.5',
      outcomeDesc: 'Over 8.5',
      homeTeam: 'Simba SC',
      awayTeam: 'Young Africans',
    });
    expect(corners).toBeNull();
  });
});

describe('Platform Config Toggles, Admin RBAC & Cron Middleware', () => {
  it('authorizes verified bootstrapped admin emails and respects disable state', () => {
    expect(isAdminEmail('xbotmanager@gmail.com', true)).toBe(true);
    expect(isAdminEmail('xbotmanager@gmail.com', false)).toBe(false);
    expect(isAdminEmail('random@example.com', true)).toBe(false);

    expect(
      isUserAuthorizedAdmin({
        uid: 'admin_test_uid',
        email: 'xbotmanager@gmail.com',
        emailVerified: true,
      })
    ).toBe(true);
  });

  it('tracks platform integration enablement switches cleanly', () => {
    const initial = platformConfigService.getSettings();
    const updated = platformConfigService.updateSettings(
      { crossTransferEnabled: false },
      'xbotmanager@gmail.com'
    );
    expect(updated.crossTransferEnabled).toBe(false);
    expect(platformConfigService.isCrossTransferEnabled()).toBe(false);

    // Restore original setting
    platformConfigService.updateSettings(
      { crossTransferEnabled: initial.crossTransferEnabled },
      'test-restore'
    );
    expect(platformConfigService.isCrossTransferEnabled()).toBe(initial.crossTransferEnabled);
  });

  it('rejects unauthenticated requests in requireAuthenticated with 401', async () => {
    const req = { headers: {} } as Parameters<typeof requireAuthenticated>[0];
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const res = { status } as unknown as Parameters<typeof requireAuthenticated>[1];
    const next = vi.fn();

    await requireAuthenticated(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts valid CRON_SECRET bearer header in requireCronOrAdmin', async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test_vercel_cron_secret_123';
    try {
      const req = {
        headers: { authorization: 'Bearer test_vercel_cron_secret_123' },
      } as unknown as Parameters<typeof requireCronOrAdmin>[0];
      const status = vi.fn(() => ({ json: vi.fn() }));
      const res = { status } as unknown as Parameters<typeof requireCronOrAdmin>[1];
      const next = vi.fn();

      await requireCronOrAdmin(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });
});
