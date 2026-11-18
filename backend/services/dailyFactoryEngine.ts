import crypto from 'crypto';
import {
  getBookmakerInfo,
  getBookmakerMarketCatalog,
  normalizeBookmakerId,
} from '../config/bookmakers.ts';
import { getBookmakerClient } from '../integrations/bookmakerRegistry.ts';
import type {
  BookmakerId,
  DailyFactoryConfig,
  GeneratedTicket,
  NormalizedMatch,
  OddsCategoryConfig,
  TicketSelectionRecord,
} from '../../src/types/sportybet.ts';
import {
  DEFAULT_ALLOWED_DAILY_FEED_MARKETS,
  isDisallowedDailyFeedMarket,
  isDisallowedDailyFeedSelection,
  sanitizeDailyFactoryMarkets,
} from '../../src/utils/dailyFeedFilter.ts';

export const DEFAULT_ODDS_CATEGORIES: OddsCategoryConfig[] = [
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

export function getDateKeyInTimezone(
  ms: number,
  timezone = 'Africa/Dar_es_Salaam'
): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function getTimeMinutesInTimezone(
  ms: number,
  timezone = 'Africa/Dar_es_Salaam'
): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(ms));
    const [hh, mm] = formatted.split(':').map(Number);
    return (hh % 24) * 60 + mm;
  } catch {
    const d = new Date(ms);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}

export function parseHhMmToMinutes(hhmm: string, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return h * 60 + min;
}

export function isOddsWithinStrictBounds(
  odds: number,
  minIndividualOdds: number,
  maxIndividualOdds: number
): boolean {
  if (!Number.isFinite(odds) || odds <= 1.0) return false;
  const milliOdds = Math.round(odds * 1000);
  const milliMin = Math.round(minIndividualOdds * 1000);
  const milliMax = Math.round(maxIndividualOdds * 1000);
  return milliOdds >= milliMin && milliOdds <= milliMax;
}

export function normalizeTeamKey(teamName: string): string {
  return String(teamName || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function computeTicketSignature(selections: { selectionKey: string }[]): string {
  const sorted = [...selections].map((s) => s.selectionKey).sort().join('|');
  return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 24);
}

export function resolveFactoryDateRange(
  config: DailyFactoryConfig,
  nowMs = Date.now()
): { startDate: string; endDate: string } {
  const tz = config.timezone || 'Africa/Dar_es_Salaam';
  const today = getDateKeyInTimezone(nowMs, tz);
  const tomorrow = getDateKeyInTimezone(nowMs + 86400000, tz);

  if (config.datePreset === 'TOMORROW') {
    return { startDate: tomorrow, endDate: tomorrow };
  }
  if (config.datePreset === 'CUSTOM' && config.customStartDate) {
    const start = config.customStartDate;
    const end =
      config.customEndDate && config.customEndDate >= start
        ? config.customEndDate
        : start;
    return { startDate: start, endDate: end };
  }
  return { startDate: today, endDate: today };
}

const SPORTYBET_TO_BETPAWA_MARKETS: Record<string, string> = {
  '1': '3743',
  '10': '4693',
  '18': '5000',
  '29': '3795',
  '11': '4703',
  '26': '3774',
  '16': '5006',
  '14': '5003',
  '36': '4833',
};

const BETPAWA_TO_SPORTYBET_MARKETS: Record<string, string> = Object.fromEntries(
  Object.entries(SPORTYBET_TO_BETPAWA_MARKETS).map(([sb, bp]) => [bp, sb])
);

export function resolveEffectiveMarketsForBookmaker(
  markets: string[],
  bookmakerId: BookmakerId
): string[] {
  const catalogIds = new Set(
    getBookmakerMarketCatalog(bookmakerId)
      .filter((m) => !isDisallowedDailyFeedMarket(m.id, m.name))
      .map((m) => m.id)
  );
  const mapTable =
    bookmakerId === 'BETPAWA_TZ' ? SPORTYBET_TO_BETPAWA_MARKETS : BETPAWA_TO_SPORTYBET_MARKETS;

  const sanitizedInputs = sanitizeDailyFactoryMarkets(markets);
  const resolved: string[] = [];
  for (const clean of sanitizedInputs) {
    if (catalogIds.has(clean)) {
      resolved.push(clean);
    } else if (mapTable[clean] && catalogIds.has(mapTable[clean])) {
      resolved.push(mapTable[clean]);
    }
  }

  return Array.from(new Set(resolved));
}

export function discoverEligibleSelections(
  matches: NormalizedMatch[],
  config: DailyFactoryConfig,
  nowMs = Date.now()
): TicketSelectionRecord[] {
  const tz = config.timezone || 'Africa/Dar_es_Salaam';
  const { startDate, endDate } = resolveFactoryDateRange(config, nowMs);
  const minStartMinutes = parseHhMmToMinutes(config.windowStartTime, 0);
  const maxEndMinutes = parseHhMmToMinutes(config.windowEndTime, 23 * 60 + 59);
  const configuredBookmaker = normalizeBookmakerId(config.activeBookmaker);

  const leagueSet = new Set(
    (config.leagues || []).map((l) => l.trim().toLowerCase()).filter(Boolean)
  );
  const effectiveMarkets = resolveEffectiveMarketsForBookmaker(
    config.markets || [],
    matches[0]?.bookmakerId ? normalizeBookmakerId(matches[0].bookmakerId) : configuredBookmaker
  );
  const marketSet = new Set(effectiveMarkets);

  const seenSelectionKeys = new Set<string>();
  const candidates: TicketSelectionRecord[] = [];

  for (const match of matches) {
    if (!match || !match.eventId || !match.homeTeam || !match.awayTeam) continue;
    if (match.isLive || match.estimateStartTime <= nowMs) continue;
    if (match.statusCode !== 0 && match.statusCode !== 2) continue;

    const matchDateKey = getDateKeyInTimezone(match.estimateStartTime, tz);
    if (startDate && matchDateKey < startDate) continue;
    if (endDate && matchDateKey > endDate) continue;

    const kickoffMin = getTimeMinutesInTimezone(match.estimateStartTime, tz);
    if (minStartMinutes <= maxEndMinutes) {
      if (kickoffMin < minStartMinutes || kickoffMin > maxEndMinutes) continue;
    } else {
      if (kickoffMin < minStartMinutes && kickoffMin > maxEndMinutes) continue;
    }

    if (leagueSet.size > 0) {
      const idLow = match.leagueId.toLowerCase();
      const nameLow = match.leagueName.toLowerCase();
      const fullLow = `${match.country.toLowerCase()} - ${nameLow}`;
      if (!leagueSet.has(idLow) && !leagueSet.has(nameLow) && !leagueSet.has(fullLow)) {
        continue;
      }
    }

    for (const market of match.markets || []) {
      if (market.status !== 0 || market.banned) continue;
      if (isDisallowedDailyFeedMarket(market.marketId, market.desc || market.name)) {
        continue;
      }
      if (!config.anyMarket && marketSet.size > 0 && !marketSet.has(market.marketId)) {
        continue;
      }

      for (const outcome of market.outcomes || []) {
        if (!outcome.isActive) continue;
        if (
          isDisallowedDailyFeedSelection({
            marketId: market.marketId,
            marketName: market.desc || market.name,
            outcomeId: outcome.outcomeId,
            outcomeDesc: outcome.desc,
          })
        ) {
          continue;
        }
        if (
          !isOddsWithinStrictBounds(
            outcome.odds,
            config.minIndividualOdds,
            config.maxIndividualOdds
          )
        ) {
          continue;
        }

        const selectionKey = `${match.eventId}::${market.marketId}::${
          market.specifier || ''
        }::${outcome.outcomeId}`;
        if (seenSelectionKeys.has(selectionKey)) continue;
        seenSelectionKeys.add(selectionKey);

        const matchBookmaker = normalizeBookmakerId(match.bookmakerId || configuredBookmaker);
        const matchBookmakerInfo = getBookmakerInfo(matchBookmaker);

        candidates.push({
          selectionKey,
          bookmakerId: matchBookmaker,
          bookmakerName: match.bookmakerName || matchBookmakerInfo.name,
          eventId: match.eventId,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          leagueId: match.leagueId,
          leagueName: match.leagueName,
          country: match.country,
          estimateStartTime: match.estimateStartTime,
          matchStatus: match.matchStatus,
          isLive: false,
          marketId: market.marketId,
          marketName: market.desc || market.name,
          specifier: market.specifier || '',
          outcomeId: outcome.outcomeId,
          outcomeDesc: outcome.desc,
          odds: outcome.odds,
          addedAt: new Date(nowMs).toISOString(),
          retrievedAt: match.retrievedAt,
        });
      }
    }
  }

  return candidates;
}

export function buildCategoryCombination(params: {
  byEvent: Map<string, TicketSelectionRecord[]>;
  uniqueEvents: string[];
  category: OddsCategoryConfig;
  minLegs: number;
  maxLegs: number;
  existingSignatures: Set<string>;
  eventUsageCount: Map<string, number>;
  teamUsageCount?: Map<string, number>;
  excludedEventIds?: Set<string>;
  excludedTeamKeys?: Set<string>;
  disjointOnly?: boolean;
  attemptIdx: number;
}): TicketSelectionRecord[] | null {
  const {
    byEvent,
    uniqueEvents,
    category,
    minLegs,
    maxLegs,
    existingSignatures,
    eventUsageCount,
    teamUsageCount,
    excludedEventIds,
    excludedTeamKeys,
    disjointOnly = false,
    attemptIdx,
  } = params;

  const eligibleEvents = uniqueEvents.filter((evId) => {
    if (excludedEventIds?.has(evId)) return false;
    const sample = byEvent.get(evId)?.[0];
    if (!sample) return false;
    if (excludedTeamKeys) {
      const hKey = normalizeTeamKey(sample.homeTeam);
      const aKey = normalizeTeamKey(sample.awayTeam);
      if (excludedTeamKeys.has(hKey) || excludedTeamKeys.has(aKey)) {
        return false;
      }
    }
    return true;
  });

  const effectiveMaxLegs = Math.min(maxLegs, eligibleEvents.length, 25);
  if (eligibleEvents.length < minLegs) return null;

  // Deterministic diversified event ordering favoring completely unused/least-used teams & fixtures
  const rankedEvents = [...eligibleEvents].sort((ea, eb) => {
    const sa = byEvent.get(ea)?.[0];
    const sb = byEvent.get(eb)?.[0];
    const teamUseA = sa
      ? (teamUsageCount?.get(normalizeTeamKey(sa.homeTeam)) || 0) +
        (teamUsageCount?.get(normalizeTeamKey(sa.awayTeam)) || 0)
      : 0;
    const teamUseB = sb
      ? (teamUsageCount?.get(normalizeTeamKey(sb.homeTeam)) || 0) +
        (teamUsageCount?.get(normalizeTeamKey(sb.awayTeam)) || 0)
      : 0;
    const ua = (eventUsageCount.get(ea) || 0) * 2 + teamUseA;
    const ub = (eventUsageCount.get(eb) || 0) * 2 + teamUseB;
    if (ua !== ub) return ua - ub;
    const hashA = ((ea.charCodeAt(ea.length - 1) || 0) * 13 + attemptIdx * 17) % 101;
    const hashB = ((eb.charCodeAt(eb.length - 1) || 0) * 13 + attemptIdx * 23) % 101;
    return hashA - hashB;
  });

  interface BeamState {
    picks: TicketSelectionRecord[];
    usedEvents: Set<string>;
    usedTeams: Set<string>;
    product: number;
    score: number;
  }

  let beam: BeamState[] = [
    {
      picks: [],
      usedEvents: new Set(),
      usedTeams: new Set(),
      product: 1,
      score: category.targetCombinedOdds,
    },
  ];

  let bestValid: BeamState | null = null;
  const eventPool = rankedEvents.slice(0, Math.min(rankedEvents.length, 48));

  for (const evId of eventPool) {
    const rawOutcomes = byEvent.get(evId) || [];
    if (rawOutcomes.length === 0) continue;
    const evHomeKey = normalizeTeamKey(rawOutcomes[0].homeTeam);
    const evAwayKey = normalizeTeamKey(rawOutcomes[0].awayTeam);

    // In strict disjoint mode, prefer higher qualifying odds within 1.01-1.25 to conserve matches across 50+ cards
    const outcomes = [...rawOutcomes]
      .sort((a, b) => {
        if (disjointOnly) return b.odds - a.odds;
        if (attemptIdx % 3 === 0) return b.odds - a.odds;
        if (attemptIdx % 3 === 1) return a.odds - b.odds;
        return a.selectionKey.localeCompare(b.selectionKey);
      })
      .slice(0, 3);

    const nextBeam: BeamState[] = [...beam];

    for (const state of beam) {
      if (state.picks.length >= effectiveMaxLegs) continue;
      if (state.usedEvents.has(evId)) continue;
      if (state.usedTeams.has(evHomeKey) || state.usedTeams.has(evAwayKey)) continue;

      for (const out of outcomes) {
        const newProd = Number((state.product * out.odds).toFixed(4));
        if (newProd > category.maxCombinedOdds * 1.1 && state.picks.length + 1 >= minLegs) {
          continue;
        }

        const newPicks = [...state.picks, out];
        const newUsed = new Set(state.usedEvents);
        newUsed.add(evId);
        const newUsedTeams = new Set(state.usedTeams);
        newUsedTeams.add(evHomeKey);
        newUsedTeams.add(evAwayKey);

        const dist = Math.abs(newProd - category.targetCombinedOdds);
        const legPenalty =
          newProd < category.minCombinedOdds ? (category.minCombinedOdds - newProd) * 2 : 0;
        const conservationPenalty = disjointOnly ? newPicks.length * 0.08 : 0;
        const candidate: BeamState = {
          picks: newPicks,
          usedEvents: newUsed,
          usedTeams: newUsedTeams,
          product: newProd,
          score: dist + legPenalty + conservationPenalty,
        };

        if (
          newPicks.length >= minLegs &&
          newPicks.length <= effectiveMaxLegs &&
          newProd >= category.minCombinedOdds &&
          newProd <= category.maxCombinedOdds
        ) {
          const sig = computeTicketSignature(newPicks);
          if (!existingSignatures.has(sig)) {
            if (!bestValid || candidate.score < bestValid.score) {
              bestValid = candidate;
            }
          }
        }

        nextBeam.push(candidate);
      }
    }

    nextBeam.sort((a, b) => a.score - b.score);
    beam = nextBeam.slice(0, 32);
  }

  return bestValid ? bestValid.picks : null;
}

export function revalidateTicketSelectionsAgainstMatches(
  selections: TicketSelectionRecord[],
  matchLookup: Map<string, NormalizedMatch | null>,
  config: DailyFactoryConfig,
  nowMs = Date.now()
): { valid: boolean; refreshedSelections: TicketSelectionRecord[]; reason: string | null } {
  const seenEvents = new Set<string>();
  const refreshedSelections: TicketSelectionRecord[] = [];

  for (const sel of selections) {
    if (isDisallowedDailyFeedSelection(sel)) {
      return {
        valid: false,
        refreshedSelections: [],
        reason: 'Home/Away (12) and straight 1X2/DNB selections are excluded from Daily Feed tickets',
      };
    }
    if (seenEvents.has(sel.eventId)) {
      return { valid: false, refreshedSelections: [], reason: 'Duplicate event detected in ticket' };
    }
    seenEvents.add(sel.eventId);

    const liveMatch = matchLookup.get(sel.eventId);
    if (!liveMatch) {
      return {
        valid: false,
        refreshedSelections: [],
        reason: `Event ${sel.eventId} unavailable during pre-publish validation`,
      };
    }

    if (liveMatch.isLive || liveMatch.estimateStartTime <= nowMs) {
      return {
        valid: false,
        refreshedSelections: [],
        reason: `Match ${sel.homeTeam} vs ${sel.awayTeam} already started or went live`,
      };
    }

    const market = liveMatch.markets.find(
      (m) => m.marketId === sel.marketId && (m.specifier || '') === (sel.specifier || '')
    );
    if (!market || market.status !== 0 || market.banned) {
      return {
        valid: false,
        refreshedSelections: [],
        reason: `Market ${sel.marketName} suspended on ${sel.homeTeam} vs ${sel.awayTeam}`,
      };
    }

    const outcome = market.outcomes.find((o) => o.outcomeId === sel.outcomeId);
    if (!outcome || !outcome.isActive) {
      return {
        valid: false,
        refreshedSelections: [],
        reason: `Outcome ${sel.outcomeDesc} deactivated before publish`,
      };
    }

    if (
      !isOddsWithinStrictBounds(
        outcome.odds,
        config.minIndividualOdds,
        config.maxIndividualOdds
      )
    ) {
      return {
        valid: false,
        refreshedSelections: [],
        reason: `Live odds shifted to ${outcome.odds.toFixed(2)}, outside allowed ${config.minIndividualOdds.toFixed(
          2
        )}–${config.maxIndividualOdds.toFixed(2)} range`,
      };
    }

    refreshedSelections.push({
      ...sel,
      odds: outcome.odds,
      retrievedAt: liveMatch.retrievedAt,
    });
  }

  return { valid: true, refreshedSelections, reason: null };
}

export function generateDailyPortfolioFromMatches(params: {
  matches: NormalizedMatch[];
  config: DailyFactoryConfig;
  targetCount: number;
  sourceType?: 'DAILY_FACTORY' | 'ADMIN_MANUAL';
  existingSignatures?: Set<string>;
  existingEventIds?: Set<string>;
  existingTeamKeys?: Set<string>;
  nowMs?: number;
}): {
  tickets: GeneratedTicket[];
  eligibleSelectionsFound: number;
  shortfallReason: string | null;
} {
  const { matches, config } = params;
  const nowMs = params.nowMs ?? Date.now();
  const sourceType = params.sourceType ?? 'DAILY_FACTORY';
  const targetCount = Math.max(1, Math.min(200, params.targetCount));
  const existingSignatures = new Set(params.existingSignatures || []);

  const activeBookmaker = normalizeBookmakerId(
    matches[0]?.bookmakerId || config.activeBookmaker
  );
  const bookmakerInfo = getBookmakerInfo(activeBookmaker);

  const candidates = discoverEligibleSelections(matches, config, nowMs);
  if (candidates.length === 0) {
    return {
      tickets: [],
      eligibleSelectionsFound: 0,
      shortfallReason: `No upcoming ${bookmakerInfo.shortName} matches had active outcomes strictly between ${config.minIndividualOdds.toFixed(
        2
      )} and ${config.maxIndividualOdds.toFixed(2)} within the configured schedule.`,
    };
  }

  const byEvent = new Map<string, TicketSelectionRecord[]>();
  for (const c of candidates) {
    const arr = byEvent.get(c.eventId) || [];
    arr.push(c);
    byEvent.set(c.eventId, arr);
  }
  const uniqueEvents = Array.from(byEvent.keys());

  const categories =
    config.oddsCategories && config.oddsCategories.length > 0
      ? config.oddsCategories
      : DEFAULT_ODDS_CATEGORIES;

  const minLegs = Math.max(1, Math.min(25, config.minSelections));
  const maxLegs = Math.max(minLegs, Math.min(25, config.maxSelections));
  const tz = config.timezone || 'Africa/Dar_es_Salaam';
  const generatedAt = new Date(nowMs).toISOString();
  const generatedDateKey = getDateKeyInTimezone(nowMs, tz);
  const dataSource =
    activeBookmaker === 'BETPAWA_TZ'
      ? 'betPawa Tanzania Public API (/api/sportsbook/v4)'
      : 'SportyBet Tanzania Public API (/api/tz)';
  const ticketPrefix = activeBookmaker === 'BETPAWA_TZ' ? 'BP' : 'SB';

  // Compute proportional quota per category, then allow overflow attempts across remaining categories
  const totalWeight = categories.reduce((s, c) => s + Math.max(1, c.weight || 1), 0);
  const categorySchedule: OddsCategoryConfig[] = [];
  for (const cat of categories) {
    const share = Math.max(
      1,
      Math.round((Math.max(1, cat.weight || 1) / totalWeight) * targetCount)
    );
    for (let i = 0; i < share; i++) {
      categorySchedule.push(cat);
    }
  }

  const disjointUsedEvents = new Set<string>(params.existingEventIds || []);
  const disjointUsedTeams = new Set<string>(params.existingTeamKeys || []);
  const eventUsageCount = new Map<string, number>();
  const teamUsageCount = new Map<string, number>();
  for (const evId of disjointUsedEvents) {
    eventUsageCount.set(evId, 1);
  }
  for (const teamKey of disjointUsedTeams) {
    teamUsageCount.set(teamKey, 1);
  }

  const tickets: GeneratedTicket[] = [];
  let attemptCounter = 0;

  const pushGeneratedTicket = (picks: TicketSelectionRecord[], cat: OddsCategoryConfig) => {
    const sig = computeTicketSignature(picks);
    if (existingSignatures.has(sig)) return false;

    existingSignatures.add(sig);
    for (const p of picks) {
      disjointUsedEvents.add(p.eventId);
      const hKey = normalizeTeamKey(p.homeTeam);
      const aKey = normalizeTeamKey(p.awayTeam);
      disjointUsedTeams.add(hKey);
      disjointUsedTeams.add(aKey);
      eventUsageCount.set(p.eventId, (eventUsageCount.get(p.eventId) || 0) + 1);
      teamUsageCount.set(hKey, (teamUsageCount.get(hKey) || 0) + 1);
      teamUsageCount.set(aKey, (teamUsageCount.get(aKey) || 0) + 1);
    }

    const actualCombinedOdds = Number(
      picks.reduce((acc, p) => acc * p.odds, 1).toFixed(2)
    );
    const oddsDifference = Number((actualCombinedOdds - cat.targetCombinedOdds).toFixed(2));
    const kickoffStartMs = picks.reduce(
      (min, p) => Math.min(min, p.estimateStartTime),
      picks[0].estimateStartTime
    );
    const kickoffEndMs = picks.reduce(
      (max, p) => Math.max(max, p.estimateStartTime),
      picks[0].estimateStartTime
    );
    const internalTicketId = `${ticketPrefix}-${generatedDateKey.replace(/-/g, '')}-${crypto
      .randomBytes(3)
      .toString('hex')
      .toUpperCase()}`;

    tickets.push({
      internalTicketId,
      signature: sig,
      bookmakerId: activeBookmaker,
      bookmakerName: bookmakerInfo.name,
      bookmakerUrl: bookmakerInfo.websiteUrl,
      sourceType,
      categoryId: cat.id,
      categoryLabel: cat.label,
      targetOdds: cat.targetCombinedOdds,
      actualCombinedOdds,
      oddsDifference,
      selectionCount: picks.length,
      selections: picks,
      kickoffStartMs,
      kickoffEndMs,
      dataSource,
      generatedAt,
      generatedDateKey,
      published: true,
      revalidatedAt: generatedAt,
      status: 'PENDING',
      effectiveCombinedOdds: actualCombinedOdds,
      selectionSettlements: picks.map((p) => ({
        selectionKey: p.selectionKey,
        eventId: p.eventId,
        status: 'PENDING',
        officialMatchStatus: p.matchStatus,
        score: null,
        playedSeconds: null,
        currentOdds: p.odds,
        oddsChanged: false,
        reason: 'Awaiting kickoff',
        checkedAt: generatedAt,
      })),
      shareCode: null,
      shareUrl: null,
      shareCodeDeadline: null,
      shareCodeVerified: false,
      bookingCodeStatus: 'NOT_REQUESTED',
      bookingCodeError: null,
      settledAt: null,
      lastCheckedAt: null,
    });
    return true;
  };

  // PASS 1: Strict zero-repeat mode — never repeat any match or team across cards while unused fixtures exist
  let consecutiveFailures = 0;
  const maxPass1Iterations = Math.max(targetCount * 3, 180);
  for (let iter = 0; iter < maxPass1Iterations && tickets.length < targetCount; iter++) {
    const cat =
      categorySchedule[iter % categorySchedule.length] ||
      categories[iter % categories.length];

    const picks = buildCategoryCombination({
      byEvent,
      uniqueEvents,
      category: cat,
      minLegs,
      maxLegs,
      existingSignatures,
      eventUsageCount,
      teamUsageCount,
      excludedEventIds: disjointUsedEvents,
      excludedTeamKeys: disjointUsedTeams,
      disjointOnly: true,
      attemptIdx: attemptCounter++,
    });

    if (!picks || !pushGeneratedTicket(picks, cat)) {
      consecutiveFailures++;
      if (consecutiveFailures >= categories.length * 3) break;
      continue;
    }

    consecutiveFailures = 0;
  }

  // PASS 2: Fallback ONLY when not enough unused matches/teams remain to hit targetCount
  if (tickets.length < targetCount) {
    let fallbackFailures = 0;
    const maxPass2Iterations = Math.max((targetCount - tickets.length) * 4, 120);
    for (let iter = 0; iter < maxPass2Iterations && tickets.length < targetCount; iter++) {
      const cat =
        categorySchedule[(tickets.length + iter) % categorySchedule.length] ||
        categories[(tickets.length + iter) % categories.length];

      const picks = buildCategoryCombination({
        byEvent,
        uniqueEvents,
        category: cat,
        minLegs,
        maxLegs,
        existingSignatures,
        eventUsageCount,
        teamUsageCount,
        disjointOnly: false,
        attemptIdx: attemptCounter++,
      });

      if (!picks || !pushGeneratedTicket(picks, cat)) {
        fallbackFailures++;
        if (fallbackFailures >= categories.length * 4) break;
        continue;
      }

      fallbackFailures = 0;
    }
  }

  let shortfallReason: string | null = null;
  if (tickets.length < targetCount) {
    shortfallReason =
      tickets.length === 0
        ? `0 combinations satisfied target odds categories with individual odds strictly within ${config.minIndividualOdds.toFixed(
            2
          )}–${config.maxIndividualOdds.toFixed(2)} across ${uniqueEvents.length} qualifying upcoming matches.`
        : `Published ${tickets.length} of ${targetCount} daily target tickets from ${uniqueEvents.length} qualifying upcoming matches (${candidates.length} active selections within ${config.minIndividualOdds.toFixed(
            2
          )}–${config.maxIndividualOdds.toFixed(2)}). Remaining combinations were exhausted without duplicating tickets or relaxing odds bounds.`;
  }

  return {
    tickets,
    eligibleSelectionsFound: candidates.length,
    shortfallReason,
  };
}

export async function fetchUpcomingMatchesForFactory(
  config: DailyFactoryConfig
): Promise<NormalizedMatch[]> {
  const bookmakerId = normalizeBookmakerId(config.activeBookmaker);
  const client = getBookmakerClient(bookmakerId);
  const allCatalogMarkets = getBookmakerMarketCatalog(bookmakerId)
    .filter((m) => !isDisallowedDailyFeedMarket(m.id, m.name))
    .map((m) => m.id);
  const effectiveMarkets = resolveEffectiveMarketsForBookmaker(
    config.markets && config.markets.length > 0 ? config.markets : DEFAULT_ALLOWED_DAILY_FEED_MARKETS,
    bookmakerId
  );

  const marketIds = config.anyMarket
    ? allCatalogMarkets.join(',')
    : effectiveMarkets.length > 0
      ? effectiveMarkets.join(',')
      : allCatalogMarkets.join(',');

  const sportIds =
    bookmakerId === 'BETPAWA_TZ'
      ? ['2']
      : config.sportIds && config.sportIds.length > 0
        ? config.sportIds
        : ['sr:sport:1'];

  const allMatches: NormalizedMatch[] = [];
  const seenEvents = new Set<string>();

  for (const sportId of sportIds) {
    try {
      const { matches } = await client.getUpcomingMatches({
        pageNum: 1,
        pageSize: 100,
        maxPages: 8,
        marketIds,
        sportId,
      });
      for (const m of matches) {
        if (!seenEvents.has(m.eventId)) {
          seenEvents.add(m.eventId);
          allMatches.push(m);
        }
      }
    } catch {
      // Continue across configured sports if one feed is unavailable
    }
  }

  return allMatches;
}
