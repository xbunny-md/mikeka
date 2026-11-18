import type { MarketCatalogItem, ResearchReport } from '../../src/types/sportybet.ts';

export const SPORTYBET_CONFIG = {
  baseUrl: 'https://www.sportybet.com/api/tz',
  webBaseUrl: 'https://www.sportybet.com/tz',
  sportIdFootball: 'sr:sport:1',
  productId: 3,
  operId: '7',
  clientId: 'web',
  timeoutMs: 12000 as number,
  cacheTtlMs: 30000 as number,
  defaultMarketIds: '1,18,10,29,11,26,36,14,16',
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: 'https://www.sportybet.com',
    Referer: 'https://www.sportybet.com/tz/m/',
    clientid: 'web',
    operid: '7',
  },
} as const;

export const MARKET_CATALOG: MarketCatalogItem[] = [
  {
    id: '1',
    name: 'Match Winner (1X2)',
    shortName: '1X2',
    description: 'Full-time regular result: Home (1), Draw (X), or Away (2).',
  },
  {
    id: '10',
    name: 'Double Chance',
    shortName: 'DC',
    description: 'Covers two of three full-time outcomes: 1X, 12, or X2.',
  },
  {
    id: '18',
    name: 'Over/Under',
    shortName: 'O/U',
    description: 'Total match goals over or under lines (0.5 to 5.5+).',
  },
  {
    id: '29',
    name: 'Both Teams To Score (GG/NG)',
    shortName: 'GG/NG',
    description: 'Whether both teams score in regular time (Yes/No).',
  },
  {
    id: '11',
    name: 'Draw No Bet',
    shortName: 'DNB',
    description: 'Home or Away win; stake voided if match ends in a draw.',
  },
  {
    id: '16',
    name: 'Asian Handicap',
    shortName: 'AH',
    description: 'Goal spread handicap lines with half/quarter/whole-ball settlements.',
  },
  {
    id: '14',
    name: 'European Handicap',
    shortName: 'EH',
    description: '3-way handicap (1, X, 2) with whole goal starting advantage.',
  },
  {
    id: '26',
    name: 'Odd/Even Goals',
    shortName: 'O/E',
    description: 'Whether combined regular-time goals total an odd or even number.',
  },
  {
    id: '36',
    name: 'Over/Under & GG/NG',
    shortName: 'O/U & GG',
    description: 'Combined total goals line and Both Teams To Score market.',
  },
];

export const SPORTYBET_RESEARCH_REPORT: ResearchReport = {
  targetWebsite: 'https://www.sportybet.com/tz/m/',
  researchedAt: '2026-11-18T10:19:00.000Z',
  summary:
    'Empirical HTTP verification confirms SportyBet Tanzania exposes unauthenticated JSON REST endpoints under /api/tz/factsCenter/ for live matches, upcoming scheduled fixtures, full event market catalogs (250+ markets per match), and tournament hierarchies, as well as /api/tz/orders/share for genuine booking/sharing code creation and resolution. Upstream odds are tagged with sourceType BET_RADAR.',
  bookingCodeSupported: true,
  bookingCodeMechanism:
    'POST /api/tz/orders/share accepts an array of selection descriptors ({ eventId, marketId, outcomeId, specifier?, sportId }) without requiring account login, returning bizCode 10000 with a genuine 6-character alphanumeric shareCode, a direct shareURL (https://www.sportybet.com/tz/?shareCode=<code>), expiration deadline, and hydrated outcome objects. GET /api/tz/orders/share/:code resolves and validates any code.',
  endpoints: [
    {
      name: 'Upcoming Football Fixtures & Core Odds',
      method: 'GET',
      url: 'https://www.sportybet.com/api/tz/factsCenter/pcUpcomingEvents?sportId=sr:sport:1&marketId=1,18,10,29,11,26,36,14,16&pageSize=100&pageNum=1',
      authRequired: false,
      format: 'application/json (bizCode 10000, tournaments[].events[])',
      purpose: 'Paginated upcoming matches grouped by tournament with core markets and Betradar IDs.',
      verifiedStatus: 'VERIFIED_200',
    },
    {
      name: 'Live In-Play Football Events',
      method: 'GET',
      url: 'https://www.sportybet.com/api/tz/factsCenter/liveOrPrematchEvents?sportId=sr:sport:1',
      authRequired: false,
      format: 'application/json (bizCode 10000, array of tournament buckets)',
      purpose: 'Active live matches with live scores (setScore), match clock (playedSeconds), phase (matchStatus), and live markets.',
      verifiedStatus: 'VERIFIED_200',
    },
    {
      name: 'Single Match Full Market Catalog',
      method: 'GET',
      url: 'https://www.sportybet.com/api/tz/factsCenter/event?eventId=<sr:match:...>&productId=3',
      authRequired: false,
      format: 'application/json (bizCode 10000, single event with full markets[])',
      purpose: 'Retrieves all available markets (250+ on major fixtures) including Asian Handicap, corners, halves, and combos.',
      verifiedStatus: 'VERIFIED_200',
    },
    {
      name: 'Country & League Directory',
      method: 'GET',
      url: 'https://www.sportybet.com/api/tz/factsCenter/popularAndSportList?sportId=sr:sport:1&productId=3',
      authRequired: false,
      format: 'application/json (bizCode 10000, sportList[].categories[].tournaments[])',
      purpose: 'Enumerates available countries, tournament IDs (sr:tournament:*), and live/upcoming fixture counts.',
      verifiedStatus: 'VERIFIED_200',
    },
    {
      name: 'Create Genuine Booking / Sharing Code',
      method: 'POST',
      url: 'https://www.sportybet.com/api/tz/orders/share',
      authRequired: false,
      format: 'application/json (bizCode 10000, data.shareCode, data.shareURL, data.deadline, data.outcomes)',
      purpose: 'Generates an official SportyBet Tanzania sharing code directly loadable on sportybet.com/tz.',
      verifiedStatus: 'VERIFIED_200',
    },
    {
      name: 'Verify / Load Sharing Code',
      method: 'GET',
      url: 'https://www.sportybet.com/api/tz/orders/share/{shareCode}',
      authRequired: false,
      format: 'application/json (bizCode 10000 valid / bizCode 19000 invalid)',
      purpose: 'Validates sharing codes and retrieves live odds, market statuses, and expiry deadlines.',
      verifiedStatus: 'VERIFIED_200',
    },
  ],
  marketCatalog: MARKET_CATALOG,
  limitations: [
    'pcUpcomingEvents does not apply arbitrary server-side odds range filtering; odds-range, date-window, and multi-market deduplication must execute on normalized server-fetched pages.',
    'Each pcUpcomingEvents page should be capped (e.g. pageSize=100) and cached briefly (30s TTL) to respect upstream infrastructure and prevent throttling.',
    'Live odds change rapidly; market status != 0, banned == true, or outcome.isActive != 1 indicate suspended or closed outcomes.',
    'Booking codes remain valid until the earliest kickoff deadline or upstream market settlement/suspension.',
  ],
  complianceBoundaries: [
    'Read-only public market discovery and unauthenticated betslip sharing only — zero bet placement, zero deposits, zero withdrawals.',
    'No credential collection, no session hijacking, no CAPTCHA bypassing, and strict server-side rate limiting.',
    'Combined decimal odds and estimated returns are mathematical products, never predictions or guaranteed outcomes.',
  ],
};
