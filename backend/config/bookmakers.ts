import type {
  BookmakerCatalogInfo,
  BookmakerId,
  MarketCatalogItem,
  ResearchReport,
} from '../../src/types/sportybet.ts';
import { MARKET_CATALOG as SPORTYBET_MARKET_CATALOG, SPORTYBET_RESEARCH_REPORT } from './sportybet.ts';

export const DEFAULT_BOOKMAKER_ID: BookmakerId = 'SPORTYBET_TZ';

export const BETPAWA_CONFIG = {
  baseUrl: 'https://www.betpawa.co.tz/api/sportsbook',
  webBaseUrl: 'https://www.betpawa.co.tz/bets',
  categoryIdFootball: '2',
  timeoutMs: 12000 as number,
  cacheTtlMs: 30000 as number,
  defaultMarketIds: ['3743', '4693', '5000', '3795', '4703', '3774', '4833'],
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'x-pawa-brand': 'betpawa-tanzania',
    'x-pawa-language': 'en',
    devicetype: 'web',
    Origin: 'https://www.betpawa.co.tz',
    Referer: 'https://www.betpawa.co.tz/bets',
  },
} as const;

export const BETPAWA_MARKET_CATALOG: MarketCatalogItem[] = [
  {
    id: '3743',
    name: 'Match Winner (1X2 | Full Time)',
    shortName: '1X2',
    description: 'Full-time regular result on betPawa TZ: 1 (Home), X (Draw), or 2 (Away).',
  },
  {
    id: '4693',
    name: 'Double Chance | Full Time',
    shortName: 'DC',
    description: 'Covers two of three full-time outcomes: 1X, 12, or X2.',
  },
  {
    id: '5000',
    name: 'Over/Under | Full Time',
    shortName: 'O/U',
    description: 'Total regular-time goals over or under lines (0.5 to 5.5+).',
  },
  {
    id: '3795',
    name: 'Both Teams To Score | Full Time',
    shortName: 'BTTS',
    description: 'Whether both teams score in regular time (Yes/No).',
  },
  {
    id: '4703',
    name: 'Draw No Bet | Full Time',
    shortName: 'DNB',
    description: 'Home or Away win; voided if the match finishes level.',
  },
  {
    id: '3774',
    name: 'Asian Handicap | Full Time',
    shortName: 'AH',
    description: '2-Way goal spread handicap lines settled over regular time.',
  },
  {
    id: '4833',
    name: 'Odd / Even | Full Time',
    shortName: 'O/E',
    description: 'Whether total regular-time goals are an odd or even count.',
  },
  {
    id: '5006',
    name: 'Home Team Over/Under | Full Time',
    shortName: 'Home O/U',
    description: 'Total goals scored by the home team.',
  },
  {
    id: '5003',
    name: 'Away Team Over/Under | Full Time',
    shortName: 'Away O/U',
    description: 'Total goals scored by the away team.',
  },
];

export const BOOKMAKER_CATALOG: Record<BookmakerId, BookmakerCatalogInfo> = {
  SPORTYBET_TZ: {
    id: 'SPORTYBET_TZ',
    name: 'SportyBet Tanzania',
    shortName: 'SportyBet TZ',
    country: 'Tanzania',
    websiteUrl: 'https://www.sportybet.com/tz/m/',
    apiBaseUrl: 'https://www.sportybet.com/api/tz',
    bookingCodeSupported: true,
    bookingCodeMechanism: 'POST /api/tz/orders/share & GET /api/tz/orders/share/:code',
    notes: 'Full upcoming/live football odds, 250+ markets per fixture, and direct sharing code generation.',
  },
  BETPAWA_TZ: {
    id: 'BETPAWA_TZ',
    name: 'betPawa Tanzania',
    shortName: 'betPawa TZ',
    country: 'Tanzania',
    websiteUrl: 'https://www.betpawa.co.tz/bets',
    apiBaseUrl: 'https://www.betpawa.co.tz/api/sportsbook',
    bookingCodeSupported: true,
    bookingCodeMechanism: 'POST /api/sportsbook/v3/booking-number & GET /api/sportsbook/v3/booking-number/:code',
    notes: 'Isolated betPawa TZ v4 sportsbook feed, tournament catalog, and native v3 booking-number generation.',
  },
};

export const BETPAWA_RESEARCH_REPORT: ResearchReport = {
  targetWebsite: 'https://www.betpawa.co.tz/bets',
  researchedAt: new Date().toISOString(),
  summary:
    'Live HTTP inspection confirms betPawa Tanzania exposes English JSON sportsbook feeds under /api/sportsbook/v4 (with header x-pawa-brand: betpawa-tanzania and x-pawa-language: en) for live/upcoming events, league trees, and match results, plus /api/sportsbook/v3/booking-number for native booking code creation and resolution.',
  bookingCodeSupported: true,
  bookingCodeMechanism:
    'POST /api/sportsbook/v3/booking-number accepts betPawa price IDs ({ selections: { selections: [{ type: "SINGLE", selections: [priceId] }] } }) and returns an official 7-character booking code loadable at https://www.betpawa.co.tz/?bookingNumber=<code>.',
  endpoints: [
    {
      name: 'Upcoming & Live Football Events (v4 Query)',
      method: 'GET',
      url: 'https://www.betpawa.co.tz/api/sportsbook/v4/events/lists/by-queries?q=...',
      authRequired: false,
      format: 'application/json (responses[].responses[], markets[].row[].prices[])',
      purpose: 'Paginated upcoming or live football fixtures with nested market types, handicaps, and decimal odds.',
      verifiedStatus: 'VERIFIED_200',
    },
    {
      name: 'Single Match Full Market Catalog & Results',
      method: 'GET',
      url: 'https://www.betpawa.co.tz/api/sportsbook/v4/events/{eventId}',
      authRequired: false,
      format: 'application/json (event object with markets[] and results)',
      purpose: 'Full fixture market board and official live/final score period breakdowns.',
      verifiedStatus: 'VERIFIED_200',
    },
    {
      name: 'Football Regions & Competitions Tree',
      method: 'GET',
      url: 'https://www.betpawa.co.tz/api/sportsbook/v4/categories/list/2',
      authRequired: false,
      format: 'application/json (withRegions[].regions[].competitions[])',
      purpose: 'Lists all active countries, leagues, and live/upcoming match counts.',
      verifiedStatus: 'VERIFIED_200',
    },
    {
      name: 'Create Native Booking Number',
      method: 'POST',
      url: 'https://www.betpawa.co.tz/api/sportsbook/v3/booking-number',
      authRequired: false,
      format: 'application/json ({ code })',
      purpose: 'Generates genuine betPawa Tanzania booking codes directly loadable on betpawa.co.tz.',
      verifiedStatus: 'VERIFIED_200',
    },
    {
      name: 'Verify / Resolve Booking Number',
      method: 'GET',
      url: 'https://www.betpawa.co.tz/api/sportsbook/v3/booking-number/{code}',
      authRequired: false,
      format: 'application/json ({ items[] })',
      purpose: 'Loads and validates any betPawa TZ booking number back into event/market/price objects.',
      verifiedStatus: 'VERIFIED_200',
    },
  ],
  marketCatalog: BETPAWA_MARKET_CATALOG,
  limitations: [
    'betPawa Tanzania uses platform-specific numerical price IDs for booking codes; SportyBet selections or codes cannot be mixed or cross-loaded.',
    'All network requests require x-pawa-brand: betpawa-tanzania and x-pawa-language: en headers.',
  ],
  complianceBoundaries: [
    'Read-only public market discovery and unauthenticated booking-number creation only — zero bet placement or financial actions.',
    'Strict platform isolation: SportyBet and betPawa fixtures, markets, betslips, and booking codes never mix.',
  ],
};

export function normalizeBookmakerId(input: unknown): BookmakerId {
  const clean = String(input || '').trim().toUpperCase();
  if (clean === 'BETPAWA_TZ' || clean === 'BETPAWA') return 'BETPAWA_TZ';
  return 'SPORTYBET_TZ';
}

export function getBookmakerInfo(id: BookmakerId): BookmakerCatalogInfo {
  return BOOKMAKER_CATALOG[id] || BOOKMAKER_CATALOG.SPORTYBET_TZ;
}

export function getBookmakerMarketCatalog(id: BookmakerId): MarketCatalogItem[] {
  return id === 'BETPAWA_TZ' ? BETPAWA_MARKET_CATALOG : SPORTYBET_MARKET_CATALOG;
}

export function getBookmakerResearchReport(id: BookmakerId): ResearchReport {
  return id === 'BETPAWA_TZ' ? BETPAWA_RESEARCH_REPORT : SPORTYBET_RESEARCH_REPORT;
}
