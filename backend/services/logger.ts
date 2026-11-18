import crypto from 'crypto';
import type { BackendLogEntry } from '../../src/types/sportybet.ts';

class BackendLogger {
  private entries: BackendLogEntry[] = [];
  private readonly maxEntries = 200;

  log(entry: Omit<BackendLogEntry, 'id' | 'createdAt'>): BackendLogEntry {
    const full: BackendLogEntry = {
      id: `blog_${crypto.randomBytes(4).toString('hex')}`,
      ...entry,
      createdAt: new Date().toISOString(),
    };

    this.entries = [full, ...this.entries].slice(0, this.maxEntries);

    if (process.env.NODE_ENV !== 'test') {
      const line = JSON.stringify({
        ts: full.createdAt,
        level: full.level,
        category: full.category,
        event: full.event,
        message: full.message,
        actorEmail: full.actorEmail || undefined,
      });
      if (full.level === 'ERROR') {
        console.error(line);
      } else {
        console.log(line);
      }
    }

    return full;
  }

  info(
    category: BackendLogEntry['category'],
    event: string,
    message: string,
    extra?: Partial<Pick<BackendLogEntry, 'actorUid' | 'actorEmail' | 'metadata'>>
  ): BackendLogEntry {
    return this.log({ level: 'INFO', category, event, message, ...extra });
  }

  warn(
    category: BackendLogEntry['category'],
    event: string,
    message: string,
    extra?: Partial<Pick<BackendLogEntry, 'actorUid' | 'actorEmail' | 'metadata'>>
  ): BackendLogEntry {
    return this.log({ level: 'WARN', category, event, message, ...extra });
  }

  error(
    category: BackendLogEntry['category'],
    event: string,
    message: string,
    extra?: Partial<Pick<BackendLogEntry, 'actorUid' | 'actorEmail' | 'metadata'>>
  ): BackendLogEntry {
    return this.log({ level: 'ERROR', category, event, message, ...extra });
  }

  list(filter?: {
    level?: BackendLogEntry['level'];
    category?: BackendLogEntry['category'];
    limit?: number;
  }): BackendLogEntry[] {
    let items = this.entries;
    if (filter?.level) {
      items = items.filter((e) => e.level === filter.level);
    }
    if (filter?.category) {
      items = items.filter((e) => e.category === filter.category);
    }
    return items.slice(0, filter?.limit ?? 100);
  }
}

export const backendLogger = new BackendLogger();
