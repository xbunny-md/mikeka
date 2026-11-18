import { normalizeBookmakerId } from '../config/bookmakers.ts';
import type {
  BetslipSelection,
  BookmakerId,
  BookingCodeResponse,
  DiagnosticCheck,
  LeagueDirectoryItem,
  NormalizedMatch,
} from '../../src/types/sportybet.ts';
import { betPawaClient } from './betpawaClient.ts';
import { sportyBetClient, SportyBetIntegrationError } from './sportybetClient.ts';

export interface BookmakerClientAdapter {
  getLeagueDirectory(): Promise<LeagueDirectoryItem[]>;
  getLiveMatches(): Promise<NormalizedMatch[]>;
  getUpcomingMatches(options?: {
    pageNum?: number;
    pageSize?: number;
    maxPages?: number;
    marketIds?: string;
    todayGames?: boolean;
    sportId?: string;
  }): Promise<{ matches: NormalizedMatch[]; totalAvailable: number }>;
  getMatchDetails(eventId: string): Promise<NormalizedMatch>;
  createBookingCode(selections: BetslipSelection[]): Promise<BookingCodeResponse>;
  verifyBookingCode(shareCode: string): Promise<BookingCodeResponse>;
  runDiagnostics(): Promise<DiagnosticCheck[]>;
}

export function getBookmakerClient(bookmakerId?: BookmakerId | string): BookmakerClientAdapter {
  const id = normalizeBookmakerId(bookmakerId);
  if (id === 'BETPAWA_TZ') {
    return betPawaClient;
  }
  return sportyBetClient;
}

export function assertSameBookmakerSelections(
  selections: Pick<BetslipSelection, 'bookmakerId' | 'homeTeam' | 'awayTeam'>[],
  targetBookmakerId: BookmakerId
): void {
  for (const sel of selections) {
    const selBookmaker = sel.bookmakerId ? normalizeBookmakerId(sel.bookmakerId) : targetBookmakerId;
    if (selBookmaker !== targetBookmakerId) {
      throw new SportyBetIntegrationError(
        `Platform isolation violation: selection "${sel.homeTeam} vs ${sel.awayTeam}" belongs to ${selBookmaker} and cannot be submitted to ${targetBookmakerId}.`,
        400
      );
    }
  }
}
