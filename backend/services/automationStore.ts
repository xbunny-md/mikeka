import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  AutomationJobLog,
  DailyFactoryConfig,
  GeneratedTicket,
} from '../../src/types/sportybet.ts';
import {
  DEFAULT_ALLOWED_DAILY_FEED_MARKETS,
  isTicketAllowedInDailyFeed,
  sanitizeDailyFactoryMarkets,
} from '../../src/utils/dailyFeedFilter.ts';
import { DEFAULT_ODDS_CATEGORIES, normalizeTeamKey } from './dailyFactoryEngine.ts';

interface PersistedState {
  schemaVersion: number;
  tickets: GeneratedTicket[];
  factoryConfig: DailyFactoryConfig;
  logs: AutomationJobLog[];
  lastFactoryRunAt: string | null;
  lastResultsRunAt: string | null;
  lastScanningAt: string | null;
  dailyShortfallReason: string | null;
}

export const DEFAULT_DAILY_FACTORY_CONFIG: DailyFactoryConfig = {
  enabled: true,
  paused: false,
  activeBookmaker: 'SPORTYBET_TZ',
  minIndividualOdds: 1.01,
  maxIndividualOdds: 1.25,
  dailyTicketTarget: 55,
  maxTickets: 100,
  minSelections: 2,
  maxSelections: 15,
  sportIds: ['sr:sport:1'],
  markets: [...DEFAULT_ALLOWED_DAILY_FEED_MARKETS],
  anyMarket: false,
  leagues: [],
  datePreset: 'TODAY',
  customStartDate: '',
  customEndDate: '',
  windowStartTime: '00:00',
  windowEndTime: '23:59',
  timezone: 'Africa/Dar_es_Salaam',
  oddsCategories: DEFAULT_ODDS_CATEGORIES,
  duplicatePrevention: true,
  autoCreateBookingCodes: true,
  scheduleIntervalMinutes: 60,
};

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'sportybet-odds-hunter')
  : path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'automation-state.json');

class AutomationStore {
  private state: PersistedState;

  constructor() {
    this.state = this.loadFromDisk();
  }

  private loadFromDisk(): PersistedState {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        if (parsed.schemaVersion === 2) {
          const mergedCfg: DailyFactoryConfig = {
            ...DEFAULT_DAILY_FACTORY_CONFIG,
            ...(parsed.factoryConfig || {}),
          };
          if (!Array.isArray(mergedCfg.oddsCategories) || mergedCfg.oddsCategories.length === 0) {
            mergedCfg.oddsCategories = DEFAULT_ODDS_CATEGORIES;
          }
          const sanitizedMarkets = sanitizeDailyFactoryMarkets(mergedCfg.markets || []);
          mergedCfg.markets =
            sanitizedMarkets.length > 0 ? sanitizedMarkets : [...DEFAULT_ALLOWED_DAILY_FEED_MARKETS];

          const rawTickets: GeneratedTicket[] = Array.isArray(parsed.tickets)
            ? parsed.tickets.map((t) => ({
                ...t,
                bookmakerId: t.bookmakerId || 'SPORTYBET_TZ',
                bookmakerName:
                  t.bookmakerName ||
                  (t.bookmakerId === 'BETPAWA_TZ' ? 'betPawa Tanzania' : 'SportyBet Tanzania'),
              }))
            : [];
          const tickets = rawTickets.filter((t) => isTicketAllowedInDailyFeed(t));
          const sanitizedState: PersistedState = {
            schemaVersion: 2,
            tickets,
            factoryConfig: mergedCfg,
            logs: Array.isArray(parsed.logs) ? parsed.logs.slice(0, 150) : [],
            lastFactoryRunAt: parsed.lastFactoryRunAt ?? null,
            lastResultsRunAt: parsed.lastResultsRunAt ?? null,
            lastScanningAt: parsed.lastScanningAt ?? parsed.lastFactoryRunAt ?? null,
            dailyShortfallReason: parsed.dailyShortfallReason ?? null,
          };
          if (tickets.length !== rawTickets.length) {
            try {
              fs.writeFileSync(STATE_FILE, JSON.stringify(sanitizedState, null, 2), 'utf-8');
            } catch {
              // Non-fatal
            }
          }
          return sanitizedState;
        }
      }
    } catch {
      // Fallback cleanly to default initial state if disk read fails
    }

    return {
      schemaVersion: 2,
      tickets: [],
      factoryConfig: { ...DEFAULT_DAILY_FACTORY_CONFIG },
      logs: [],
      lastFactoryRunAt: null,
      lastResultsRunAt: null,
      lastScanningAt: null,
      dailyShortfallReason: null,
    };
  }

  private flushToDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist automation state:', err);
    }
  }

  getTickets(): GeneratedTicket[] {
    return this.state.tickets.filter((t) => isTicketAllowedInDailyFeed(t));
  }

  getTicketById(internalTicketId: string): GeneratedTicket | undefined {
    const ticket = this.state.tickets.find((t) => t.internalTicketId === internalTicketId);
    if (!ticket || !isTicketAllowedInDailyFeed(ticket)) return undefined;
    return ticket;
  }

  getExistingSignatures(): Set<string> {
    return new Set(this.getTickets().map((t) => t.signature));
  }

  getExistingShareCodes(excludeTicketId?: string): Set<string> {
    const codes = new Set<string>();
    for (const t of this.state.tickets) {
      if (excludeTicketId && t.internalTicketId === excludeTicketId) continue;
      const code = String(t.shareCode || '').trim().toUpperCase();
      if (code) codes.add(code);
    }
    return codes;
  }

  getExistingEventAndTeamUsage(dateKey?: string): {
    eventIds: Set<string>;
    teamKeys: Set<string>;
  } {
    const eventIds = new Set<string>();
    const teamKeys = new Set<string>();
    for (const t of this.getTickets()) {
      if (dateKey && t.generatedDateKey !== dateKey) continue;
      for (const s of t.selections || []) {
        if (s.eventId) eventIds.add(s.eventId);
        if (s.homeTeam) teamKeys.add(normalizeTeamKey(s.homeTeam));
        if (s.awayTeam) teamKeys.add(normalizeTeamKey(s.awayTeam));
      }
    }
    return { eventIds, teamKeys };
  }

  addTickets(newTickets: GeneratedTicket[]): GeneratedTicket[] {
    const existingIds = new Set(this.state.tickets.map((t) => t.internalTicketId));
    const existingSigs = new Set(this.state.tickets.map((t) => t.signature));
    const existingCodes = this.getExistingShareCodes();
    const inserted: GeneratedTicket[] = [];
    for (const t of newTickets) {
      if (!isTicketAllowedInDailyFeed(t)) continue;
      if (existingIds.has(t.internalTicketId) || existingSigs.has(t.signature)) continue;
      existingIds.add(t.internalTicketId);
      existingSigs.add(t.signature);
      const cleanCode = String(t.shareCode || '').trim().toUpperCase();
      if (cleanCode && existingCodes.has(cleanCode)) {
        inserted.push({
          ...t,
          shareCode: null,
          shareUrl: null,
          shareCodeDeadline: null,
          shareCodeVerified: false,
          bookingCodeStatus: 'FAILED',
          bookingCodeError: `Duplicate booking code ${cleanCode} rejected to preserve unique card codes.`,
        });
      } else {
        if (cleanCode) existingCodes.add(cleanCode);
        inserted.push(t);
      }
    }
    if (inserted.length > 0) {
      this.state.tickets = [...inserted, ...this.state.tickets].slice(0, 600);
      this.flushToDisk();
    }
    return inserted;
  }

  updateTicketMutableFields(updated: GeneratedTicket): GeneratedTicket | null {
    const idx = this.state.tickets.findIndex(
      (t) => t.internalTicketId === updated.internalTicketId
    );
    if (idx === -1) return null;

    const original = this.state.tickets[idx];
    const merged: GeneratedTicket = {
      ...original,
      status: updated.status,
      effectiveCombinedOdds: updated.effectiveCombinedOdds,
      selectionSettlements: updated.selectionSettlements,
      shareCode: updated.shareCode,
      shareUrl: updated.shareUrl,
      shareCodeDeadline: updated.shareCodeDeadline,
      shareCodeVerified: updated.shareCodeVerified,
      bookingCodeStatus: updated.bookingCodeStatus,
      bookingCodeError: updated.bookingCodeError,
      settledAt: updated.settledAt,
      lastCheckedAt: updated.lastCheckedAt,
    };

    this.state.tickets[idx] = merged;
    this.flushToDisk();
    return merged;
  }

  deleteTicket(internalTicketId: string): boolean {
    const before = this.state.tickets.length;
    this.state.tickets = this.state.tickets.filter(
      (t) => t.internalTicketId !== internalTicketId
    );
    if (this.state.tickets.length !== before) {
      this.flushToDisk();
      return true;
    }
    return false;
  }

  getFactoryConfig(): DailyFactoryConfig {
    return this.state.factoryConfig;
  }

  setFactoryConfig(config: DailyFactoryConfig): DailyFactoryConfig {
    const sanitizedMarkets = sanitizeDailyFactoryMarkets(config.markets || []);
    this.state.factoryConfig = {
      ...config,
      markets:
        sanitizedMarkets.length > 0 ? sanitizedMarkets : [...DEFAULT_ALLOWED_DAILY_FEED_MARKETS],
    };
    this.flushToDisk();
    return this.state.factoryConfig;
  }

  getLogs(): AutomationJobLog[] {
    return this.state.logs;
  }

  addLog(log: AutomationJobLog): void {
    this.state.logs = [log, ...this.state.logs].slice(0, 150);
    this.flushToDisk();
  }

  getTimestamps() {
    return {
      lastFactoryRunAt: this.state.lastFactoryRunAt,
      lastResultsRunAt: this.state.lastResultsRunAt,
      lastScanningAt: this.state.lastScanningAt,
      dailyShortfallReason: this.state.dailyShortfallReason,
    };
  }

  setScanningAt(scanAt: string): void {
    this.state.lastScanningAt = scanAt;
    this.flushToDisk();
  }

  setFactoryRunMeta(runAt: string, shortfallReason: string | null): void {
    this.state.lastFactoryRunAt = runAt;
    this.state.lastScanningAt = runAt;
    this.state.dailyShortfallReason = shortfallReason;
    this.flushToDisk();
  }

  setResultsRunAt(runAt: string): void {
    this.state.lastResultsRunAt = runAt;
    this.flushToDisk();
  }
}

export const automationStore = new AutomationStore();
