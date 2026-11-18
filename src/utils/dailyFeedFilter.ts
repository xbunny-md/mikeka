/**
 * Enforces Daily Feed & Daily Factory market/selection rules:
 * - Allows Double Chance 1X (Home or Draw) and X2 / 2X (Draw or Away)
 * - Strictly excludes Double Chance 12 (Home or Away / 1/2)
 * - Strictly excludes straight Home/Away match-winner picks (1X2, Draw No Bet)
 */

export const DISALLOWED_DAILY_FEED_MARKET_IDS = new Set([
  '1',    // SportyBet 1X2
  '11',   // SportyBet Draw No Bet
  '60',   // SportyBet 1st Half 1X2
  '3743', // betPawa 1X2
  '4703', // betPawa Draw No Bet
]);

export const DEFAULT_ALLOWED_DAILY_FEED_MARKETS = ['10', '18', '29', '26', '36'];

const DISALLOWED_MARKET_NAME_PATTERNS = [
  /\b1\s*x\s*2\b/i,
  /match\s*winner/i,
  /draw\s*no\s*bet/i,
  /\b3\s*-?\s*way\b/i,
  /\bfull\s*time\s*result\b/i,
];

const DISALLOWED_OUTCOME_EXACT = new Set([
  '1',
  'x',
  '2',
  'home',
  'away',
  'draw',
  '12',
  '1/2',
  'home or away',
  'home/away',
  'home team or away team',
]);

export function isDisallowedDailyFeedMarket(
  marketId?: string | null,
  marketName?: string | null
): boolean {
  const cleanId = String(marketId || '').trim();
  if (cleanId && DISALLOWED_DAILY_FEED_MARKET_IDS.has(cleanId)) {
    return true;
  }

  const cleanName = String(marketName || '').trim();
  if (!cleanName) return false;
  return DISALLOWED_MARKET_NAME_PATTERNS.some((re) => re.test(cleanName));
}

export function isDisallowedDailyFeedSelection(input: {
  marketId?: string | null;
  marketName?: string | null;
  outcomeId?: string | null;
  outcomeDesc?: string | null;
}): boolean {
  if (isDisallowedDailyFeedMarket(input.marketId, input.marketName)) {
    return true;
  }

  const cleanMarketId = String(input.marketId || '').trim();
  const cleanOutcomeId = String(input.outcomeId || '').trim();
  // SportyBet Double Chance (marketId '10') outcomeId '10' is Home or Away (12)
  if (cleanMarketId === '10' && cleanOutcomeId === '10') {
    return true;
  }

  const cleanOutcome = String(input.outcomeDesc || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (!cleanOutcome) return false;
  if (DISALLOWED_OUTCOME_EXACT.has(cleanOutcome)) {
    return true;
  }

  if (cleanOutcome.includes('home or away') || cleanOutcome.includes('home/away')) {
    return true;
  }

  return false;
}

export function sanitizeDailyFactoryMarkets(markets: string[]): string[] {
  const cleaned = (markets || [])
    .map((m) => String(m || '').trim())
    .filter((m) => Boolean(m) && !DISALLOWED_DAILY_FEED_MARKET_IDS.has(m));
  return Array.from(new Set(cleaned));
}

export function isTicketAllowedInDailyFeed(ticket: {
  selections?: Array<{
    marketId?: string | null;
    marketName?: string | null;
    outcomeId?: string | null;
    outcomeDesc?: string | null;
  }>;
}): boolean {
  if (!Array.isArray(ticket.selections) || ticket.selections.length === 0) {
    return false;
  }
  return ticket.selections.every((sel) => !isDisallowedDailyFeedSelection(sel));
}
