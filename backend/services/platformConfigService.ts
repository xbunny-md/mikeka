import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  BookmakerId,
  CanonicalMarketId,
  ManagedUserAccessRecord,
  PlatformSettings,
  TransferHistoryEntry,
} from '../../src/types/sportybet.ts';

export const ALL_CANONICAL_TRANSFER_MARKETS: CanonicalMarketId[] = [
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
];

interface PersistedPlatformState {
  settings: PlatformSettings;
  transferHistory: TransferHistoryEntry[];
  userAccess: Record<string, ManagedUserAccessRecord>;
}

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'sportybet-odds-hunter')
  : path.resolve(process.cwd(), '.data');
const PLATFORM_FILE = path.join(DATA_DIR, 'platform-state.json');

const DEFAULT_SETTINGS: PlatformSettings = {
  sportybetEnabled: true,
  betpawaEnabled: true,
  crossTransferEnabled: true,
  supportedTransferMarkets: [...ALL_CANONICAL_TRANSFER_MARKETS],
  updatedAt: new Date().toISOString(),
  updatedByEmail: null,
};

class PlatformConfigService {
  private state: PersistedPlatformState;

  constructor() {
    this.state = this.load();
  }

  private load(): PersistedPlatformState {
    try {
      if (fs.existsSync(PLATFORM_FILE)) {
        const raw = fs.readFileSync(PLATFORM_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedPlatformState>;
        return {
          settings: {
            ...DEFAULT_SETTINGS,
            ...(parsed.settings || {}),
            supportedTransferMarkets:
              Array.isArray(parsed.settings?.supportedTransferMarkets) &&
              parsed.settings.supportedTransferMarkets.length > 0
                ? parsed.settings.supportedTransferMarkets
                : [...ALL_CANONICAL_TRANSFER_MARKETS],
          },
          transferHistory: Array.isArray(parsed.transferHistory)
            ? parsed.transferHistory.slice(0, 200)
            : [],
          userAccess:
            parsed.userAccess && typeof parsed.userAccess === 'object' ? parsed.userAccess : {},
        };
      }
    } catch {
      // Fallback cleanly to defaults
    }

    return {
      settings: { ...DEFAULT_SETTINGS },
      transferHistory: [],
      userAccess: {},
    };
  }

  private flush(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(PLATFORM_FILE, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // Non-fatal in read-only edge cases
    }
  }

  getSettings(): PlatformSettings {
    return { ...this.state.settings };
  }

  updateSettings(
    partial: Partial<Omit<PlatformSettings, 'updatedAt'>>,
    actorEmail: string | null
  ): PlatformSettings {
    this.state.settings = {
      ...this.state.settings,
      ...partial,
      supportedTransferMarkets:
        Array.isArray(partial.supportedTransferMarkets) &&
        partial.supportedTransferMarkets.length > 0
          ? partial.supportedTransferMarkets
          : this.state.settings.supportedTransferMarkets,
      updatedAt: new Date().toISOString(),
      updatedByEmail: actorEmail,
    };
    this.flush();
    return this.getSettings();
  }

  isBookmakerEnabled(bookmakerId: BookmakerId): boolean {
    if (bookmakerId === 'BETPAWA_TZ') {
      return this.state.settings.betpawaEnabled;
    }
    return this.state.settings.sportybetEnabled;
  }

  isCrossTransferEnabled(): boolean {
    return (
      this.state.settings.crossTransferEnabled &&
      this.state.settings.sportybetEnabled &&
      this.state.settings.betpawaEnabled
    );
  }

  recordTransfer(entry: TransferHistoryEntry): void {
    const filtered = this.state.transferHistory.filter(
      (t) => t.transferId !== entry.transferId
    );
    this.state.transferHistory = [entry, ...filtered].slice(0, 200);
    this.flush();
  }

  getTransferHistory(options?: { status?: string; limit?: number }): TransferHistoryEntry[] {
    let items = this.state.transferHistory;
    if (options?.status && options.status !== 'ALL') {
      items = items.filter((t) => t.status === options.status);
    }
    return items.slice(0, options?.limit ?? 100);
  }

  upsertSeenUser(user: {
    uid: string;
    email: string;
    displayName?: string | null;
    emailVerified?: boolean;
    defaultAdmin?: boolean;
  }): ManagedUserAccessRecord {
    const existing = this.state.userAccess[user.uid];
    const next: ManagedUserAccessRecord = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || existing?.displayName || user.email.split('@')[0] || 'User',
      role: existing?.role || (user.defaultAdmin ? 'ADMIN' : 'USER'),
      disabled: existing?.disabled ?? false,
      emailVerified: Boolean(user.emailVerified),
      lastSeenAt: new Date().toISOString(),
      updatedByEmail: existing?.updatedByEmail || null,
    };
    this.state.userAccess[user.uid] = next;
    this.flush();
    return next;
  }

  getUserAccess(uid: string): ManagedUserAccessRecord | null {
    return this.state.userAccess[uid] || null;
  }

  isUserAdminByAccessRecord(uid: string): boolean {
    const rec = this.state.userAccess[uid];
    return Boolean(rec && rec.role === 'ADMIN' && !rec.disabled);
  }

  isUserDisabled(uid: string): boolean {
    return Boolean(this.state.userAccess[uid]?.disabled);
  }

  updateUserAccess(
    uid: string,
    updates: { role?: 'USER' | 'ADMIN'; disabled?: boolean; email?: string; displayName?: string },
    actorEmail: string | null
  ): ManagedUserAccessRecord {
    const existing = this.state.userAccess[uid];
    const next: ManagedUserAccessRecord = {
      uid,
      email: updates.email || existing?.email || `${uid}@unknown.local`,
      displayName: updates.displayName || existing?.displayName || 'User',
      role: updates.role ?? existing?.role ?? 'USER',
      disabled: updates.disabled ?? existing?.disabled ?? false,
      emailVerified: existing?.emailVerified ?? true,
      lastSeenAt: existing?.lastSeenAt || new Date().toISOString(),
      updatedByEmail: actorEmail,
    };
    this.state.userAccess[uid] = next;
    this.flush();
    return next;
  }

  listUsers(): ManagedUserAccessRecord[] {
    return Object.values(this.state.userAccess).sort((a, b) =>
      b.lastSeenAt.localeCompare(a.lastSeenAt)
    );
  }
}

export const platformConfigService = new PlatformConfigService();
