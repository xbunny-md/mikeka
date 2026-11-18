import { Router } from 'express';
import {
  checkAdminStatus,
  confirmTransfer,
  createBookingCode,
  createTicketBookingCode,
  deleteGeneratedTicket,
  getAdminLogs,
  getAdminOverview,
  getAdminTransfers,
  getAuthSession,
  getBookmakers,
  getDailyFactoryAdminState,
  getDiagnostics,
  getHealth,
  getLeagues,
  getLiveMatches,
  getMarketCatalog,
  getMatchDetails,
  getPerformanceAnalytics,
  getPlatformStatus,
  getPublicTicketById,
  getResearchReport,
  getSchedulerStatus,
  getTransferMarkets,
  getUpcomingMatches,
  getUserTransferHistory,
  listPublicTickets,
  previewTransfer,
  recordAuthAudit,
  retryFailedBookingCodesHandler,
  runCronDailyFactory,
  runCronTrackResults,
  runDailyFactoryNow,
  runScanner,
  toggleFactoryAutomation,
  trackTicketsResults,
  updateDailyFactoryConfig,
  updatePlatformSettings,
  updateUserAccess,
  validateBetslip,
  verifyBookingCode,
} from '../controllers/sportybetController.ts';
import {
  optionalAuth,
  requireAdmin,
  requireAuthenticated,
  requireCronOrAdmin,
} from '../middleware/adminAuth.ts';
import { apiRateLimiter, bookingCodeRateLimiter } from '../middleware/rateLimiter.ts';

export const apiRouter = Router();

apiRouter.use(apiRateLimiter);

// Public Health, Bookmaker Catalog & Slip Tools
apiRouter.get('/health', getHealth);
apiRouter.get('/platform/status', getPlatformStatus);
apiRouter.get('/bookmakers', getBookmakers);
apiRouter.get('/research-report', getResearchReport);
apiRouter.get('/markets', getMarketCatalog);
apiRouter.get('/diagnostics', getDiagnostics);
apiRouter.get('/sports/leagues', getLeagues);
apiRouter.get('/matches/live', getLiveMatches);
apiRouter.get('/matches/upcoming', getUpcomingMatches);
apiRouter.get('/matches/:eventId', getMatchDetails);
apiRouter.post('/scanner/run', runScanner);
apiRouter.post('/betslip/validate', validateBetslip);
apiRouter.post('/booking-codes/create', bookingCodeRateLimiter, createBookingCode);
apiRouter.get('/booking-codes/verify/:code', verifyBookingCode);

// Authentication & Session Endpoints
apiRouter.get('/auth/session', requireAuthenticated, getAuthSession);
apiRouter.post('/auth/audit', optionalAuth, recordAuthAudit);
apiRouter.get('/admin/me', checkAdminStatus);

// Cross-Bookmaker Bet Transfer (SportyBet TZ <-> betPawa TZ)
apiRouter.get('/transfer/markets', getTransferMarkets);
apiRouter.post('/transfer/preview', optionalAuth, previewTransfer);
apiRouter.post('/transfer/confirm', optionalAuth, bookingCodeRateLimiter, confirmTransfer);
apiRouter.get('/transfer/history', requireAuthenticated, getUserTransferHistory);

// Public Shared Daily Ticket Feed & Analytics
apiRouter.get('/tickets', listPublicTickets);
apiRouter.get('/tickets/:id', getPublicTicketById);
apiRouter.get('/analytics/performance', getPerformanceAnalytics);
apiRouter.get('/scheduler/status', getSchedulerStatus);

// Vercel Cron Job Endpoints (Secret or Admin Verified)
apiRouter.get('/cron/daily-factory', requireCronOrAdmin, runCronDailyFactory);
apiRouter.post('/cron/daily-factory', requireCronOrAdmin, runCronDailyFactory);
apiRouter.get('/cron/track-results', requireCronOrAdmin, runCronTrackResults);
apiRouter.post('/cron/track-results', requireCronOrAdmin, runCronTrackResults);

// Administrator-Protected Control Center, Platform Settings, Users & Logs
apiRouter.get('/factory/config', requireAdmin, getDailyFactoryAdminState);
apiRouter.put('/factory/config', requireAdmin, updateDailyFactoryConfig);
apiRouter.post('/factory/toggle', requireAdmin, toggleFactoryAutomation);
apiRouter.post('/factory/run', requireAdmin, runDailyFactoryNow);
apiRouter.delete('/tickets/:id', requireAdmin, deleteGeneratedTicket);
apiRouter.post(
  '/tickets/:id/booking-code',
  requireAdmin,
  bookingCodeRateLimiter,
  createTicketBookingCode
);
apiRouter.post('/tickets/retry-booking-codes', requireAdmin, retryFailedBookingCodesHandler);
apiRouter.post('/tickets/track-results', requireAdmin, trackTicketsResults);
apiRouter.post('/scheduler/results-run', requireAdmin, trackTicketsResults);

apiRouter.get('/admin/overview', requireAdmin, getAdminOverview);
apiRouter.put('/admin/platform-settings', requireAdmin, updatePlatformSettings);
apiRouter.patch('/admin/users/:uid', requireAdmin, updateUserAccess);
apiRouter.get('/admin/transfers', requireAdmin, getAdminTransfers);
apiRouter.get('/admin/logs', requireAdmin, getAdminLogs);
