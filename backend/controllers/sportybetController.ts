import crypto from 'crypto';
import type { Request, Response } from 'express';
import {
  BOOKMAKER_CATALOG,
  getBookmakerInfo,
  getBookmakerMarketCatalog,
  getBookmakerResearchReport,
  normalizeBookmakerId,
} from '../config/bookmakers.ts';
import { getFirebaseProjectMeta } from '../firebase/admin.ts';
import {
  assertSameBookmakerSelections,
  getBookmakerClient,
} from '../integrations/bookmakerRegistry.ts';
import { SportyBetIntegrationError } from '../integrations/sportybetClient.ts';
import type { AdminRequest, AuthenticatedRequest } from '../middleware/adminAuth.ts';
import {
  isAdminEmail,
  isUserAuthorizedAdmin,
  verifyFirebaseIdToken,
} from '../middleware/adminAuth.ts';
import {
  authAuditSchema,
  betslipPayloadSchema,
  dailyFactoryConfigSchema,
  platformSettingsSchema,
  scannerConfigSchema,
  transferConfirmSchema,
  transferPreviewSchema,
  userAccessUpdateSchema,
} from '../middleware/validation.ts';
import { automationStore } from '../services/automationStore.ts';
import { validateBetslipAgainstMatches } from '../services/betslipService.ts';
import {
  CANONICAL_MARKET_CATALOG,
  confirmCrossBookmakerTransfer,
  previewCrossBookmakerTransfer,
} from '../services/crossTransferService.ts';
import { getDateKeyInTimezone } from '../services/dailyFactoryEngine.ts';
import { backendLogger } from '../services/logger.ts';
import { platformConfigService } from '../services/platformConfigService.ts';
import { runLiveOddsScan } from '../services/scannerService.ts';
import { schedulerService } from '../services/schedulerService.ts';
import { computePerformanceAnalytics } from '../services/settlementService.ts';
import type { BackendLogEntry, BookmakerId, NormalizedMatch } from '../../src/types/sportybet.ts';
import {
  DEFAULT_ALLOWED_DAILY_FEED_MARKETS,
  isTicketAllowedInDailyFeed,
  sanitizeDailyFactoryMarkets,
} from '../../src/utils/dailyFeedFilter.ts';

function resolveRequestBookmaker(req: Request, explicit?: unknown): BookmakerId {
  if (explicit) return normalizeBookmakerId(explicit);
  if (req.query.bookmaker) return normalizeBookmakerId(req.query.bookmaker);
  return 'SPORTYBET_TZ';
}

function assertBookmakerEnabledOrRespond(res: Response, bookmakerId: BookmakerId): boolean {
  if (!platformConfigService.isBookmakerEnabled(bookmakerId)) {
    const info = getBookmakerInfo(bookmakerId);
    res.status(503).json({
      error: `${info.name} integration is currently disabled by an administrator.`,
    });
    return false;
  }
  return true;
}

function handleError(res: Response, err: unknown, context = 'API_ERROR') {
  if (err instanceof SportyBetIntegrationError) {
    backendLogger.warn('INTEGRATION', context, err.message, {
      metadata: { statusCode: err.statusCode, bizCode: err.bizCode || null },
    });
    return res.status(err.statusCode).json({
      error: err.message,
      bizCode: err.bizCode,
    });
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  backendLogger.error('API', context, message);
  return res.status(500).json({ error: message });
}

export async function getHealth(_req: Request, res: Response) {
  res.json({
    ok: true,
    service: 'sportybet-odds-hunter-api',
    runtime: process.env.VERCEL ? 'vercel-serverless' : 'node-express',
    timestamp: new Date().toISOString(),
  });
}

export async function getPlatformStatus(_req: Request, res: Response) {
  const settings = platformConfigService.getSettings();
  res.json({
    settings,
    crossTransferEnabled: platformConfigService.isCrossTransferEnabled(),
    bookmakerStatus: {
      SPORTYBET_TZ: settings.sportybetEnabled,
      BETPAWA_TZ: settings.betpawaEnabled,
    },
  });
}

export async function getBookmakers(_req: Request, res: Response) {
  const cfg = automationStore.getFactoryConfig();
  const settings = platformConfigService.getSettings();
  res.json({
    bookmakers: Object.values(BOOKMAKER_CATALOG),
    factoryBookmaker: normalizeBookmakerId(cfg.activeBookmaker),
    enabledMap: {
      SPORTYBET_TZ: settings.sportybetEnabled,
      BETPAWA_TZ: settings.betpawaEnabled,
    },
    crossTransferEnabled: platformConfigService.isCrossTransferEnabled(),
  });
}

export async function getResearchReport(req: Request, res: Response) {
  const bookmakerId = resolveRequestBookmaker(req);
  res.json(getBookmakerResearchReport(bookmakerId));
}

export async function getMarketCatalog(req: Request, res: Response) {
  const bookmakerId = resolveRequestBookmaker(req);
  res.json({
    bookmakerId,
    markets: getBookmakerMarketCatalog(bookmakerId),
  });
}

export async function getDiagnostics(req: Request, res: Response) {
  try {
    const bookmakerId = resolveRequestBookmaker(req);
    if (!assertBookmakerEnabledOrRespond(res, bookmakerId)) return;
    const client = getBookmakerClient(bookmakerId);
    const checks = await client.runDiagnostics();
    res.json({
      bookmakerId,
      checkedAt: new Date().toISOString(),
      checks,
    });
  } catch (err) {
    handleError(res, err, 'DIAGNOSTICS_FAILED');
  }
}

export async function getLeagues(req: Request, res: Response) {
  try {
    const bookmakerId = resolveRequestBookmaker(req);
    if (!assertBookmakerEnabledOrRespond(res, bookmakerId)) return;
    const client = getBookmakerClient(bookmakerId);
    const leagues = await client.getLeagueDirectory();
    res.json({ bookmakerId, leagues });
  } catch (err) {
    handleError(res, err, 'LEAGUES_FAILED');
  }
}

export async function getLiveMatches(req: Request, res: Response) {
  try {
    const bookmakerId = resolveRequestBookmaker(req);
    if (!assertBookmakerEnabledOrRespond(res, bookmakerId)) return;
    const client = getBookmakerClient(bookmakerId);
    const info = getBookmakerInfo(bookmakerId);
    const matches = await client.getLiveMatches();
    res.json({
      bookmakerId,
      matches,
      count: matches.length,
      retrievedAt: new Date().toISOString(),
      dataSource: `${info.shortName} Live Feed`,
    });
  } catch (err) {
    handleError(res, err, 'LIVE_MATCHES_FAILED');
  }
}

export async function getUpcomingMatches(req: Request, res: Response) {
  try {
    const bookmakerId = resolveRequestBookmaker(req);
    if (!assertBookmakerEnabledOrRespond(res, bookmakerId)) return;
    const client = getBookmakerClient(bookmakerId);
    const info = getBookmakerInfo(bookmakerId);
    const pageNum = Math.max(1, Number(req.query.pageNum || 1));
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize || 50)));
    const todayGames = req.query.todayGames === 'true';

    const { matches, totalAvailable } = await client.getUpcomingMatches({
      pageNum,
      pageSize,
      maxPages: 1,
      todayGames,
    });

    res.json({
      bookmakerId,
      matches,
      pageNum,
      pageSize,
      totalAvailable,
      retrievedAt: new Date().toISOString(),
      dataSource: `${info.shortName} Upcoming Feed`,
    });
  } catch (err) {
    handleError(res, err, 'UPCOMING_MATCHES_FAILED');
  }
}

export async function getMatchDetails(req: Request, res: Response) {
  try {
    const eventId = String(req.params.eventId || '').trim();
    if (!eventId || eventId.length > 100) {
      return res.status(400).json({ error: 'Valid eventId parameter is required.' });
    }
    const bookmakerId = resolveRequestBookmaker(req);
    if (!assertBookmakerEnabledOrRespond(res, bookmakerId)) return;
    const client = getBookmakerClient(bookmakerId);
    const match = await client.getMatchDetails(eventId);
    res.json({ bookmakerId, match });
  } catch (err) {
    handleError(res, err, 'MATCH_DETAILS_FAILED');
  }
}

export async function runScanner(req: Request, res: Response) {
  const parsed = scannerConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid scanner configuration.',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  try {
    const bookmakerId = resolveRequestBookmaker(req, parsed.data.bookmakerId);
    if (!assertBookmakerEnabledOrRespond(res, bookmakerId)) return;
    const scanResult = await runLiveOddsScan(parsed.data);
    res.json(scanResult);
  } catch (err) {
    handleError(res, err, 'SCANNER_RUN_FAILED');
  }
}

export async function validateBetslip(req: Request, res: Response) {
  const parsed = betslipPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid betslip payload.',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  try {
    const bookmakerId = resolveRequestBookmaker(
      req,
      parsed.data.bookmakerId || parsed.data.selections[0]?.bookmakerId
    );
    if (!assertBookmakerEnabledOrRespond(res, bookmakerId)) return;
    assertSameBookmakerSelections(parsed.data.selections, bookmakerId);
    const client = getBookmakerClient(bookmakerId);

    const uniqueEventIds = Array.from(new Set(parsed.data.selections.map((s) => s.eventId)));
    const matchMap = new Map<string, NormalizedMatch | null>();

    await Promise.all(
      uniqueEventIds.map(async (eventId) => {
        try {
          const match = await client.getMatchDetails(eventId);
          matchMap.set(eventId, match);
        } catch {
          matchMap.set(eventId, null);
        }
      })
    );

    const validation = validateBetslipAgainstMatches(parsed.data.selections, matchMap);
    res.json(validation);
  } catch (err) {
    handleError(res, err, 'BETSLIP_VALIDATE_FAILED');
  }
}

export async function createBookingCode(req: Request, res: Response) {
  const parsed = betslipPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid booking code selection payload.',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  try {
    const bookmakerId = resolveRequestBookmaker(
      req,
      parsed.data.bookmakerId || parsed.data.selections[0]?.bookmakerId
    );
    if (!assertBookmakerEnabledOrRespond(res, bookmakerId)) return;
    assertSameBookmakerSelections(parsed.data.selections, bookmakerId);
    const client = getBookmakerClient(bookmakerId);
    const result = await client.createBookingCode(parsed.data.selections);
    res.json(result);
  } catch (err) {
    handleError(res, err, 'BOOKING_CODE_CREATE_FAILED');
  }
}

export async function verifyBookingCode(req: Request, res: Response) {
  try {
    const code = String(req.params.code || '').trim();
    const bookmakerId = resolveRequestBookmaker(req);
    if (!assertBookmakerEnabledOrRespond(res, bookmakerId)) return;
    const client = getBookmakerClient(bookmakerId);
    const result = await client.verifyBookingCode(code);
    res.json(result);
  } catch (err) {
    handleError(res, err, 'BOOKING_CODE_VERIFY_FAILED');
  }
}

// ==================================================
// AUTHENTICATION SESSION & AUDIT
// ==================================================

export async function getAuthSession(req: AuthenticatedRequest, res: Response) {
  const user = req.authUser;
  if (!user) {
    return res.status(401).json({ authenticated: false, error: 'Not authenticated.' });
  }
  const access = platformConfigService.getUserAccess(user.uid);
  const admin = isUserAuthorizedAdmin(user);
  res.json({
    authenticated: true,
    uid: user.uid,
    email: user.email,
    displayName: access?.displayName || user.name || user.email.split('@')[0],
    emailVerified: user.emailVerified,
    isAdmin: admin,
    role: admin ? 'ADMIN' : access?.role || 'USER',
    disabled: Boolean(access?.disabled),
    serverTimestamp: new Date().toISOString(),
  });
}

export async function recordAuthAudit(req: AuthenticatedRequest, res: Response) {
  const parsed = authAuditSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid audit payload.' });
  }
  const { event, email, details } = parsed.data;
  const level = event === 'LOGIN_FAILED' ? 'WARN' : 'INFO';
  const entry = backendLogger.log({
    level,
    category: 'AUTH',
    event,
    message: details || `Authentication event ${event}${email ? ` (${email})` : ''}.`,
    actorUid: req.authUser?.uid || null,
    actorEmail: req.authUser?.email || email || null,
  });
  res.json({ logged: true, id: entry.id });
}

// ==================================================
// CROSS-BOOKMAKER BET TRANSFER (SPORTYBET <-> BETPAWA)
// ==================================================

export async function getTransferMarkets(_req: Request, res: Response) {
  const settings = platformConfigService.getSettings();
  res.json({
    markets: Object.values(CANONICAL_MARKET_CATALOG),
    enabledMarkets: settings.supportedTransferMarkets,
    crossTransferEnabled: platformConfigService.isCrossTransferEnabled(),
    bookmakerStatus: {
      SPORTYBET_TZ: settings.sportybetEnabled,
      BETPAWA_TZ: settings.betpawaEnabled,
    },
  });
}

export async function previewTransfer(req: AuthenticatedRequest, res: Response) {
  if (!platformConfigService.isCrossTransferEnabled()) {
    return res.status(503).json({
      error:
        'Cross-Bookmaker Bet Transfer is currently disabled by an administrator or one of the bookmakers is disabled.',
    });
  }

  const parsed = transferPreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid bet transfer preview request.',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  try {
    const preview = await previewCrossBookmakerTransfer({
      direction: parsed.data.direction,
      bookingCode: parsed.data.bookingCode,
      manualSelections: parsed.data.manualSelections,
      actorUid: req.authUser?.uid || null,
      actorEmail: req.authUser?.email || null,
    });
    res.json(preview);
  } catch (err) {
    handleError(res, err, 'TRANSFER_PREVIEW_FAILED');
  }
}

export async function confirmTransfer(req: AuthenticatedRequest, res: Response) {
  if (!platformConfigService.isCrossTransferEnabled()) {
    return res.status(503).json({
      error: 'Cross-Bookmaker Bet Transfer is currently disabled by an administrator.',
    });
  }

  const parsed = transferConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid transfer confirmation payload.',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  try {
    const result = await confirmCrossBookmakerTransfer({
      transferId: parsed.data.transferId,
      direction: parsed.data.direction,
      originalCode: parsed.data.originalCode,
      originalSelectionCount: parsed.data.originalSelectionCount,
      originalCombinedOdds: parsed.data.originalCombinedOdds,
      confirmedSelections: parsed.data.confirmedSelections,
      actorUid: req.authUser?.uid || null,
      actorEmail: req.authUser?.email || null,
    });
    res.json(result);
  } catch (err) {
    handleError(res, err, 'TRANSFER_CONFIRM_FAILED');
  }
}

export async function getUserTransferHistory(req: AuthenticatedRequest, res: Response) {
  const user = req.authUser;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const all = platformConfigService.getTransferHistory({ limit: 100 });
  const isAdmin = isUserAuthorizedAdmin(user);
  const transfers = isAdmin ? all : all.filter((t) => t.actorUid === user.uid);
  res.json({ transfers, count: transfers.length });
}

// ==================================================
// SHARED PUBLIC DAILY TICKETS, ANALYTICS & ADMIN CONTROLS
// ==================================================

export async function checkAdminStatus(req: Request, res: Response) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.json({ isAdmin: false, email: null });
  }
  const verified = await verifyFirebaseIdToken(token);
  if (!verified) {
    return res.json({ isAdmin: false, email: null });
  }
  platformConfigService.upsertSeenUser({
    uid: verified.uid,
    email: verified.email,
    displayName: verified.name,
    emailVerified: verified.emailVerified,
    defaultAdmin: isAdminEmail(verified.email, verified.emailVerified),
  });
  return res.json({
    isAdmin: isUserAuthorizedAdmin(verified),
    email: verified.email,
    emailVerified: verified.emailVerified,
  });
}

export async function listPublicTickets(req: Request, res: Response) {
  const bookmakerFilter = req.query.bookmaker ? String(req.query.bookmaker).trim().toUpperCase() : '';
  let tickets = automationStore.getTickets().filter((t) => isTicketAllowedInDailyFeed(t));
  if (bookmakerFilter === 'SPORTYBET_TZ' || bookmakerFilter === 'BETPAWA_TZ') {
    tickets = tickets.filter((t) => normalizeBookmakerId(t.bookmakerId) === bookmakerFilter);
  }
  res.json({ tickets, count: tickets.length });
}

export async function getPublicTicketById(req: Request, res: Response) {
  const id = String(req.params.id || '').trim();
  const ticket = automationStore.getTicketById(id);
  if (!ticket || !isTicketAllowedInDailyFeed(ticket)) {
    return res.status(404).json({ error: `Ticket ${id} not found.` });
  }
  res.json({ ticket });
}

export async function getPerformanceAnalytics(_req: Request, res: Response) {
  const tickets = automationStore.getTickets();
  const cfg = automationStore.getFactoryConfig();
  const meta = automationStore.getTimestamps();
  const todayKey = getDateKeyInTimezone(Date.now(), cfg.timezone);
  const summary = computePerformanceAnalytics(tickets, {
    todayKey,
    dailyTarget: cfg.dailyTicketTarget,
    lastScanningAt: meta.lastScanningAt,
    lastSettlementAt: meta.lastResultsRunAt,
  });
  res.json(summary);
}

export async function getSchedulerStatus(_req: Request, res: Response) {
  res.json({
    status: schedulerService.getStatus(),
  });
}

// ==================================================
// VERCEL CRON HANDLERS
// ==================================================

export async function runCronDailyFactory(req: AdminRequest, res: Response) {
  try {
    const actor = req.adminUser?.email || 'vercel-cron';
    const result = await schedulerService.runDailyFactoryJob(false, actor);
    backendLogger.info('CRON', 'DAILY_FACTORY_CRON', result.log.message, {
      actorEmail: actor,
      metadata: {
        status: result.log.status,
        ticketsGenerated: result.log.ticketsGenerated,
      },
    });
    res.json({
      ok: true,
      log: result.log,
      shortfallReason: result.shortfallReason,
      status: schedulerService.getStatus(),
    });
  } catch (err) {
    handleError(res, err, 'CRON_DAILY_FACTORY_FAILED');
  }
}

export async function runCronTrackResults(req: AdminRequest, res: Response) {
  try {
    const actor = req.adminUser?.email || 'vercel-cron';
    const result = await schedulerService.runResultsTrackingJob(true, undefined, actor);
    backendLogger.info('CRON', 'RESULTS_TRACKER_CRON', result.log.message, {
      actorEmail: actor,
      metadata: {
        status: result.log.status,
        ticketsChecked: result.log.ticketsChecked,
        ticketsSettled: result.log.ticketsSettled,
      },
    });
    res.json({
      ok: true,
      log: result.log,
      status: schedulerService.getStatus(),
    });
  } catch (err) {
    handleError(res, err, 'CRON_RESULTS_FAILED');
  }
}

// ==================================================
// ADMIN-PROTECTED HANDLERS
// ==================================================

export async function getDailyFactoryAdminState(_req: AdminRequest, res: Response) {
  res.json({
    config: automationStore.getFactoryConfig(),
    status: schedulerService.getStatus(),
    logs: automationStore.getLogs().slice(0, 80),
  });
}

export async function updateDailyFactoryConfig(req: AdminRequest, res: Response) {
  const parsed = dailyFactoryConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid Daily Factory configuration.',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  const cleanedMarkets = sanitizeDailyFactoryMarkets(parsed.data.markets || []);
  const saved = automationStore.setFactoryConfig({
    ...parsed.data,
    markets:
      cleanedMarkets.length > 0 ? cleanedMarkets : [...DEFAULT_ALLOWED_DAILY_FEED_MARKETS],
  });
  schedulerService.rescheduleFactoryTimer();
  const nowIso = new Date().toISOString();
  automationStore.addLog({
    logId: `log_${crypto.randomBytes(4).toString('hex')}`,
    actionType: 'SETTINGS_UPDATE',
    jobType: 'ADMIN_ACTION',
    status: 'SUCCESS',
    actorEmail: req.adminUser?.email || null,
    startedAt: nowIso,
    finishedAt: nowIso,
    durationMs: 0,
    ticketsGenerated: 0,
    codesCreated: 0,
    codeFailures: 0,
    ticketsChecked: 0,
    ticketsSettled: 0,
    message: `Updated factory settings: odds ${saved.minIndividualOdds.toFixed(
      2
    )}–${saved.maxIndividualOdds.toFixed(2)}, daily target ${saved.dailyTicketTarget}, ${
      saved.oddsCategories.length
    } categories, auto-booking ${saved.autoCreateBookingCodes ? 'ON' : 'OFF'}.`,
  });

  res.json({
    config: saved,
    status: schedulerService.getStatus(),
    logs: automationStore.getLogs().slice(0, 80),
  });
}

export async function toggleFactoryAutomation(req: AdminRequest, res: Response) {
  const mode = String(req.body?.mode || '').toLowerCase();
  const cfg = automationStore.getFactoryConfig();
  let nextCfg = { ...cfg };
  let label = '';

  if (mode === 'pause') {
    nextCfg = { ...cfg, paused: true };
    label = 'Paused scheduled daily generation';
  } else if (mode === 'resume') {
    nextCfg = { ...cfg, enabled: true, paused: false };
    label = 'Resumed scheduled daily generation';
  } else if (mode === 'start') {
    nextCfg = { ...cfg, enabled: true, paused: false };
    label = 'Started automatic daily factory';
  } else if (mode === 'stop') {
    nextCfg = { ...cfg, enabled: false, paused: false };
    label = 'Stopped automatic daily factory';
  } else {
    return res.status(400).json({ error: 'Invalid toggle mode. Use start, stop, pause, or resume.' });
  }

  const saved = automationStore.setFactoryConfig(nextCfg);
  schedulerService.rescheduleFactoryTimer();
  const nowIso = new Date().toISOString();
  automationStore.addLog({
    logId: `log_${crypto.randomBytes(4).toString('hex')}`,
    actionType: 'SYSTEM_TOGGLE',
    jobType: 'ADMIN_ACTION',
    status: 'SUCCESS',
    actorEmail: req.adminUser?.email || null,
    startedAt: nowIso,
    finishedAt: nowIso,
    durationMs: 0,
    ticketsGenerated: 0,
    codesCreated: 0,
    codeFailures: 0,
    ticketsChecked: 0,
    ticketsSettled: 0,
    message: `${label} by ${req.adminUser?.email || 'admin'}.`,
  });

  res.json({
    config: saved,
    status: schedulerService.getStatus(),
    logs: automationStore.getLogs().slice(0, 80),
  });
}

export async function runDailyFactoryNow(req: AdminRequest, res: Response) {
  try {
    const result = await schedulerService.runDailyFactoryJob(true, req.adminUser?.email || null);
    res.json({
      ...result,
      status: schedulerService.getStatus(),
      tickets: automationStore.getTickets(),
      logs: automationStore.getLogs().slice(0, 80),
    });
  } catch (err) {
    handleError(res, err, 'DAILY_FACTORY_RUN_FAILED');
  }
}

export async function deleteGeneratedTicket(req: AdminRequest, res: Response) {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'Ticket ID is required.' });
  }
  const removed = automationStore.deleteTicket(id);
  if (!removed) {
    return res.status(404).json({ error: `Ticket ${id} not found.` });
  }
  const nowIso = new Date().toISOString();
  automationStore.addLog({
    logId: `log_${crypto.randomBytes(4).toString('hex')}`,
    actionType: 'MANUAL_TRIGGER',
    jobType: 'ADMIN_ACTION',
    status: 'SUCCESS',
    actorEmail: req.adminUser?.email || null,
    startedAt: nowIso,
    finishedAt: nowIso,
    durationMs: 0,
    ticketsGenerated: 0,
    codesCreated: 0,
    codeFailures: 0,
    ticketsChecked: 0,
    ticketsSettled: 0,
    message: `Removed ticket ${id} from public feed.`,
  });
  res.json({ deleted: true, internalTicketId: id });
}

export async function createTicketBookingCode(req: AdminRequest, res: Response) {
  const id = String(req.params.id || '').trim();
  const ticket = automationStore.getTicketById(id);
  if (!ticket) {
    return res.status(404).json({ error: `Ticket ${id} not found.` });
  }

  const ticketBookmaker = normalizeBookmakerId(ticket.bookmakerId);
  if (!assertBookmakerEnabledOrRespond(res, ticketBookmaker)) return;

  const client = getBookmakerClient(ticketBookmaker);
  const bookmakerInfo = getBookmakerInfo(ticketBookmaker);

  try {
    assertSameBookmakerSelections(ticket.selections, ticketBookmaker);
    const booking = await client.createBookingCode(ticket.selections);
    const cleanCode = String(booking.shareCode || '').trim().toUpperCase();
    const usedCodes = automationStore.getExistingShareCodes(ticket.internalTicketId);
    if (!cleanCode || usedCodes.has(cleanCode)) {
      throw new Error(
        cleanCode
          ? `Booking code ${cleanCode} is already assigned to another card in the daily feed.`
          : `${bookmakerInfo.shortName} returned an empty booking code.`
      );
    }
    const updated = automationStore.updateTicketMutableFields({
      ...ticket,
      shareCode: booking.shareCode,
      shareUrl: booking.shareUrl,
      shareCodeDeadline: booking.deadline,
      shareCodeVerified: booking.verified,
      bookingCodeStatus: 'GENERATED',
      bookingCodeError: null,
      lastCheckedAt: new Date().toISOString(),
    });
    res.json({ ticket: updated, booking });
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : `${bookmakerInfo.shortName} sharing-code API rejected this betslip`;
    automationStore.updateTicketMutableFields({
      ...ticket,
      bookingCodeStatus: 'FAILED',
      bookingCodeError: msg,
      lastCheckedAt: new Date().toISOString(),
    });
    handleError(res, err, 'TICKET_BOOKING_CODE_FAILED');
  }
}

export async function retryFailedBookingCodesHandler(req: AdminRequest, res: Response) {
  try {
    const ticketIds = Array.isArray(req.body?.ticketIds)
      ? (req.body.ticketIds as string[])
      : undefined;
    const result = await schedulerService.retryFailedBookingCodes(
      ticketIds,
      req.adminUser?.email || null
    );
    res.json({
      ...result,
      status: schedulerService.getStatus(),
      logs: automationStore.getLogs().slice(0, 80),
    });
  } catch (err) {
    handleError(res, err, 'RETRY_BOOKING_CODES_FAILED');
  }
}

export async function trackTicketsResults(req: AdminRequest, res: Response) {
  try {
    const ticketIds = Array.isArray(req.body?.ticketIds)
      ? (req.body.ticketIds as string[])
      : undefined;
    const result = await schedulerService.runResultsTrackingJob(
      true,
      ticketIds,
      req.adminUser?.email || null
    );
    res.json({
      ...result,
      status: schedulerService.getStatus(),
      tickets: automationStore.getTickets(),
      logs: automationStore.getLogs().slice(0, 80),
    });
  } catch (err) {
    handleError(res, err, 'TRACK_RESULTS_FAILED');
  }
}

export async function getAdminOverview(_req: AdminRequest, res: Response) {
  res.json({
    platformSettings: platformConfigService.getSettings(),
    canonicalMarkets: Object.values(CANONICAL_MARKET_CATALOG),
    transferHistory: platformConfigService.getTransferHistory({ limit: 100 }),
    backendLogs: backendLogger.list({ limit: 120 }),
    managedUsers: platformConfigService.listUsers(),
    firebaseMeta: getFirebaseProjectMeta(),
  });
}

export async function updatePlatformSettings(req: AdminRequest, res: Response) {
  const parsed = platformSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid platform settings payload.',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  const saved = platformConfigService.updateSettings(
    parsed.data,
    req.adminUser?.email || null
  );
  backendLogger.info(
    'ADMIN',
    'PLATFORM_SETTINGS_UPDATED',
    `Updated integrations: SportyBet=${saved.sportybetEnabled}, betPawa=${saved.betpawaEnabled}, Transfer=${saved.crossTransferEnabled} (${saved.supportedTransferMarkets.length} markets).`,
    {
      actorUid: req.adminUser?.uid || null,
      actorEmail: req.adminUser?.email || null,
    }
  );
  res.json({ platformSettings: saved });
}

export async function updateUserAccess(req: AdminRequest, res: Response) {
  const uid = String(req.params.uid || '').trim();
  if (!uid || uid.length > 128) {
    return res.status(400).json({ error: 'Valid uid parameter is required.' });
  }
  const parsed = userAccessUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid user access update payload.',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }

  // Prevent administrator from disabling or demoting themselves accidentally
  if (req.adminUser?.uid === uid && (parsed.data.disabled === true || parsed.data.role === 'USER')) {
    return res.status(400).json({
      error: 'You cannot demote or disable your own active administrator account.',
    });
  }

  const updated = platformConfigService.updateUserAccess(
    uid,
    parsed.data,
    req.adminUser?.email || null
  );
  backendLogger.info(
    'ADMIN',
    'USER_ACCESS_UPDATED',
    `Updated access for ${updated.email}: role=${updated.role}, disabled=${updated.disabled}.`,
    {
      actorUid: req.adminUser?.uid || null,
      actorEmail: req.adminUser?.email || null,
      metadata: { targetUid: uid, role: updated.role, disabled: updated.disabled },
    }
  );
  res.json({ user: updated });
}

export async function getAdminTransfers(req: AdminRequest, res: Response) {
  const status = req.query.status ? String(req.query.status) : undefined;
  const transfers = platformConfigService.getTransferHistory({ status, limit: 150 });
  res.json({ transfers, count: transfers.length });
}

export async function getAdminLogs(req: AdminRequest, res: Response) {
  const level = req.query.level
    ? (String(req.query.level).toUpperCase() as BackendLogEntry['level'])
    : undefined;
  const category = req.query.category
    ? (String(req.query.category).toUpperCase() as BackendLogEntry['category'])
    : undefined;
  const logs = backendLogger.list({ level, category, limit: 150 });
  res.json({ logs, count: logs.length });
}
