import { z } from 'zod';

const bookmakerEnum = z.enum(['SPORTYBET_TZ', 'BETPAWA_TZ']);

export const scannerConfigSchema = z
  .object({
    bookmakerId: bookmakerEnum.optional(),
    minOdds: z.number().min(1.01).max(1000),
    maxOdds: z.number().min(1.01).max(10000),
    startDate: z.string().max(40).default(''),
    endDate: z.string().max(40).default(''),
    sportId: z.string().max(40).default('sr:sport:1'),
    leagues: z.array(z.string().max(120)).max(50).default([]),
    matchStatus: z.enum(['ALL', 'UPCOMING', 'LIVE']).default('ALL'),
    markets: z.array(z.string().max(20)).max(20).default(['10']),
    maxResults: z.number().int().min(1).max(500).default(100),
    searchQuery: z.string().max(100).optional(),
    sortBy: z.enum(['kickoff_asc', 'odds_asc', 'odds_desc']).optional(),
  })
  .refine((val) => val.maxOdds >= val.minOdds, {
    message: 'Maximum odds must be greater than or equal to minimum odds.',
    path: ['maxOdds'],
  });

export const betslipSelectionSchema = z.object({
  selectionKey: z.string().min(1).max(200),
  bookmakerId: bookmakerEnum.optional(),
  bookmakerName: z.string().max(100).optional(),
  eventId: z.string().min(1).max(100),
  homeTeam: z.string().min(1).max(140),
  awayTeam: z.string().min(1).max(140),
  leagueName: z.string().max(140).default('Football'),
  country: z.string().max(100).default('International'),
  estimateStartTime: z.number().nonnegative(),
  matchStatus: z.string().max(40).default('Not start'),
  isLive: z.boolean().default(false),
  marketId: z.string().min(1).max(40),
  marketName: z.string().min(1).max(120),
  specifier: z.string().max(80).default(''),
  outcomeId: z.string().min(1).max(40),
  outcomeDesc: z.string().min(1).max(120),
  odds: z.number().gt(1.0).max(10000),
  addedAt: z.string().max(60),
});

export const betslipPayloadSchema = z.object({
  bookmakerId: bookmakerEnum.optional(),
  selections: z.array(betslipSelectionSchema).min(1).max(30),
});

export const oddsCategorySchema = z
  .object({
    id: z.string().min(1).max(40),
    label: z.string().min(1).max(60),
    minCombinedOdds: z.number().min(1.05).max(10000),
    maxCombinedOdds: z.number().min(1.1).max(100000),
    targetCombinedOdds: z.number().min(1.05).max(100000),
    weight: z.number().int().min(1).max(100),
  })
  .refine((c) => c.maxCombinedOdds >= c.minCombinedOdds, {
    message: 'Category maxCombinedOdds must be >= minCombinedOdds.',
    path: ['maxCombinedOdds'],
  });

export const dailyFactoryConfigSchema = z
  .object({
    enabled: z.boolean(),
    paused: z.boolean().default(false),
    activeBookmaker: bookmakerEnum.optional(),
    minIndividualOdds: z.number().min(1.01).max(100),
    maxIndividualOdds: z.number().min(1.01).max(1000),
    dailyTicketTarget: z.number().int().min(1).max(200),
    maxTickets: z.number().int().min(1).max(200),
    minSelections: z.number().int().min(1).max(25),
    maxSelections: z.number().int().min(1).max(25),
    sportIds: z.array(z.string().max(40)).min(1).max(10).default(['sr:sport:1']),
    markets: z.array(z.string().max(20)).max(20),
    anyMarket: z.boolean(),
    leagues: z.array(z.string().max(120)).max(50),
    datePreset: z.enum(['TODAY', 'TOMORROW', 'CUSTOM']),
    customStartDate: z.string().max(40).default(''),
    customEndDate: z.string().max(40).default(''),
    windowStartTime: z.string().regex(/^\d{2}:\d{2}$/),
    windowEndTime: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().min(1).max(60),
    oddsCategories: z.array(oddsCategorySchema).min(1).max(12),
    duplicatePrevention: z.boolean(),
    autoCreateBookingCodes: z.boolean(),
    scheduleIntervalMinutes: z.number().int().min(5).max(1440),
  })
  .refine((v) => v.maxIndividualOdds >= v.minIndividualOdds, {
    message: 'Maximum individual odds must be >= minimum individual odds.',
    path: ['maxIndividualOdds'],
  })
  .refine((v) => v.maxSelections >= v.minSelections, {
    message: 'Maximum selections must be >= minimum selections.',
    path: ['maxSelections'],
  });

export const transferDirectionEnum = z.enum(['SPORTYBET_TO_BETPAWA', 'BETPAWA_TO_SPORTYBET']);

export const transferSourceSelectionSchema = z.object({
  id: z.string().min(1).max(120),
  homeTeam: z.string().min(1).max(140),
  awayTeam: z.string().min(1).max(140),
  leagueName: z.string().max(140).optional(),
  country: z.string().max(100).optional(),
  estimateStartTime: z.number().nonnegative().optional(),
  marketId: z.string().max(40).optional(),
  marketName: z.string().min(1).max(120),
  specifier: z.string().max(80).optional(),
  outcomeId: z.string().max(40).optional(),
  outcomeDesc: z.string().min(1).max(120),
  odds: z.number().gt(1.0).max(10000),
  eventId: z.string().max(100).optional(),
});

export const transferPreviewSchema = z
  .object({
    direction: transferDirectionEnum,
    bookingCode: z.string().trim().max(32).optional(),
    manualSelections: z.array(transferSourceSelectionSchema).max(30).optional(),
  })
  .refine(
    (v) =>
      (Boolean(v.bookingCode) && v.bookingCode!.trim().length >= 3) ||
      (Array.isArray(v.manualSelections) && v.manualSelections.length >= 1),
    {
      message: 'Provide a booking code (3+ chars) or at least 1 manual selection.',
    }
  );

export const transferConfirmSchema = z.object({
  transferId: z.string().min(1).max(120).optional(),
  direction: transferDirectionEnum,
  originalCode: z.string().max(32).default('MANUAL'),
  originalSelectionCount: z.number().int().min(1).max(30),
  originalCombinedOdds: z.number().min(1.0).max(1000000),
  confirmedSelections: z.array(betslipSelectionSchema).min(1).max(30),
});

export const canonicalMarketEnum = z.enum([
  '1X2_FT',
  'DOUBLE_CHANCE_FT',
  'OVER_UNDER_FT',
  'BTTS_FT',
  'DRAW_NO_BET_FT',
  'ODD_EVEN_FT',
  'HOME_OU_FT',
  'AWAY_OU_FT',
  'ASIAN_HANDICAP_FT',
  'HT_1X2',
  'HT_OVER_UNDER',
  'HT_DOUBLE_CHANCE',
  'HT_BTTS',
]);

export const platformSettingsSchema = z.object({
  sportybetEnabled: z.boolean(),
  betpawaEnabled: z.boolean(),
  crossTransferEnabled: z.boolean(),
  supportedTransferMarkets: z.array(canonicalMarketEnum).min(1).max(20),
});

export const userAccessUpdateSchema = z.object({
  role: z.enum(['USER', 'ADMIN']).optional(),
  disabled: z.boolean().optional(),
  email: z.string().email().max(254).optional(),
  displayName: z.string().min(1).max(120).optional(),
});

export const authAuditSchema = z.object({
  event: z.enum(['SIGNUP', 'LOGIN', 'LOGOUT', 'PASSWORD_RESET', 'EMAIL_VERIFICATION_SENT', 'LOGIN_FAILED']),
  email: z.string().max(254).optional(),
  details: z.string().max(300).optional(),
});

