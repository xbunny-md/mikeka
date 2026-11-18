import crypto from 'crypto';
import {
  BETPAWA_CONFIG,
  getBookmakerInfo,
  getBookmakerMarketCatalog,
  normalizeBookmakerId,
} from '../config/bookmakers.ts';
import { getBookmakerClient } from '../integrations/bookmakerRegistry.ts';
import type {
  NormalizedMatch,
  QualifyingSelection,
  ScannerConfig,
  ScanResult,
} from '../../src/types/sportybet.ts';

export function filterAndScanMatches(
  matches: NormalizedMatch[],
  config: ScannerConfig
): QualifyingSelection[] {
  const startMs = config.startDate ? Date.parse(config.startDate) : null;
  const endMs = config.endDate ? Date.parse(config.endDate) : null;
  const endOfDayMs =
    endMs !== null && Number.isFinite(endMs)
      ? config.endDate.length <= 10
        ? endMs + 24 * 60 * 60 * 1000 - 1
        : endMs
      : null;

  const leagueFilterSet = new Set(
    (config.leagues || []).map((l) => l.trim().toLowerCase()).filter(Boolean)
  );
  const marketFilterSet = new Set((config.markets || []).map((m) => m.trim()).filter(Boolean));
  const query = (config.searchQuery || '').trim().toLowerCase();

  const seenSelectionKeys = new Set<string>();
  const qualifying: QualifyingSelection[] = [];

  for (const match of matches) {
    if (!match || !match.eventId || !match.homeTeam || !match.awayTeam) continue;

    if (config.matchStatus === 'LIVE' && !match.isLive) continue;
    if (config.matchStatus === 'UPCOMING' && match.isLive) continue;

    if (startMs !== null && Number.isFinite(startMs) && match.estimateStartTime < startMs) {
      continue;
    }
    if (
      endOfDayMs !== null &&
      Number.isFinite(endOfDayMs) &&
      match.estimateStartTime > endOfDayMs
    ) {
      continue;
    }

    if (leagueFilterSet.size > 0) {
      const leagueIdLower = match.leagueId.toLowerCase();
      const leagueNameLower = match.leagueName.toLowerCase();
      const countryLower = match.country.toLowerCase();
      const matchedLeague =
        leagueFilterSet.has(leagueIdLower) ||
        leagueFilterSet.has(leagueNameLower) ||
        leagueFilterSet.has(`${countryLower} - ${leagueNameLower}`);
      if (!matchedLeague) continue;
    }

    if (query) {
      const haystack = `${match.homeTeam} ${match.awayTeam} ${match.leagueName} ${match.country}`.toLowerCase();
      if (!haystack.includes(query)) continue;
    }

    for (const market of match.markets || []) {
      if (market.status !== 0 || market.banned) continue;
      if (marketFilterSet.size > 0 && !marketFilterSet.has(market.marketId)) continue;

      for (const outcome of market.outcomes || []) {
        if (!outcome.isActive) continue;
        if (!Number.isFinite(outcome.odds) || outcome.odds <= 1.0) continue;
        if (outcome.odds < config.minOdds || outcome.odds > config.maxOdds) continue;

        const selectionKey = `${match.eventId}::${market.marketId}::${market.specifier || ''}::${outcome.outcomeId}`;
        if (seenSelectionKeys.has(selectionKey)) continue;
        seenSelectionKeys.add(selectionKey);

        qualifying.push({
          bookmakerId: match.bookmakerId || config.bookmakerId || 'SPORTYBET_TZ',
          bookmakerName: match.bookmakerName || getBookmakerInfo(normalizeBookmakerId(match.bookmakerId || config.bookmakerId)).name,
          selectionKey,
          eventId: match.eventId,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          leagueId: match.leagueId,
          leagueName: match.leagueName,
          country: match.country,
          estimateStartTime: match.estimateStartTime,
          kickoffIso: match.kickoffIso,
          matchStatus: match.matchStatus,
          isLive: match.isLive,
          marketId: market.marketId,
          marketName: market.desc || market.name,
          specifier: market.specifier || '',
          outcomeId: outcome.outcomeId,
          outcomeDesc: outcome.desc,
          odds: outcome.odds,
          probability: outcome.probability,
          dataSource: match.dataSource,
          retrievedAt: match.retrievedAt,
        });
      }
    }
  }

  const sortBy = config.sortBy || 'kickoff_asc';
  qualifying.sort((a, b) => {
    if (sortBy === 'odds_asc') {
      return a.odds - b.odds || a.estimateStartTime - b.estimateStartTime;
    }
    if (sortBy === 'odds_desc') {
      return b.odds - a.odds || a.estimateStartTime - b.estimateStartTime;
    }
    return a.estimateStartTime - b.estimateStartTime || a.odds - b.odds;
  });

  return qualifying.slice(0, Math.max(1, Math.min(config.maxResults || 100, 500)));
}

export async function runLiveOddsScan(config: ScannerConfig): Promise<ScanResult> {
  const bookmakerId = normalizeBookmakerId(config.bookmakerId);
  const bookmakerInfo = getBookmakerInfo(bookmakerId);
  const client = getBookmakerClient(bookmakerId);
  const validMarketIdsForBookmaker = new Set(
    getBookmakerMarketCatalog(bookmakerId).map((m) => m.id)
  );
  const filteredConfigMarkets = (config.markets || []).filter((id) =>
    validMarketIdsForBookmaker.has(id)
  );
  const effectiveConfig: ScannerConfig = {
    ...config,
    bookmakerId,
    markets:
      filteredConfigMarkets.length > 0
        ? filteredConfigMarkets
        : bookmakerId === 'BETPAWA_TZ'
          ? [...BETPAWA_CONFIG.defaultMarketIds]
          : ['1', '18', '10', '29', '11'],
  };

  const warnings: string[] = [];
  const collected: NormalizedMatch[] = [];
  const seenEventIds = new Set<string>();

  const marketIds = effectiveConfig.markets.join(',');

  if (effectiveConfig.matchStatus === 'ALL' || effectiveConfig.matchStatus === 'LIVE') {
    try {
      const live = await client.getLiveMatches();
      for (const m of live) {
        if (!seenEventIds.has(m.eventId)) {
          seenEventIds.add(m.eventId);
          collected.push(m);
        }
      }
    } catch (err) {
      warnings.push(
        `Live feed partial warning (${bookmakerInfo.shortName}): ${
          err instanceof Error ? err.message : 'unavailable'
        }`
      );
    }
  }

  if (effectiveConfig.matchStatus === 'ALL' || effectiveConfig.matchStatus === 'UPCOMING') {
    try {
      const upcoming = await client.getUpcomingMatches({
        pageNum: 1,
        pageSize: 100,
        maxPages: 4,
        marketIds,
      });
      for (const m of upcoming.matches) {
        if (!seenEventIds.has(m.eventId)) {
          seenEventIds.add(m.eventId);
          collected.push(m);
        }
      }
    } catch (err) {
      warnings.push(
        `Upcoming feed partial warning (${bookmakerInfo.shortName}): ${
          err instanceof Error ? err.message : 'unavailable'
        }`
      );
    }
  }

  const results = filterAndScanMatches(collected, effectiveConfig);
  const status: ScanResult['status'] =
    collected.length === 0 && warnings.length > 0
      ? 'FAILED'
      : warnings.length > 0
        ? 'PARTIAL'
        : 'COMPLETED';

  return {
    bookmakerId,
    bookmakerName: bookmakerInfo.name,
    scanId: crypto.randomUUID(),
    scannedAt: new Date().toISOString(),
    dataSource: `${bookmakerInfo.name} (${bookmakerInfo.apiBaseUrl})`,
    status,
    totalMatchesScanned: collected.length,
    qualifyingCount: results.length,
    results,
    appliedConfig: effectiveConfig,
    warnings,
  };
}
