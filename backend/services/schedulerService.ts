import crypto from 'crypto';
import { getBookmakerInfo, normalizeBookmakerId } from '../config/bookmakers.ts';
import { getBookmakerClient } from '../integrations/bookmakerRegistry.ts';
import type {
  AutomationJobLog,
  BookmakerId,
  DailyFactoryConfig,
  GeneratedTicket,
  NormalizedMatch,
  SchedulerStatus,
} from '../../src/types/sportybet.ts';
import { automationStore } from './automationStore.ts';
import {
  fetchUpcomingMatchesForFactory,
  generateDailyPortfolioFromMatches,
  getDateKeyInTimezone,
  getTimeMinutesInTimezone,
  parseHhMmToMinutes,
  revalidateTicketSelectionsAgainstMatches,
} from './dailyFactoryEngine.ts';
import { evaluateTicketSettlement } from './settlementService.ts';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SchedulerService {
  private factoryTimer: NodeJS.Timeout | null = null;
  private resultsTimer: NodeJS.Timeout | null = null;
  private bootTimer: NodeJS.Timeout | null = null;
  private factoryLock = false;
  private resultsLock = false;
  private readonly resultsIntervalMinutes = 10;

  start(): void {
    this.rescheduleFactoryTimer();
    if (!this.resultsTimer) {
      this.resultsTimer = setInterval(() => {
        void this.runResultsTrackingJob(false);
      }, this.resultsIntervalMinutes * 60 * 1000);
      this.resultsTimer.unref?.();
    }

    // Automatic initial catch-up run on server boot if not running inside test runner
    if (process.env.NODE_ENV !== 'test' && !this.bootTimer) {
      this.bootTimer = setTimeout(() => {
        const cfg = automationStore.getFactoryConfig();
        if (cfg.enabled && !cfg.paused) {
          const todayCount = this.getDailyTicketsCountToday(cfg.timezone);
          if (todayCount < Math.min(cfg.maxTickets, cfg.dailyTicketTarget)) {
            void this.runDailyFactoryJob(false, null);
          }
        }
      }, 3000);
      this.bootTimer.unref?.();
    }
  }

  stop(): void {
    if (this.bootTimer) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
    if (this.factoryTimer) {
      clearInterval(this.factoryTimer);
      this.factoryTimer = null;
    }
    if (this.resultsTimer) {
      clearInterval(this.resultsTimer);
      this.resultsTimer = null;
    }
  }

  rescheduleFactoryTimer(): void {
    if (this.factoryTimer) {
      clearInterval(this.factoryTimer);
      this.factoryTimer = null;
    }
    const cfg = automationStore.getFactoryConfig();
    if (!cfg.enabled || cfg.paused) return;

    const intervalMs = Math.max(5, cfg.scheduleIntervalMinutes) * 60 * 1000;
    this.factoryTimer = setInterval(() => {
      void this.runDailyFactoryJob(false, null);
    }, intervalMs);
    this.factoryTimer.unref?.();
  }

  isWithinOperatingWindow(cfg: DailyFactoryConfig, nowMs = Date.now()): boolean {
    const tz = cfg.timezone || 'Africa/Dar_es_Salaam';
    const currentMin = getTimeMinutesInTimezone(nowMs, tz);
    const startMin = parseHhMmToMinutes(cfg.windowStartTime, 0);
    const endMin = parseHhMmToMinutes(cfg.windowEndTime, 23 * 60 + 59);

    if (startMin <= endMin) {
      return currentMin >= startMin && currentMin <= endMin;
    }
    return currentMin >= startMin || currentMin <= endMin;
  }

  getDailyTicketsCountToday(tz = 'Africa/Dar_es_Salaam'): number {
    const todayKey = getDateKeyInTimezone(Date.now(), tz);
    return automationStore
      .getTickets()
      .filter((t) => t.generatedDateKey === todayKey).length;
  }

  getStatus(): SchedulerStatus {
    const cfg = automationStore.getFactoryConfig();
    const meta = automationStore.getTimestamps();
    const todayKey = getDateKeyInTimezone(Date.now(), cfg.timezone);
    const todayTickets = automationStore
      .getTickets()
      .filter((t) => t.generatedDateKey === todayKey);

    const nextRun =
      cfg.enabled && !cfg.paused && meta.lastFactoryRunAt
        ? new Date(
            Date.parse(meta.lastFactoryRunAt) +
              Math.max(5, cfg.scheduleIntervalMinutes) * 60 * 1000
          ).toISOString()
        : null;

    return {
      enabled: cfg.enabled,
      paused: cfg.paused,
      factoryRunning: this.factoryLock,
      resultsTrackerRunning: this.resultsLock,
      resultsIntervalMinutes: this.resultsIntervalMinutes,
      lastFactoryRunAt: meta.lastFactoryRunAt,
      lastResultsRunAt: meta.lastResultsRunAt,
      lastScanningAt: meta.lastScanningAt,
      lastSettlementAt: meta.lastResultsRunAt,
      nextFactoryRunAt: nextRun,
      totalDailyTicketsToday: todayTickets.length,
      dailyTicketTarget: cfg.dailyTicketTarget,
      bookingCodesGeneratedToday: todayTickets.filter(
        (t) => t.bookingCodeStatus === 'GENERATED' && Boolean(t.shareCode)
      ).length,
      bookingCodeFailuresToday: todayTickets.filter(
        (t) => t.bookingCodeStatus === 'FAILED'
      ).length,
      dailyShortfallReason: meta.dailyShortfallReason,
    };
  }

  private async revalidateAndPublishTickets(
    candidates: GeneratedTicket[],
    cfg: DailyFactoryConfig
  ): Promise<{
    publishedTickets: GeneratedTicket[];
    rejectedCount: number;
    codesCreated: number;
    codeFailures: number;
  }> {
    if (candidates.length === 0) {
      return { publishedTickets: [], rejectedCount: 0, codesCreated: 0, codeFailures: 0 };
    }

    const activeBookmaker = normalizeBookmakerId(
      candidates[0]?.bookmakerId || cfg.activeBookmaker
    );
    const client = getBookmakerClient(activeBookmaker);
    const bookmakerInfo = getBookmakerInfo(activeBookmaker);

    // Batch-fetch live match details once per distinct eventId for strict pre-publish validation
    const uniqueEventIds = Array.from(
      new Set(candidates.flatMap((t) => t.selections.map((s) => s.eventId)))
    );
    const matchLookup = new Map<string, NormalizedMatch | null>();

    for (let i = 0; i < uniqueEventIds.length; i += 10) {
      const chunk = uniqueEventIds.slice(i, i + 10);
      await Promise.all(
        chunk.map(async (eventId) => {
          try {
            const match = await client.getMatchDetails(eventId);
            matchLookup.set(eventId, match);
          } catch {
            matchLookup.set(eventId, null);
          }
        })
      );
    }

    const nowMs = Date.now();
    const revalidatedAt = new Date(nowMs).toISOString();
    const publishedTickets: GeneratedTicket[] = [];
    let rejectedCount = 0;
    let codesCreated = 0;
    let codeFailures = 0;

    const usedShareCodes = automationStore.getExistingShareCodes();

    for (const candidate of candidates) {
      const check = revalidateTicketSelectionsAgainstMatches(
        candidate.selections,
        matchLookup,
        cfg,
        nowMs
      );
      if (!check.valid) {
        rejectedCount++;
        continue;
      }

      const refreshedCombined = Number(
        check.refreshedSelections.reduce((acc, s) => acc * s.odds, 1).toFixed(2)
      );

      let validatedTicket: GeneratedTicket = {
        ...candidate,
        bookmakerId: activeBookmaker,
        bookmakerName: candidate.bookmakerName || bookmakerInfo.name,
        bookmakerUrl: candidate.bookmakerUrl || bookmakerInfo.websiteUrl,
        selections: check.refreshedSelections,
        actualCombinedOdds: refreshedCombined,
        effectiveCombinedOdds: refreshedCombined,
        oddsDifference: Number((refreshedCombined - candidate.targetOdds).toFixed(2)),
        revalidatedAt,
        published: true,
      };

      if (cfg.autoCreateBookingCodes) {
        try {
          const booking = await client.createBookingCode(validatedTicket.selections);
          const cleanCode = String(booking.shareCode || '').trim().toUpperCase();
          if (!cleanCode || usedShareCodes.has(cleanCode)) {
            throw new Error(
              cleanCode
                ? `Duplicate booking code ${cleanCode} rejected to preserve unique card codes.`
                : `${bookmakerInfo.shortName} returned an empty booking code.`
            );
          }
          usedShareCodes.add(cleanCode);
          validatedTicket = {
            ...validatedTicket,
            shareCode: booking.shareCode,
            shareUrl: booking.shareUrl,
            shareCodeDeadline: booking.deadline,
            shareCodeVerified: booking.verified,
            bookingCodeStatus: 'GENERATED',
            bookingCodeError: null,
          };
          codesCreated++;
          // Gentle pacing so upstream booking-code API stays unthrottled on 50+ ticket batches
          await sleep(100);
        } catch (err) {
          codeFailures++;
          validatedTicket = {
            ...validatedTicket,
            shareCode: null,
            shareUrl: null,
            shareCodeDeadline: null,
            shareCodeVerified: false,
            bookingCodeStatus: 'FAILED',
            bookingCodeError:
              err instanceof Error
                ? err.message
                : `${bookmakerInfo.shortName} sharing-code API rejected or throttled this betslip.`,
          };
        }
      }

      publishedTickets.push(validatedTicket);
    }

    return { publishedTickets, rejectedCount, codesCreated, codeFailures };
  }

  async runDailyFactoryJob(
    manualTrigger = true,
    actorEmail: string | null = null
  ): Promise<{
    tickets: GeneratedTicket[];
    log: AutomationJobLog;
    shortfallReason: string | null;
  }> {
    const startedMs = Date.now();
    const startedAt = new Date(startedMs).toISOString();
    const cfg = automationStore.getFactoryConfig();
    const actionType = manualTrigger ? 'MANUAL_TRIGGER' : 'AUTO_SCHEDULE';

    if (this.factoryLock) {
      const skippedLog: AutomationJobLog = {
        logId: `log_${crypto.randomBytes(4).toString('hex')}`,
        actionType,
        jobType: 'DAILY_FACTORY',
        status: 'SKIPPED',
        actorEmail,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        ticketsGenerated: 0,
        codesCreated: 0,
        codeFailures: 0,
        ticketsChecked: 0,
        ticketsSettled: 0,
        message: 'Skipped overlapping Daily Factory execution (active run in progress).',
      };
      automationStore.addLog(skippedLog);
      return { tickets: [], log: skippedLog, shortfallReason: skippedLog.message };
    }

    if (!manualTrigger && (!cfg.enabled || cfg.paused)) {
      const skippedLog: AutomationJobLog = {
        logId: `log_${crypto.randomBytes(4).toString('hex')}`,
        actionType,
        jobType: 'DAILY_FACTORY',
        status: 'SKIPPED',
        actorEmail,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        ticketsGenerated: 0,
        codesCreated: 0,
        codeFailures: 0,
        ticketsChecked: 0,
        ticketsSettled: 0,
        message: cfg.paused
          ? 'Daily Factory scheduler is paused by administrator.'
          : 'Daily Factory automation is disabled.',
      };
      return { tickets: [], log: skippedLog, shortfallReason: null };
    }

    if (!manualTrigger && !this.isWithinOperatingWindow(cfg, startedMs)) {
      const skippedLog: AutomationJobLog = {
        logId: `log_${crypto.randomBytes(4).toString('hex')}`,
        actionType,
        jobType: 'DAILY_FACTORY',
        status: 'SKIPPED',
        actorEmail,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        ticketsGenerated: 0,
        codesCreated: 0,
        codeFailures: 0,
        ticketsChecked: 0,
        ticketsSettled: 0,
        message: `Outside configured ${cfg.windowStartTime}–${cfg.windowEndTime} ${cfg.timezone} window.`,
      };
      automationStore.addLog(skippedLog);
      return { tickets: [], log: skippedLog, shortfallReason: null };
    }

    const existingToday = this.getDailyTicketsCountToday(cfg.timezone);
    const cap = Math.min(cfg.maxTickets, cfg.dailyTicketTarget);
    const remainingCapacity = manualTrigger
      ? Math.max(0, cfg.maxTickets - existingToday)
      : Math.max(0, cap - existingToday);

    if (remainingCapacity <= 0) {
      const msg = `Daily ticket target already reached (${existingToday}/${cap} today in ${cfg.timezone}).`;
      const log: AutomationJobLog = {
        logId: `log_${crypto.randomBytes(4).toString('hex')}`,
        actionType,
        jobType: 'DAILY_FACTORY',
        status: 'SKIPPED',
        actorEmail,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        ticketsGenerated: 0,
        codesCreated: 0,
        codeFailures: 0,
        ticketsChecked: 0,
        ticketsSettled: 0,
        message: msg,
      };
      automationStore.addLog(log);
      automationStore.setFactoryRunMeta(startedAt, null);
      return { tickets: [], log, shortfallReason: null };
    }

    this.factoryLock = true;
    try {
      const matches = await fetchUpcomingMatchesForFactory(cfg);
      automationStore.setScanningAt(new Date().toISOString());

      const existingSignatures = cfg.duplicatePrevention
        ? automationStore.getExistingSignatures()
        : new Set<string>();

      const batchTarget = manualTrigger
        ? Math.min(remainingCapacity, cfg.dailyTicketTarget)
        : remainingCapacity;

      const todayKey = getDateKeyInTimezone(Date.now(), cfg.timezone);
      const { eventIds: existingEventIds, teamKeys: existingTeamKeys } =
        automationStore.getExistingEventAndTeamUsage(todayKey);

      const generated = generateDailyPortfolioFromMatches({
        matches,
        config: cfg,
        targetCount: batchTarget,
        sourceType: manualTrigger ? 'ADMIN_MANUAL' : 'DAILY_FACTORY',
        existingSignatures,
        existingEventIds,
        existingTeamKeys,
        nowMs: Date.now(),
      });

      const { publishedTickets, rejectedCount, codesCreated, codeFailures } =
        await this.revalidateAndPublishTickets(generated.tickets, cfg);

      const saved = automationStore.addTickets(publishedTickets);
      const finishedAt = new Date().toISOString();

      const combinedShortfall =
        generated.shortfallReason ||
        (rejectedCount > 0
          ? `${rejectedCount} candidate ticket(s) rejected during live pre-publish odds/status revalidation.`
          : null);

      automationStore.setFactoryRunMeta(finishedAt, combinedShortfall);

      const log: AutomationJobLog = {
        logId: `log_${crypto.randomBytes(4).toString('hex')}`,
        actionType,
        jobType: 'DAILY_FACTORY',
        status: combinedShortfall ? 'PARTIAL' : 'SUCCESS',
        actorEmail,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedMs,
        ticketsGenerated: saved.length,
        codesCreated,
        codeFailures,
        ticketsChecked: 0,
        ticketsSettled: 0,
        message: combinedShortfall
          ? `Published ${saved.length} validated ticket(s) (${codesCreated} genuine codes, ${codeFailures} code failures). ${combinedShortfall}`
          : `Published ${saved.length} unique daily ticket(s) (${codesCreated} genuine codes, ${codeFailures} failures).`,
      };
      automationStore.addLog(log);
      return { tickets: saved, log, shortfallReason: combinedShortfall };
    } catch (err) {
      const finishedAt = new Date().toISOString();
      const errMsg = err instanceof Error ? err.message : 'Daily Factory job failed';
      const log: AutomationJobLog = {
        logId: `log_${crypto.randomBytes(4).toString('hex')}`,
        actionType,
        jobType: 'DAILY_FACTORY',
        status: 'FAILED',
        actorEmail,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedMs,
        ticketsGenerated: 0,
        codesCreated: 0,
        codeFailures: 0,
        ticketsChecked: 0,
        ticketsSettled: 0,
        message: errMsg,
      };
      automationStore.addLog(log);
      return { tickets: [], log, shortfallReason: errMsg };
    } finally {
      this.factoryLock = false;
    }
  }

  async retryFailedBookingCodes(
    ticketIds?: string[],
    actorEmail: string | null = null
  ): Promise<{
    retriedCount: number;
    codesCreated: number;
    codeFailures: number;
    tickets: GeneratedTicket[];
    log: AutomationJobLog;
  }> {
    const startedMs = Date.now();
    const startedAt = new Date(startedMs).toISOString();
    const all = automationStore.getTickets();
    const targets = all.filter((t) => {
      if (ticketIds && ticketIds.length > 0 && !ticketIds.includes(t.internalTicketId)) {
        return false;
      }
      return (
        t.status === 'PENDING' &&
        (!t.shareCode || t.bookingCodeStatus === 'FAILED' || t.bookingCodeStatus === 'NOT_REQUESTED')
      );
    });

    let codesCreated = 0;
    let codeFailures = 0;
    const usedShareCodes = automationStore.getExistingShareCodes();

    for (const ticket of targets) {
      const ticketBookmaker = normalizeBookmakerId(ticket.bookmakerId);
      const client = getBookmakerClient(ticketBookmaker);
      const bookmakerInfo = getBookmakerInfo(ticketBookmaker);

      try {
        const booking = await client.createBookingCode(ticket.selections);
        const cleanCode = String(booking.shareCode || '').trim().toUpperCase();
        if (!cleanCode || usedShareCodes.has(cleanCode)) {
          throw new Error(
            cleanCode
              ? `Duplicate booking code ${cleanCode} rejected to preserve unique card codes.`
              : `${bookmakerInfo.shortName} returned an empty booking code.`
          );
        }
        usedShareCodes.add(cleanCode);
        automationStore.updateTicketMutableFields({
          ...ticket,
          shareCode: booking.shareCode,
          shareUrl: booking.shareUrl,
          shareCodeDeadline: booking.deadline,
          shareCodeVerified: booking.verified,
          bookingCodeStatus: 'GENERATED',
          bookingCodeError: null,
          lastCheckedAt: new Date().toISOString(),
        });
        codesCreated++;
        await sleep(100);
      } catch (err) {
        codeFailures++;
        automationStore.updateTicketMutableFields({
          ...ticket,
          bookingCodeStatus: 'FAILED',
          bookingCodeError:
            err instanceof Error
              ? err.message
              : `${bookmakerInfo.shortName} booking code API failed`,
          lastCheckedAt: new Date().toISOString(),
        });
      }
    }

    const log: AutomationJobLog = {
      logId: `log_${crypto.randomBytes(4).toString('hex')}`,
      actionType: 'RETRY_CODES',
      jobType: 'ADMIN_ACTION',
      status: codeFailures > 0 && codesCreated === 0 ? 'FAILED' : codeFailures > 0 ? 'PARTIAL' : 'SUCCESS',
      actorEmail,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      ticketsGenerated: 0,
      codesCreated,
      codeFailures,
      ticketsChecked: targets.length,
      ticketsSettled: 0,
      message: `Retried ${targets.length} ticket(s): ${codesCreated} genuine booking code(s) created, ${codeFailures} failed.`,
    };
    automationStore.addLog(log);

    return {
      retriedCount: targets.length,
      codesCreated,
      codeFailures,
      tickets: automationStore.getTickets(),
      log,
    };
  }

  async runResultsTrackingJob(
    manualTrigger = true,
    ticketIds?: string[],
    actorEmail: string | null = null
  ): Promise<{ updatedTickets: GeneratedTicket[]; log: AutomationJobLog }> {
    const startedMs = Date.now();
    const startedAt = new Date(startedMs).toISOString();

    if (this.resultsLock) {
      const skippedLog: AutomationJobLog = {
        logId: `log_${crypto.randomBytes(4).toString('hex')}`,
        actionType: 'RESULTS_CHECK',
        jobType: 'RESULTS_TRACKER',
        status: 'SKIPPED',
        actorEmail,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        ticketsGenerated: 0,
        codesCreated: 0,
        codeFailures: 0,
        ticketsChecked: 0,
        ticketsSettled: 0,
        message: 'Results tracker already running.',
      };
      return { updatedTickets: [], log: skippedLog };
    }

    this.resultsLock = true;
    try {
      const allTickets = automationStore.getTickets();
      const targetTickets = allTickets.filter((t) => {
        if (ticketIds && ticketIds.length > 0 && !ticketIds.includes(t.internalTicketId)) {
          return false;
        }
        return t.status !== 'WON' && t.status !== 'LOST' && t.status !== 'VOID';
      });

      if (targetTickets.length === 0) {
        const finishedAt = new Date().toISOString();
        automationStore.setResultsRunAt(finishedAt);
        const log: AutomationJobLog = {
          logId: `log_${crypto.randomBytes(4).toString('hex')}`,
          actionType: 'RESULTS_CHECK',
          jobType: 'RESULTS_TRACKER',
          status: manualTrigger ? 'SUCCESS' : 'SKIPPED',
          actorEmail,
          startedAt,
          finishedAt,
          durationMs: Date.now() - startedMs,
          ticketsGenerated: 0,
          codesCreated: 0,
          codeFailures: 0,
          ticketsChecked: 0,
          ticketsSettled: 0,
          message: 'No active pending or live tickets require settlement verification.',
        };
        if (manualTrigger) automationStore.addLog(log);
        return { updatedTickets: [], log };
      }

      // Group active tickets by originating bookmaker so matches are queried strictly against each ticket's own platform
      const ticketsByBookmaker = new Map<BookmakerId, GeneratedTicket[]>();
      for (const ticket of targetTickets) {
        const bk = normalizeBookmakerId(ticket.bookmakerId);
        const arr = ticketsByBookmaker.get(bk) || [];
        arr.push(ticket);
        ticketsByBookmaker.set(bk, arr);
      }

      const updatedTickets: GeneratedTicket[] = [];
      let settledCount = 0;
      let totalUniqueEvents = 0;

      for (const [bkId, bkTickets] of ticketsByBookmaker.entries()) {
        const client = getBookmakerClient(bkId);
        const bkEventIds = Array.from(
          new Set(bkTickets.flatMap((t) => t.selections.map((s) => s.eventId)))
        );
        totalUniqueEvents += bkEventIds.length;

        const matchLookup = new Map<string, NormalizedMatch | null>();

        try {
          const live = await client.getLiveMatches();
          for (const m of live) {
            matchLookup.set(m.eventId, m);
          }
        } catch {
          // Proceed with individual event probes
        }

        const remainingIds = bkEventIds.filter((id) => !matchLookup.has(id));
        for (let i = 0; i < remainingIds.length; i += 10) {
          const chunk = remainingIds.slice(i, i + 10);
          await Promise.all(
            chunk.map(async (eventId) => {
              try {
                const details = await client.getMatchDetails(eventId);
                matchLookup.set(eventId, details);
              } catch {
                matchLookup.set(eventId, null);
              }
            })
          );
        }

        for (const ticket of bkTickets) {
          const evaluated = evaluateTicketSettlement(ticket, matchLookup, Date.now());
          if (
            evaluated.status === 'WON' ||
            evaluated.status === 'LOST' ||
            evaluated.status === 'VOID'
          ) {
            settledCount++;
          }
          const saved = automationStore.updateTicketMutableFields(evaluated);
          if (saved) updatedTickets.push(saved);
        }
      }

      const uniqueEventIds = { length: totalUniqueEvents };

      const finishedAt = new Date().toISOString();
      automationStore.setResultsRunAt(finishedAt);

      const log: AutomationJobLog = {
        logId: `log_${crypto.randomBytes(4).toString('hex')}`,
        actionType: 'RESULTS_CHECK',
        jobType: 'RESULTS_TRACKER',
        status: 'SUCCESS',
        actorEmail,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedMs,
        ticketsGenerated: 0,
        codesCreated: 0,
        codeFailures: 0,
        ticketsChecked: updatedTickets.length,
        ticketsSettled: settledCount,
        message: `Checked ${updatedTickets.length} active ticket(s) across ${uniqueEventIds.length} event(s); settled ${settledCount}.`,
      };
      automationStore.addLog(log);
      return { updatedTickets, log };
    } catch (err) {
      const finishedAt = new Date().toISOString();
      const errMsg = err instanceof Error ? err.message : 'Results tracking failed';
      const log: AutomationJobLog = {
        logId: `log_${crypto.randomBytes(4).toString('hex')}`,
        actionType: 'RESULTS_CHECK',
        jobType: 'RESULTS_TRACKER',
        status: 'FAILED',
        actorEmail,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startedMs,
        ticketsGenerated: 0,
        codesCreated: 0,
        codeFailures: 0,
        ticketsChecked: 0,
        ticketsSettled: 0,
        message: errMsg,
      };
      automationStore.addLog(log);
      return { updatedTickets: [], log };
    } finally {
      this.resultsLock = false;
    }
  }
}

export const schedulerService = new SchedulerService();
