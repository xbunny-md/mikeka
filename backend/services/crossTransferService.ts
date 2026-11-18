import crypto from 'crypto';
import { getBookmakerInfo } from '../config/bookmakers.ts';
import {
  assertSameBookmakerSelections,
  getBookmakerClient,
} from '../integrations/bookmakerRegistry.ts';
import type {
  BetslipSelection,
  BookmakerId,
  CanonicalMarketId,
  CanonicalMarketInfo,
  NormalizedMarket,
  NormalizedMatch,
  NormalizedOutcome,
  TransferConfirmResponse,
  TransferDirection,
  TransferLegResult,
  TransferMatchCandidate,
  TransferPreviewResponse,
  TransferSourceSelection,
  TransferStatus,
} from '../../src/types/sportybet.ts';
import { backendLogger } from './logger.ts';
import { platformConfigService } from './platformConfigService.ts';

export const CANONICAL_MARKET_CATALOG: Record<CanonicalMarketId, CanonicalMarketInfo> = {
  '1X2_FT': {
    id: '1X2_FT',
    label: 'Match Winner (1X2 | Full Time)',
    sportybetMarketId: '1',
    betpawaMarketId: '3743',
    settlementRule: 'Regular time (90m + stoppage), excludes extra time and penalties.',
  },
  DOUBLE_CHANCE_FT: {
    id: 'DOUBLE_CHANCE_FT',
    label: 'Double Chance (Full Time)',
    sportybetMarketId: '10',
    betpawaMarketId: '4693',
    settlementRule: 'Regular time (1X, 12, or X2), excludes extra time.',
  },
  OVER_UNDER_FT: {
    id: 'OVER_UNDER_FT',
    label: 'Total Goals Over/Under (Full Time)',
    sportybetMarketId: '18',
    betpawaMarketId: '5000',
    settlementRule: 'Exact goal line over regular time (90m + stoppage).',
  },
  BTTS_FT: {
    id: 'BTTS_FT',
    label: 'Both Teams To Score (GG/NG | Full Time)',
    sportybetMarketId: '29',
    betpawaMarketId: '3795',
    settlementRule: 'Both teams score at least 1 goal in regular time (Yes/No).',
  },
  DRAW_NO_BET_FT: {
    id: 'DRAW_NO_BET_FT',
    label: 'Draw No Bet (Full Time)',
    sportybetMarketId: '11',
    betpawaMarketId: '4703',
    settlementRule: 'Home or Away win in regular time; voided (1.00) on draw.',
  },
  ODD_EVEN_FT: {
    id: 'ODD_EVEN_FT',
    label: 'Odd / Even Goals (Full Time)',
    sportybetMarketId: '26',
    betpawaMarketId: '4833',
    settlementRule: 'Total regular-time goals odd or even (0 counts as Even).',
  },
  HOME_OU_FT: {
    id: 'HOME_OU_FT',
    label: 'Home Team Total Goals Over/Under (FT)',
    sportybetMarketId: '19',
    betpawaMarketId: '5006',
    settlementRule: 'Home team goals over/under exact line in regular time.',
  },
  AWAY_OU_FT: {
    id: 'AWAY_OU_FT',
    label: 'Away Team Total Goals Over/Under (FT)',
    sportybetMarketId: '20',
    betpawaMarketId: '5003',
    settlementRule: 'Away team goals over/under exact line in regular time.',
  },
  ASIAN_HANDICAP_FT: {
    id: 'ASIAN_HANDICAP_FT',
    label: 'Asian Handicap (Full Time)',
    sportybetMarketId: '16',
    betpawaMarketId: '3774',
    settlementRule: '2-way goal spread handicap in regular time (exact line required).',
  },
  HT_1X2: {
    id: 'HT_1X2',
    label: '1st Half Winner (1X2)',
    sportybetMarketId: '60',
    betpawaMarketId: '3743_HT',
    settlementRule: 'Settled exclusively on 1st half (45m + stoppage) score.',
  },
  HT_OVER_UNDER: {
    id: 'HT_OVER_UNDER',
    label: '1st Half Total Goals Over/Under',
    sportybetMarketId: '68',
    betpawaMarketId: '5000_HT',
    settlementRule: 'Settled exclusively on 1st half goals.',
  },
  HT_DOUBLE_CHANCE: {
    id: 'HT_DOUBLE_CHANCE',
    label: '1st Half Double Chance',
    sportybetMarketId: '63',
    betpawaMarketId: '4693_HT',
    settlementRule: 'Settled exclusively on 1st half result (1X, 12, X2).',
  },
  HT_BTTS: {
    id: 'HT_BTTS',
    label: '1st Half Both Teams To Score',
    sportybetMarketId: '75',
    betpawaMarketId: '3795_HT',
    settlementRule: 'Both teams score in 1st half only.',
  },
};

const TEAM_NOISE_WORDS = new Set([
  'fc',
  'sc',
  'cf',
  'ac',
  'as',
  'fk',
  'sk',
  'afc',
  'bk',
  'if',
  'nk',
  'ss',
  'sv',
  'tsg',
  'vfb',
  'vfl',
  'club',
  'cd',
  'ud',
  'sd',
  'rc',
  'ca',
  'cs',
  'de',
  'la',
  'the',
]);

const SQUAD_QUALIFIER_PATTERNS: Array<{ tag: string; regex: RegExp }> = [
  { tag: 'WOMEN', regex: /\b(women|woman|ladies|fem|femenino|frauen|w)\b|\(w\)/i },
  { tag: 'U23', regex: /\bu[\s-]?23\b/i },
  { tag: 'U21', regex: /\bu[\s-]?21\b/i },
  { tag: 'U20', regex: /\bu[\s-]?20\b/i },
  { tag: 'U19', regex: /\bu[\s-]?19\b/i },
  { tag: 'U18', regex: /\bu[\s-]?18\b/i },
  { tag: 'RESERVES', regex: /\b(reserves|reserve|ii|b)\b/i },
];

function extractSquadQualifiers(teamName: string): Set<string> {
  const tags = new Set<string>();
  for (const p of SQUAD_QUALIFIER_PATTERNS) {
    if (p.regex.test(teamName)) {
      tags.add(p.tag);
    }
  }
  return tags;
}

export function normalizeTeamName(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned
    .split(' ')
    .filter((t) => t.length > 0 && !TEAM_NOISE_WORDS.has(t));

  return tokens.join(' ').trim() || cleaned;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) {
      prev[j] = curr[j];
    }
  }
  return prev[b.length];
}

export function computeTeamSimilarity(aRaw: string, bRaw: string): number {
  const qualA = extractSquadQualifiers(aRaw);
  const qualB = extractSquadQualifiers(bRaw);
  if (qualA.size !== qualB.size) return 0;
  for (const tag of qualA) {
    if (!qualB.has(tag)) return 0;
  }

  const a = normalizeTeamName(aRaw);
  const b = normalizeTeamName(bRaw);
  if (!a || !b) return 0;
  if (a === b) return 1;

  // Reject conflicting distinctive suffixes like "Manchester United" vs "Manchester City"
  const tokensA = a.split(' ');
  const tokensB = b.split(' ');
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  const conflictingPairs: Array<[string, string]> = [
    ['united', 'city'],
    ['real', 'atletico'],
    ['inter', 'ac'],
    ['rovers', 'wanderers'],
    ['north', 'south'],
    ['east', 'west'],
  ];
  for (const [x, y] of conflictingPairs) {
    if ((setA.has(x) && setB.has(y)) || (setA.has(y) && setB.has(x))) {
      return 0.1;
    }
  }

  let overlap = 0;
  for (const tok of setA) {
    if (setB.has(tok)) overlap++;
  }
  const jaccard = overlap / Math.max(setA.size, setB.size);

  const maxLen = Math.max(a.length, b.length);
  const levSim = 1 - levenshteinDistance(a, b) / maxLen;

  const substringBonus = a.includes(b) || b.includes(a) ? 0.12 : 0;
  return Math.min(1, Number((jaccard * 0.55 + levSim * 0.45 + substringBonus).toFixed(4)));
}

export function matchFixtureToCandidates(
  source: Pick<
    TransferSourceSelection,
    'homeTeam' | 'awayTeam' | 'leagueName' | 'estimateStartTime'
  >,
  candidates: NormalizedMatch[]
): {
  bestMatch: NormalizedMatch | null;
  confidence: number;
  rankedCandidates: TransferMatchCandidate[];
  reason: string;
} {
  const scored: Array<{ match: NormalizedMatch; score: number; reason: string }> = [];

  for (const cand of candidates) {
    const homeSim = computeTeamSimilarity(source.homeTeam, cand.homeTeam);
    const awaySim = computeTeamSimilarity(source.awayTeam, cand.awayTeam);
    if (homeSim < 0.55 || awaySim < 0.55) continue;

    let timeScore = 0.85;
    let timeDeltaHours = 0;
    if (source.estimateStartTime && source.estimateStartTime > 0 && cand.estimateStartTime > 0) {
      timeDeltaHours = Math.abs(source.estimateStartTime - cand.estimateStartTime) / 3600000;
      if (timeDeltaHours > 12) {
        continue; // Same teams on a different matchweek
      }
      if (timeDeltaHours <= 0.5) timeScore = 1;
      else if (timeDeltaHours <= 3) timeScore = 0.92;
      else timeScore = 0.75;
    }

    const leagueBonus =
      source.leagueName &&
      cand.leagueName &&
      computeTeamSimilarity(source.leagueName, cand.leagueName) >= 0.65
        ? 0.05
        : 0;

    const total = Math.min(
      1,
      Number(((homeSim * 0.45 + awaySim * 0.45) * timeScore + 0.1 * timeScore + leagueBonus).toFixed(4))
    );

    if (total >= 0.68) {
      scored.push({
        match: cand,
        score: total,
        reason: `Teams ${(homeSim * 100).toFixed(0)}% / ${(awaySim * 100).toFixed(0)}%${
          source.estimateStartTime ? `, kickoff Δ ${timeDeltaHours.toFixed(1)}h` : ''
        }`,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const rankedCandidates: TransferMatchCandidate[] = scored.slice(0, 3).map((s) => ({
    eventId: s.match.eventId,
    homeTeam: s.match.homeTeam,
    awayTeam: s.match.awayTeam,
    leagueName: s.match.leagueName,
    country: s.match.country,
    estimateStartTime: s.match.estimateStartTime,
    confidenceScore: s.score,
    reason: s.reason,
  }));

  if (scored.length === 0) {
    return {
      bestMatch: null,
      confidence: 0,
      rankedCandidates: [],
      reason: `Fixture "${source.homeTeam} vs ${source.awayTeam}" not found among active upcoming/live matches on target bookmaker.`,
    };
  }

  return {
    bestMatch: scored[0].match,
    confidence: scored[0].score,
    rankedCandidates,
    reason: scored[0].reason,
  };
}

export interface CanonicalMarketResolution {
  canonicalMarket: CanonicalMarketId;
  line: string | null; // e.g. "1.5", "2.5", "-0.5"
  canonicalOutcome: string; // e.g. "1X", "OVER", "YES", "HOME"
  settlementRuleNote: string;
}

function extractNumericLine(text: string): string | null {
  const m = text.match(/([+-]?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  // Normalize 2.50 -> 2.5, keep -0.5 as -0.5
  return String(num);
}

function detectPeriod(marketName: string, marketId?: string): 'HT' | '2H' | 'FT' {
  const n = marketName.toLowerCase();
  if (
    n.includes('1st half') ||
    n.includes('first half') ||
    n.includes('half time') ||
    n.includes('half-time') ||
    marketId === '60' ||
    marketId === '63' ||
    marketId === '68' ||
    marketId === '75'
  ) {
    return 'HT';
  }
  if (n.includes('2nd half') || n.includes('second half')) {
    return '2H';
  }
  return 'FT';
}

export function resolveCanonicalSelection(
  input: {
    bookmakerId: BookmakerId;
    marketId?: string;
    marketName: string;
    specifier?: string;
    outcomeId?: string;
    outcomeDesc: string;
    homeTeam: string;
    awayTeam: string;
  }
): CanonicalMarketResolution | null {
  const mId = String(input.marketId || '').trim();
  const mName = input.marketName.toLowerCase().trim();
  const spec = String(input.specifier || '').trim();
  const oId = String(input.outcomeId || '').trim();
  const oDesc = input.outcomeDesc.toLowerCase().trim();
  const homeNorm = normalizeTeamName(input.homeTeam);
  const awayNorm = normalizeTeamName(input.awayTeam);
  const oDescNorm = normalizeTeamName(input.outcomeDesc);
  const period = detectPeriod(input.marketName, mId);

  // Guard against unsupported 2nd half or special player/corner/card markets silently mapping to FT
  if (period === '2H' || /corner|card|booking|penalty|scorer|minute|exact score|correct score/i.test(mName)) {
    return null;
  }

  // 1. 1X2 (Match Winner)
  const is1X2 =
    (input.bookmakerId === 'SPORTYBET_TZ' && (mId === '1' || mId === '60')) ||
    (input.bookmakerId === 'BETPAWA_TZ' && mId === '3743') ||
    /\b1x2\b|match winner|full time result|match result/i.test(mName);

  if (is1X2 && !mName.includes('double chance') && !mName.includes('handicap')) {
    let outcome: string | null = null;
    if (oDesc === '1' || oDesc === 'home' || (homeNorm && oDescNorm === homeNorm) || (input.bookmakerId === 'SPORTYBET_TZ' && mId === '1' && oId === '1')) {
      outcome = 'HOME';
    } else if (oDesc === 'x' || oDesc === 'draw' || (input.bookmakerId === 'SPORTYBET_TZ' && mId === '1' && oId === '2')) {
      outcome = 'DRAW';
    } else if (oDesc === '2' || oDesc === 'away' || (awayNorm && oDescNorm === awayNorm) || (input.bookmakerId === 'SPORTYBET_TZ' && mId === '1' && oId === '3')) {
      outcome = 'AWAY';
    }
    if (!outcome) return null;
    const cm: CanonicalMarketId = period === 'HT' ? 'HT_1X2' : '1X2_FT';
    return {
      canonicalMarket: cm,
      line: null,
      canonicalOutcome: outcome,
      settlementRuleNote: CANONICAL_MARKET_CATALOG[cm].settlementRule,
    };
  }

  // 2. Double Chance
  const isDC =
    (input.bookmakerId === 'SPORTYBET_TZ' && (mId === '10' || mId === '63')) ||
    (input.bookmakerId === 'BETPAWA_TZ' && mId === '4693') ||
    /double chance/i.test(mName);

  if (isDC) {
    let outcome: string | null = null;
    const compact = oDesc.replace(/\s+/g, '');
    if (
      compact === '1x' ||
      compact === 'homeordraw' ||
      (oDesc.includes('draw') && (oDesc.includes('home') || (homeNorm && oDescNorm.includes(homeNorm)))) ||
      (input.bookmakerId === 'SPORTYBET_TZ' && mId === '10' && oId === '9')
    ) {
      outcome = '1X';
    } else if (
      compact === '12' ||
      compact === 'homeoraway' ||
      (oDesc.includes('home') && oDesc.includes('away')) ||
      (homeNorm && awayNorm && oDescNorm.includes(homeNorm) && oDescNorm.includes(awayNorm)) ||
      (input.bookmakerId === 'SPORTYBET_TZ' && mId === '10' && oId === '10')
    ) {
      outcome = '12';
    } else if (
      compact === 'x2' ||
      compact === 'draworaway' ||
      (oDesc.includes('draw') && (oDesc.includes('away') || (awayNorm && oDescNorm.includes(awayNorm)))) ||
      (input.bookmakerId === 'SPORTYBET_TZ' && mId === '10' && oId === '11')
    ) {
      outcome = 'X2';
    }
    if (!outcome) return null;
    const cm: CanonicalMarketId = period === 'HT' ? 'HT_DOUBLE_CHANCE' : 'DOUBLE_CHANCE_FT';
    return {
      canonicalMarket: cm,
      line: null,
      canonicalOutcome: outcome,
      settlementRuleNote: CANONICAL_MARKET_CATALOG[cm].settlementRule,
    };
  }

  // 3. Home / Away Team Total Goals Over/Under
  const isHomeOU =
    (input.bookmakerId === 'SPORTYBET_TZ' && mId === '19') ||
    (input.bookmakerId === 'BETPAWA_TZ' && mId === '5006') ||
    /home.*(over\/under|total)/i.test(mName) ||
    (homeNorm.length >= 3 && mName.includes(homeNorm) && /over|under|total/i.test(mName));

  const isAwayOU =
    (input.bookmakerId === 'SPORTYBET_TZ' && mId === '20') ||
    (input.bookmakerId === 'BETPAWA_TZ' && mId === '5003') ||
    /away.*(over\/under|total)/i.test(mName) ||
    (awayNorm.length >= 3 && mName.includes(awayNorm) && /over|under|total/i.test(mName));

  if ((isHomeOU || isAwayOU) && period === 'FT') {
    const line = extractNumericLine(spec) || extractNumericLine(oDesc);
    const side = oDesc.includes('over') ? 'OVER' : oDesc.includes('under') ? 'UNDER' : null;
    if (!line || !side) return null;
    const cm: CanonicalMarketId = isHomeOU ? 'HOME_OU_FT' : 'AWAY_OU_FT';
    return {
      canonicalMarket: cm,
      line,
      canonicalOutcome: `${side}_${line}`,
      settlementRuleNote: CANONICAL_MARKET_CATALOG[cm].settlementRule,
    };
  }

  // 4. Match Total Goals Over/Under
  const isOU =
    (input.bookmakerId === 'SPORTYBET_TZ' && (mId === '18' || mId === '68')) ||
    (input.bookmakerId === 'BETPAWA_TZ' && mId === '5000') ||
    (/\b(over\/under|total goals|o\/u)\b/i.test(mName) && !mName.includes('&') && !mName.includes('gg'));

  if (isOU) {
    const line = extractNumericLine(spec) || extractNumericLine(oDesc);
    const side = oDesc.includes('over') ? 'OVER' : oDesc.includes('under') ? 'UNDER' : null;
    if (!line || !side) return null;
    const cm: CanonicalMarketId = period === 'HT' ? 'HT_OVER_UNDER' : 'OVER_UNDER_FT';
    return {
      canonicalMarket: cm,
      line,
      canonicalOutcome: `${side}_${line}`,
      settlementRuleNote: CANONICAL_MARKET_CATALOG[cm].settlementRule,
    };
  }

  // 5. Both Teams To Score (GG/NG)
  const isBTTS =
    (input.bookmakerId === 'SPORTYBET_TZ' && (mId === '29' || mId === '75')) ||
    (input.bookmakerId === 'BETPAWA_TZ' && mId === '3795') ||
    /both teams to score|gg\/ng|\bbtts\b/i.test(mName);

  if (isBTTS && !mName.includes('&') && !mName.includes('over')) {
    let outcome: string | null = null;
    if (oDesc === 'yes' || oDesc === 'gg') outcome = 'YES';
    else if (oDesc === 'no' || oDesc === 'ng') outcome = 'NO';
    if (!outcome) return null;
    const cm: CanonicalMarketId = period === 'HT' ? 'HT_BTTS' : 'BTTS_FT';
    return {
      canonicalMarket: cm,
      line: null,
      canonicalOutcome: outcome,
      settlementRuleNote: CANONICAL_MARKET_CATALOG[cm].settlementRule,
    };
  }

  // 6. Draw No Bet
  const isDNB =
    (input.bookmakerId === 'SPORTYBET_TZ' && mId === '11') ||
    (input.bookmakerId === 'BETPAWA_TZ' && mId === '4703') ||
    /draw no bet|\bdnb\b/i.test(mName);

  if (isDNB && period === 'FT') {
    let outcome: string | null = null;
    if (oDesc === '1' || oDesc === 'home' || (homeNorm && oDescNorm === homeNorm)) outcome = 'HOME';
    else if (oDesc === '2' || oDesc === 'away' || (awayNorm && oDescNorm === awayNorm)) outcome = 'AWAY';
    if (!outcome) return null;
    return {
      canonicalMarket: 'DRAW_NO_BET_FT',
      line: null,
      canonicalOutcome: outcome,
      settlementRuleNote: CANONICAL_MARKET_CATALOG.DRAW_NO_BET_FT.settlementRule,
    };
  }

  // 7. Odd / Even Goals
  const isOE =
    (input.bookmakerId === 'SPORTYBET_TZ' && mId === '26') ||
    (input.bookmakerId === 'BETPAWA_TZ' && mId === '4833') ||
    /odd\s*\/?\s*even/i.test(mName);

  if (isOE && period === 'FT') {
    let outcome: string | null = null;
    if (oDesc === 'odd') outcome = 'ODD';
    else if (oDesc === 'even') outcome = 'EVEN';
    if (!outcome) return null;
    return {
      canonicalMarket: 'ODD_EVEN_FT',
      line: null,
      canonicalOutcome: outcome,
      settlementRuleNote: CANONICAL_MARKET_CATALOG.ODD_EVEN_FT.settlementRule,
    };
  }

  // 8. Asian Handicap (2-way)
  const isAH =
    (input.bookmakerId === 'SPORTYBET_TZ' && mId === '16') ||
    (input.bookmakerId === 'BETPAWA_TZ' && mId === '3774') ||
    /asian handicap/i.test(mName);

  if (isAH && period === 'FT' && !mName.includes('european') && !mName.includes('3-way')) {
    const line = extractNumericLine(spec) || extractNumericLine(oDesc);
    if (!line) return null;
    let side: 'HOME' | 'AWAY' | null = null;
    if (oDesc.includes('home') || (homeNorm && oDescNorm.includes(homeNorm)) || oDesc.startsWith('1 ')) {
      side = 'HOME';
    } else if (oDesc.includes('away') || (awayNorm && oDescNorm.includes(awayNorm)) || oDesc.startsWith('2 ')) {
      side = 'AWAY';
    }
    if (!side) return null;
    return {
      canonicalMarket: 'ASIAN_HANDICAP_FT',
      line,
      canonicalOutcome: `${side}_${line}`,
      settlementRuleNote: CANONICAL_MARKET_CATALOG.ASIAN_HANDICAP_FT.settlementRule,
    };
  }

  return null;
}

export function findExactTargetMarketOutcome(
  targetMatch: NormalizedMatch,
  targetBookmaker: BookmakerId,
  sourceCanonical: CanonicalMarketResolution
): { market: NormalizedMarket; outcome: NormalizedOutcome } | null {
  for (const m of targetMatch.markets) {
    if (m.banned || m.status !== 0) continue;
    for (const o of m.outcomes) {
      if (!o.isActive || o.odds <= 1.0) continue;
      const candCanonical = resolveCanonicalSelection({
        bookmakerId: targetBookmaker,
        marketId: m.marketId,
        marketName: m.desc || m.name,
        specifier: m.specifier,
        outcomeId: o.outcomeId,
        outcomeDesc: o.desc,
        homeTeam: targetMatch.homeTeam,
        awayTeam: targetMatch.awayTeam,
      });

      if (!candCanonical) continue;
      if (
        candCanonical.canonicalMarket === sourceCanonical.canonicalMarket &&
        candCanonical.canonicalOutcome === sourceCanonical.canonicalOutcome &&
        candCanonical.line === sourceCanonical.line
      ) {
        return { market: m, outcome: o };
      }
    }
  }
  return null;
}

async function fetchCandidatePoolForBookmaker(
  targetBookmaker: BookmakerId
): Promise<NormalizedMatch[]> {
  const client = getBookmakerClient(targetBookmaker);
  const [liveRes, upcomingRes] = await Promise.all([
    client.getLiveMatches().catch(() => [] as NormalizedMatch[]),
    client
      .getUpcomingMatches({ pageNum: 1, pageSize: 100, maxPages: 4 })
      .catch(() => ({ matches: [] as NormalizedMatch[], totalAvailable: 0 })),
  ]);

  const byId = new Map<string, NormalizedMatch>();
  for (const m of [...upcomingRes.matches, ...liveRes]) {
    if (!byId.has(m.eventId)) {
      byId.set(m.eventId, m);
    }
  }
  return Array.from(byId.values());
}

export function getBookmakerHandoffUrl(bookmakerId: BookmakerId): string {
  return getBookmakerInfo(bookmakerId).websiteUrl;
}

export async function previewCrossBookmakerTransfer(params: {
  direction: TransferDirection;
  bookingCode?: string;
  manualSelections?: TransferSourceSelection[];
  actorUid?: string | null;
  actorEmail?: string | null;
}): Promise<TransferPreviewResponse> {
  const sourceBookmaker: BookmakerId =
    params.direction === 'SPORTYBET_TO_BETPAWA' ? 'SPORTYBET_TZ' : 'BETPAWA_TZ';
  const targetBookmaker: BookmakerId =
    params.direction === 'SPORTYBET_TO_BETPAWA' ? 'BETPAWA_TZ' : 'SPORTYBET_TZ';

  const sourceInfo = getBookmakerInfo(sourceBookmaker);
  const targetInfo = getBookmakerInfo(targetBookmaker);
  const transferId = `tr_${crypto.randomBytes(5).toString('hex')}`;
  const checkedAt = new Date().toISOString();
  const cleanCode = (params.bookingCode || '').trim().toUpperCase();
  const manualHandoffUrl = getBookmakerHandoffUrl(targetBookmaker);

  let sourceSelections: TransferSourceSelection[] = [];
  const warnings: string[] = [];

  if (cleanCode) {
    try {
      const sourceClient = getBookmakerClient(sourceBookmaker);
      const imported = await sourceClient.verifyBookingCode(cleanCode);
      if (!imported || imported.selections.length === 0) {
        throw new Error(`Booking code ${cleanCode} returned no selections on ${sourceInfo.shortName}.`);
      }
      sourceSelections = imported.selections.map((s, idx) => ({
        id: s.selectionKey || `src_${idx}`,
        homeTeam: s.homeTeam,
        awayTeam: s.awayTeam,
        leagueName: s.leagueName,
        country: s.country,
        estimateStartTime: s.estimateStartTime,
        marketId: s.marketId,
        marketName: s.marketName,
        specifier: s.specifier,
        outcomeId: s.outcomeId,
        outcomeDesc: s.outcomeDesc,
        odds: s.odds,
        eventId: s.eventId,
      }));
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : `Unable to import booking code ${cleanCode} from ${sourceInfo.shortName}.`;

      backendLogger.warn('TRANSFER', 'SOURCE_CODE_IMPORT_FAILED', errMsg, {
        actorUid: params.actorUid,
        actorEmail: params.actorEmail,
        metadata: { direction: params.direction, code: cleanCode },
      });

      const failedPreview: TransferPreviewResponse = {
        transferId,
        direction: params.direction,
        sourceBookmaker,
        sourceBookmakerName: sourceInfo.name,
        targetBookmaker,
        targetBookmakerName: targetInfo.name,
        originalCode: cleanCode,
        status: 'MANUAL_IMPORT_REQUIRED',
        originalSelectionCount: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        unavailableCount: 0,
        originalCombinedOdds: 1,
        targetCombinedOdds: null,
        legs: [],
        matchedSelections: [],
        warnings: [
          errMsg,
          'You can still enter or paste the original selections manually below to match and transfer them.',
        ],
        manualHandoffUrl,
        checkedAt,
      };

      platformConfigService.recordTransfer({
        transferId,
        direction: params.direction,
        sourceBookmaker,
        targetBookmaker,
        originalCode: cleanCode,
        targetBookingCode: null,
        targetShareUrl: null,
        status: 'MANUAL_IMPORT_REQUIRED',
        originalSelectionCount: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        originalCombinedOdds: 1,
        targetCombinedOdds: null,
        actorUid: params.actorUid || null,
        actorEmail: params.actorEmail || null,
        errorMessage: errMsg,
        createdAt: checkedAt,
      });

      return failedPreview;
    }
  } else if (params.manualSelections && params.manualSelections.length > 0) {
    sourceSelections = params.manualSelections;
  }

  const originalCombinedOdds = Number(
    sourceSelections.reduce((acc, s) => acc * (Number(s.odds) || 1), 1).toFixed(2)
  );

  const candidatePool = await fetchCandidatePoolForBookmaker(targetBookmaker);
  const targetClient = getBookmakerClient(targetBookmaker);
  const enabledMarkets = new Set(platformConfigService.getSettings().supportedTransferMarkets);

  const detailedMatchCache = new Map<string, NormalizedMatch>();
  const legs: TransferLegResult[] = [];
  const matchedSelections: BetslipSelection[] = [];

  for (const src of sourceSelections) {
    const canonical = resolveCanonicalSelection({
      bookmakerId: sourceBookmaker,
      marketId: src.marketId,
      marketName: src.marketName,
      specifier: src.specifier,
      outcomeId: src.outcomeId,
      outcomeDesc: src.outcomeDesc,
      homeTeam: src.homeTeam,
      awayTeam: src.awayTeam,
    });

    if (!canonical) {
      legs.push({
        sourceSelection: src,
        status: 'UNAVAILABLE',
        canonicalMarket: null,
        canonicalOutcome: null,
        targetSelection: null,
        targetOdds: null,
        oddsDifference: null,
        matchConfidence: 0,
        settlementRuleNote: 'No verified equivalent market settlement rule across both platforms.',
        reason: `Market "${src.marketName}" (${src.outcomeDesc}) has no verified 1:1 cross-bookmaker mapping. Outcome not substituted.`,
      });
      continue;
    }

    if (!enabledMarkets.has(canonical.canonicalMarket)) {
      legs.push({
        sourceSelection: src,
        status: 'UNAVAILABLE',
        canonicalMarket: canonical.canonicalMarket,
        canonicalOutcome: canonical.canonicalOutcome,
        targetSelection: null,
        targetOdds: null,
        oddsDifference: null,
        matchConfidence: 0,
        settlementRuleNote: canonical.settlementRuleNote,
        reason: `Market "${canonical.canonicalMarket}" is currently disabled for cross-bookmaker transfer by administrator settings.`,
      });
      continue;
    }

    const fixtureMatch = matchFixtureToCandidates(src, candidatePool);
    if (!fixtureMatch.bestMatch) {
      legs.push({
        sourceSelection: src,
        status: 'UNMATCHED',
        canonicalMarket: canonical.canonicalMarket,
        canonicalOutcome: canonical.canonicalOutcome,
        targetSelection: null,
        targetOdds: null,
        oddsDifference: null,
        matchConfidence: 0,
        settlementRuleNote: canonical.settlementRuleNote,
        reason: fixtureMatch.reason,
        candidateMatches: fixtureMatch.rankedCandidates,
      });
      continue;
    }

    const targetEventId = fixtureMatch.bestMatch.eventId;
    let fullTargetMatch = detailedMatchCache.get(targetEventId);
    if (!fullTargetMatch) {
      try {
        fullTargetMatch = await targetClient.getMatchDetails(targetEventId);
      } catch {
        fullTargetMatch = fixtureMatch.bestMatch;
      }
      detailedMatchCache.set(targetEventId, fullTargetMatch);
    }

    if (fullTargetMatch.isLive || fullTargetMatch.statusCode !== 0) {
      legs.push({
        sourceSelection: src,
        status: 'MATCH_STARTED',
        canonicalMarket: canonical.canonicalMarket,
        canonicalOutcome: canonical.canonicalOutcome,
        targetSelection: null,
        targetOdds: null,
        oddsDifference: null,
        matchConfidence: fixtureMatch.confidence,
        settlementRuleNote: canonical.settlementRuleNote,
        reason: `Match "${fullTargetMatch.homeTeam} vs ${fullTargetMatch.awayTeam}" is already live or closed (${fullTargetMatch.matchStatus}) on ${targetInfo.shortName}.`,
        candidateMatches: fixtureMatch.rankedCandidates,
      });
      continue;
    }

    const exactHit = findExactTargetMarketOutcome(fullTargetMatch, targetBookmaker, canonical);
    if (!exactHit) {
      legs.push({
        sourceSelection: src,
        status: 'UNAVAILABLE',
        canonicalMarket: canonical.canonicalMarket,
        canonicalOutcome: canonical.canonicalOutcome,
        targetSelection: null,
        targetOdds: null,
        oddsDifference: null,
        matchConfidence: fixtureMatch.confidence,
        settlementRuleNote: canonical.settlementRuleNote,
        reason: `Exact selection "${src.marketName}: ${src.outcomeDesc}" is unavailable or suspended on ${targetInfo.shortName} for ${fullTargetMatch.homeTeam} vs ${fullTargetMatch.awayTeam}.`,
        candidateMatches: fixtureMatch.rankedCandidates,
      });
      continue;
    }

    const targetOdds = exactHit.outcome.odds;
    const oddsDifference = Number((targetOdds - src.odds).toFixed(2));
    const selectionKey = `${fullTargetMatch.eventId}::${exactHit.market.marketId}::${exactHit.market.specifier}::${exactHit.outcome.outcomeId}`;

    const targetSelection: BetslipSelection = {
      bookmakerId: targetBookmaker,
      bookmakerName: targetInfo.name,
      selectionKey,
      eventId: fullTargetMatch.eventId,
      homeTeam: fullTargetMatch.homeTeam,
      awayTeam: fullTargetMatch.awayTeam,
      leagueName: fullTargetMatch.leagueName,
      country: fullTargetMatch.country,
      estimateStartTime: fullTargetMatch.estimateStartTime,
      matchStatus: fullTargetMatch.matchStatus,
      isLive: fullTargetMatch.isLive,
      marketId: exactHit.market.marketId,
      marketName: exactHit.market.desc || exactHit.market.name,
      specifier: exactHit.market.specifier,
      outcomeId: exactHit.outcome.outcomeId,
      outcomeDesc: exactHit.outcome.desc,
      odds: targetOdds,
      addedAt: checkedAt,
    };

    matchedSelections.push(targetSelection);
    legs.push({
      sourceSelection: src,
      status: Math.abs(oddsDifference) >= 0.01 ? 'ODDS_CHANGED' : 'MATCHED',
      canonicalMarket: canonical.canonicalMarket,
      canonicalOutcome: canonical.canonicalOutcome,
      targetSelection,
      targetOdds,
      oddsDifference,
      matchConfidence: fixtureMatch.confidence,
      settlementRuleNote: canonical.settlementRuleNote,
      reason:
        Math.abs(oddsDifference) >= 0.01
          ? `Exact match verified (${fixtureMatch.reason}); target odds ${targetOdds.toFixed(2)} vs original ${src.odds.toFixed(2)}.`
          : `Exact fixture, market, and outcome verified (${fixtureMatch.reason}).`,
      candidateMatches: fixtureMatch.rankedCandidates,
    });
  }

  const matchedCount = matchedSelections.length;
  const unmatchedCount = legs.filter((l) => l.status === 'UNMATCHED').length;
  const unavailableCount = legs.filter(
    (l) => l.status === 'UNAVAILABLE' || l.status === 'MATCH_STARTED'
  ).length;

  let status: TransferStatus = 'READY_TO_REVIEW';
  if (matchedCount === 0) {
    status = 'UNAVAILABLE_SELECTIONS';
    warnings.push(
      `No selections could be matched cleanly on ${targetInfo.shortName}. Review unavailable reasons below.`
    );
  } else if (unmatchedCount > 0 || unavailableCount > 0) {
    status = 'PARTIALLY_MATCHED';
    warnings.push(
      `${matchedCount} of ${sourceSelections.length} selection(s) matched. Remove or review unavailable legs before confirming.`
    );
  }

  const targetCombinedOdds =
    matchedCount > 0
      ? Number(matchedSelections.reduce((acc, s) => acc * s.odds, 1).toFixed(2))
      : null;

  platformConfigService.recordTransfer({
    transferId,
    direction: params.direction,
    sourceBookmaker,
    targetBookmaker,
    originalCode: cleanCode || 'MANUAL',
    targetBookingCode: null,
    targetShareUrl: null,
    status,
    originalSelectionCount: sourceSelections.length,
    matchedCount,
    unmatchedCount: unmatchedCount + unavailableCount,
    originalCombinedOdds,
    targetCombinedOdds,
    actorUid: params.actorUid || null,
    actorEmail: params.actorEmail || null,
    errorMessage: null,
    createdAt: checkedAt,
  });

  backendLogger.info(
    'TRANSFER',
    'TRANSFER_PREVIEW',
    `${sourceInfo.shortName} -> ${targetInfo.shortName} preview (${cleanCode || 'MANUAL'}): ${matchedCount}/${sourceSelections.length} matched (${status}).`,
    { actorUid: params.actorUid, actorEmail: params.actorEmail }
  );

  return {
    transferId,
    direction: params.direction,
    sourceBookmaker,
    sourceBookmakerName: sourceInfo.name,
    targetBookmaker,
    targetBookmakerName: targetInfo.name,
    originalCode: cleanCode || 'MANUAL',
    status,
    originalSelectionCount: sourceSelections.length,
    matchedCount,
    unmatchedCount,
    unavailableCount,
    originalCombinedOdds,
    targetCombinedOdds,
    legs,
    matchedSelections,
    warnings,
    manualHandoffUrl,
    checkedAt,
  };
}

export async function confirmCrossBookmakerTransfer(params: {
  transferId?: string;
  direction: TransferDirection;
  originalCode: string;
  originalSelectionCount: number;
  originalCombinedOdds: number;
  confirmedSelections: BetslipSelection[];
  actorUid?: string | null;
  actorEmail?: string | null;
}): Promise<TransferConfirmResponse> {
  const sourceBookmaker: BookmakerId =
    params.direction === 'SPORTYBET_TO_BETPAWA' ? 'SPORTYBET_TZ' : 'BETPAWA_TZ';
  const targetBookmaker: BookmakerId =
    params.direction === 'SPORTYBET_TO_BETPAWA' ? 'BETPAWA_TZ' : 'SPORTYBET_TZ';
  const targetInfo = getBookmakerInfo(targetBookmaker);
  const transferId = params.transferId || `tr_${crypto.randomBytes(5).toString('hex')}`;
  const confirmedAt = new Date().toISOString();
  const manualHandoffUrl = getBookmakerHandoffUrl(targetBookmaker);

  assertSameBookmakerSelections(params.confirmedSelections, targetBookmaker);
  const targetClient = getBookmakerClient(targetBookmaker);

  try {
    const booking = await targetClient.createBookingCode(params.confirmedSelections);
    if (!booking.shareCode || !booking.verified) {
      throw new Error(
        `${targetInfo.shortName} created an unverified booking code response. Use manual handoff instead.`
      );
    }

    platformConfigService.recordTransfer({
      transferId,
      direction: params.direction,
      sourceBookmaker,
      targetBookmaker,
      originalCode: params.originalCode || 'MANUAL',
      targetBookingCode: booking.shareCode,
      targetShareUrl: booking.shareUrl,
      status: 'TRANSFERRED',
      originalSelectionCount: params.originalSelectionCount,
      matchedCount: booking.selectionCount,
      unmatchedCount: Math.max(0, params.originalSelectionCount - booking.selectionCount),
      originalCombinedOdds: params.originalCombinedOdds,
      targetCombinedOdds: booking.combinedOdds,
      actorUid: params.actorUid || null,
      actorEmail: params.actorEmail || null,
      errorMessage: null,
      createdAt: confirmedAt,
    });

    backendLogger.info(
      'TRANSFER',
      'TRANSFER_CONFIRMED',
      `Genuine ${targetInfo.shortName} booking code ${booking.shareCode} generated & verified for transfer ${transferId}.`,
      { actorUid: params.actorUid, actorEmail: params.actorEmail }
    );

    return {
      transferId,
      direction: params.direction,
      sourceBookmaker,
      targetBookmaker,
      originalCode: params.originalCode || 'MANUAL',
      status: 'TRANSFERRED',
      targetBookingCode: booking.shareCode,
      targetShareUrl: booking.shareUrl,
      verified: booking.verified,
      selectionCount: booking.selectionCount,
      originalCombinedOdds: params.originalCombinedOdds,
      targetCombinedOdds: booking.combinedOdds,
      confirmedSelections: booking.selections,
      manualHandoffUrl,
      errorMessage: null,
      confirmedAt,
    };
  } catch (err) {
    const errMsg =
      err instanceof Error
        ? err.message
        : `${targetInfo.shortName} booking code creation failed.`;
    const recalculated = Number(
      params.confirmedSelections.reduce((acc, s) => acc * s.odds, 1).toFixed(2)
    );

    platformConfigService.recordTransfer({
      transferId,
      direction: params.direction,
      sourceBookmaker,
      targetBookmaker,
      originalCode: params.originalCode || 'MANUAL',
      targetBookingCode: null,
      targetShareUrl: null,
      status: 'FAILED',
      originalSelectionCount: params.originalSelectionCount,
      matchedCount: params.confirmedSelections.length,
      unmatchedCount: Math.max(
        0,
        params.originalSelectionCount - params.confirmedSelections.length
      ),
      originalCombinedOdds: params.originalCombinedOdds,
      targetCombinedOdds: recalculated,
      actorUid: params.actorUid || null,
      actorEmail: params.actorEmail || null,
      errorMessage: errMsg,
      createdAt: confirmedAt,
    });

    backendLogger.error('TRANSFER', 'TRANSFER_CONFIRM_FAILED', errMsg, {
      actorUid: params.actorUid,
      actorEmail: params.actorEmail,
    });

    return {
      transferId,
      direction: params.direction,
      sourceBookmaker,
      targetBookmaker,
      originalCode: params.originalCode || 'MANUAL',
      status: 'FAILED',
      targetBookingCode: null,
      targetShareUrl: null,
      verified: false,
      selectionCount: params.confirmedSelections.length,
      originalCombinedOdds: params.originalCombinedOdds,
      targetCombinedOdds: recalculated,
      confirmedSelections: params.confirmedSelections,
      manualHandoffUrl,
      errorMessage: errMsg,
      confirmedAt,
    };
  }
}
