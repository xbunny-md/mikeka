import type {
  GeneratedTicket,
  NormalizedMatch,
  PerformanceAnalyticsSummary,
  PerformanceBreakdownRow,
  SelectionSettlementRecord,
  SelectionSettlementStatus,
  TicketSelectionRecord,
  TicketStatus,
} from '../../src/types/sportybet.ts';

export interface ParsedScore {
  homeGoals: number;
  awayGoals: number;
}

export function parseScoreString(score: string | null | undefined): ParsedScore | null {
  if (!score) return null;
  const m = /(\d+)\s*[:\-]\s*(\d+)/.exec(String(score).trim());
  if (!m) return null;
  const homeGoals = Number(m[1]);
  const awayGoals = Number(m[2]);
  if (!Number.isInteger(homeGoals) || !Number.isInteger(awayGoals)) return null;
  if (homeGoals < 0 || awayGoals < 0) return null;
  return { homeGoals, awayGoals };
}

export function isMatchPostponedOrCancelled(matchStatus: string, statusCode: number): boolean {
  if (statusCode === 5 || statusCode === 6 || statusCode === 7) return true;
  return /\b(postponed|cancelled|canceled|abandoned|suspended|walkover|interrupted)\b/i.test(
    matchStatus || ''
  );
}

export function isMatchEnded(matchStatus: string, statusCode: number): boolean {
  if (statusCode === 3 || statusCode === 4) return true;
  return /\b(ended|ft|finished|full\s*time|aet|ap|closed)\b/i.test(matchStatus || '');
}

export function isMatchLiveStatus(
  match: Pick<NormalizedMatch, 'isLive' | 'matchStatus' | 'statusCode'>
): boolean {
  if (match.isLive || match.statusCode === 1) return true;
  return /\b(h1|h2|ht|live|1st\s*half|2nd\s*half|extra\s*time|halftime|break)\b/i.test(
    match.matchStatus || ''
  );
}

export function settleSingleSelectionOutcome(
  sel: Pick<
    TicketSelectionRecord,
    'marketId' | 'outcomeId' | 'outcomeDesc' | 'specifier'
  >,
  score: ParsedScore
): { status: SelectionSettlementStatus; reason: string } {
  const { homeGoals, awayGoals } = score;
  const totalGoals = homeGoals + awayGoals;
  const marketId = String(sel.marketId).trim();
  const outcomeId = String(sel.outcomeId).trim();
  const desc = (sel.outcomeDesc || '').trim().toLowerCase();
  const spec = (sel.specifier || '').trim().toLowerCase();

  // 1 / 3743: Match Winner (1X2)
  if (marketId === '1' || marketId === '3743') {
    if (outcomeId === '1' || desc === 'home' || desc === '1') {
      return {
        status: homeGoals > awayGoals ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (Home)`,
      };
    }
    if (outcomeId === '2' || desc === 'draw' || desc === 'x') {
      return {
        status: homeGoals === awayGoals ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (Draw)`,
      };
    }
    if (outcomeId === '3' || desc === 'away' || desc === '2') {
      return {
        status: awayGoals > homeGoals ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (Away)`,
      };
    }
  }

  // 10 / 4693: Double Chance
  if (marketId === '10' || marketId === '4693') {
    if (outcomeId === '9' || /\b1x\b|home.*draw/i.test(desc)) {
      return {
        status: homeGoals >= awayGoals ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (1X)`,
      };
    }
    if (outcomeId === '10' || /\b12\b|home.*away/i.test(desc)) {
      return {
        status: homeGoals !== awayGoals ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (12)`,
      };
    }
    if (outcomeId === '11' || /\bx2\b|draw.*away/i.test(desc)) {
      return {
        status: awayGoals >= homeGoals ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (X2)`,
      };
    }
  }

  // 18 / 5000: Total Goals Over/Under
  if (marketId === '18' || marketId === '5000') {
    const specMatch = /total=(\d+(?:\.\d+)?)/.exec(spec);
    const descMatch = /(over|under)\s*(\d+(?:\.\d+)?)/i.exec(desc);
    const line = specMatch ? Number(specMatch[1]) : descMatch ? Number(descMatch[2]) : NaN;
    const isOver = outcomeId === '12' || /\bover\b/i.test(desc);
    const isUnder = outcomeId === '13' || /\bunder\b/i.test(desc);

    if (Number.isFinite(line) && (isOver || isUnder)) {
      if (totalGoals === line) {
        return {
          status: 'VOID',
          reason: `FT ${homeGoals}:${awayGoals} (Total ${totalGoals} pushes line ${line})`,
        };
      }
      const won = isOver ? totalGoals > line : totalGoals < line;
      return {
        status: won ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (Total ${totalGoals} vs ${isOver ? 'Over' : 'Under'} ${line})`,
      };
    }
  }

  // 5006 / 5003: betPawa Team Total Goals Over/Under (Home / Away)
  if (marketId === '5006' || marketId === '5003') {
    const teamGoals = marketId === '5006' ? homeGoals : awayGoals;
    const specMatch = /total=(\d+(?:\.\d+)?)/.exec(spec);
    const descMatch = /(over|under)\s*(\d+(?:\.\d+)?)/i.exec(desc);
    const line = specMatch ? Number(specMatch[1]) : descMatch ? Number(descMatch[2]) : NaN;
    const isOver = /\bover\b/i.test(desc);
    const isUnder = /\bunder\b/i.test(desc);
    if (Number.isFinite(line) && (isOver || isUnder)) {
      if (teamGoals === line) {
        return { status: 'VOID', reason: `FT ${homeGoals}:${awayGoals} (Team total pushes ${line})` };
      }
      const won = isOver ? teamGoals > line : teamGoals < line;
      return {
        status: won ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (Team goals ${teamGoals} vs ${isOver ? 'Over' : 'Under'} ${line})`,
      };
    }
  }

  // 29 / 3795: Both Teams To Score (GG/NG)
  if (marketId === '29' || marketId === '3795') {
    const bothScored = homeGoals > 0 && awayGoals > 0;
    if (outcomeId === '74' || desc === 'yes' || desc === 'gg') {
      return {
        status: bothScored ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (BTTS Yes)`,
      };
    }
    if (outcomeId === '76' || desc === 'no' || desc === 'ng') {
      return {
        status: !bothScored ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (BTTS No)`,
      };
    }
  }

  // 11 / 4703: Draw No Bet
  if (marketId === '11' || marketId === '4703') {
    if (homeGoals === awayGoals) {
      return {
        status: 'VOID',
        reason: `FT ${homeGoals}:${awayGoals} (Draw No Bet voided on draw)`,
      };
    }
    if (outcomeId === '4' || /\bhome\b|\b1\b/i.test(desc)) {
      return {
        status: homeGoals > awayGoals ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (DNB Home)`,
      };
    }
    if (outcomeId === '5' || /\baway\b|\b2\b/i.test(desc)) {
      return {
        status: awayGoals > homeGoals ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (DNB Away)`,
      };
    }
  }

  // 26 / 4833: Odd / Even
  if (marketId === '26' || marketId === '4833') {
    const isOdd = totalGoals % 2 === 1;
    if (outcomeId === '70' || /\bodd\b/i.test(desc)) {
      return {
        status: isOdd ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (Total ${totalGoals} ${isOdd ? 'Odd' : 'Even'})`,
      };
    }
    if (outcomeId === '72' || /\beven\b/i.test(desc)) {
      return {
        status: !isOdd ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (Total ${totalGoals} ${isOdd ? 'Odd' : 'Even'})`,
      };
    }
  }

  // 16 / 3774: Asian Handicap (standard half / whole lines)
  if (marketId === '16' || marketId === '3774') {
    const hcpSpec = /hcp=([+-]?\d+(?:\.\d+)?)/.exec(spec);
    if (hcpSpec) {
      const hcp = Number(hcpSpec[1]);
      const isHome = outcomeId === '1714' || /\bhome\b|\b1\b/i.test(desc);
      const isAway = outcomeId === '1715' || /\baway\b|\b2\b/i.test(desc);
      if (isHome || isAway) {
        const diff = isHome ? homeGoals + hcp - awayGoals : awayGoals - hcp - homeGoals;
        if (Math.abs(diff) < 1e-9) {
          return {
            status: 'VOID',
            reason: `FT ${homeGoals}:${awayGoals} (Asian Handicap push)`,
          };
        }
        return {
          status: diff > 0 ? 'WON' : 'LOST',
          reason: `FT ${homeGoals}:${awayGoals} (AH ${hcp})`,
        };
      }
    }
  }

  // 14: European Handicap
  if (marketId === '14') {
    const hcpSpec = /hcp=(\d+)\s*:\s*(\d+)/.exec(spec);
    if (hcpSpec) {
      const adjHome = homeGoals + Number(hcpSpec[1]);
      const adjAway = awayGoals + Number(hcpSpec[2]);
      if (/\bhome\b|\b1\b/i.test(desc)) {
        return { status: adjHome > adjAway ? 'WON' : 'LOST', reason: `FT ${homeGoals}:${awayGoals} (EH)` };
      }
      if (/\bdraw\b|\bx\b/i.test(desc)) {
        return { status: adjHome === adjAway ? 'WON' : 'LOST', reason: `FT ${homeGoals}:${awayGoals} (EH)` };
      }
      if (/\baway\b|\b2\b/i.test(desc)) {
        return { status: adjAway > adjHome ? 'WON' : 'LOST', reason: `FT ${homeGoals}:${awayGoals} (EH)` };
      }
    }
  }

  // 36: Over/Under & GG/NG
  if (marketId === '36') {
    const specMatch = /total=(\d+(?:\.\d+)?)/.exec(spec);
    const line = specMatch ? Number(specMatch[1]) : NaN;
    const bothScored = homeGoals > 0 && awayGoals > 0;
    const isOver = /\bover\b/i.test(desc);
    const isUnder = /\bunder\b/i.test(desc);
    const wantYes = /\byes\b|\bgg\b/i.test(desc);
    const wantNo = /\bno\b|\bng\b/i.test(desc);

    if (Number.isFinite(line) && (isOver || isUnder) && (wantYes || wantNo)) {
      const ouOk = isOver ? totalGoals > line : totalGoals < line;
      const ggOk = wantYes ? bothScored : !bothScored;
      return {
        status: ouOk && ggOk ? 'WON' : 'LOST',
        reason: `FT ${homeGoals}:${awayGoals} (O/U ${line} & BTTS)`,
      };
    }
  }

  return {
    status: 'UNVERIFIED',
    reason: `Market ${marketId} (${sel.outcomeDesc}) requires manual official verification.`,
  };
}

export function evaluateTicketSettlement(
  ticket: GeneratedTicket,
  matchLookup: Map<string, NormalizedMatch | null>,
  nowMs = Date.now()
): GeneratedTicket {
  const checkedAt = new Date(nowMs).toISOString();

  // Do not overwrite terminal settled tickets (WON / LOST / VOID)
  if (ticket.status === 'WON' || ticket.status === 'LOST' || ticket.status === 'VOID') {
    return ticket;
  }

  const nextSettlements: SelectionSettlementRecord[] = ticket.selections.map((sel) => {
    const existingSel = ticket.selectionSettlements.find(
      (s) => s.selectionKey === sel.selectionKey
    );

    // Keep terminal selection status if already determined
    if (
      existingSel &&
      (existingSel.status === 'WON' ||
        existingSel.status === 'LOST' ||
        existingSel.status === 'VOID')
    ) {
      return existingSel;
    }

    const match = matchLookup.get(sel.eventId) ?? null;

    if (!match) {
      // Missing from feed: if still before kickoff + 3h, PENDING; otherwise UNVERIFIED (never LOST)
      const pastGrace = sel.estimateStartTime > 0 && nowMs > sel.estimateStartTime + 3 * 3600000;
      return {
        selectionKey: sel.selectionKey,
        eventId: sel.eventId,
        status: pastGrace ? 'UNVERIFIED' : 'PENDING',
        officialMatchStatus: existingSel?.officialMatchStatus || sel.matchStatus,
        score: existingSel?.score || null,
        playedSeconds: existingSel?.playedSeconds || null,
        currentOdds: existingSel?.currentOdds ?? sel.odds,
        oddsChanged: false,
        reason: pastGrace
          ? 'Official final score unavailable after match window — marked UNVERIFIED (never treated as loss).'
          : 'Awaiting kickoff / feed update',
        checkedAt,
      };
    }

    const liveOdds =
      match.markets
        .find((m) => m.marketId === sel.marketId && (m.specifier || '') === (sel.specifier || ''))
        ?.outcomes.find((o) => o.outcomeId === sel.outcomeId)?.odds ?? null;
    const oddsChanged = liveOdds !== null && Math.abs(liveOdds - sel.odds) >= 0.01;

    if (isMatchPostponedOrCancelled(match.matchStatus, match.statusCode)) {
      return {
        selectionKey: sel.selectionKey,
        eventId: sel.eventId,
        status: 'VOID',
        officialMatchStatus: match.matchStatus,
        score: match.score,
        playedSeconds: match.playedSeconds,
        currentOdds: liveOdds,
        oddsChanged,
        reason: `Match ${match.matchStatus} — leg voided at 1.00`,
        checkedAt,
      };
    }

    if (isMatchEnded(match.matchStatus, match.statusCode)) {
      const parsedScore = parseScoreString(match.score);
      if (!parsedScore) {
        return {
          selectionKey: sel.selectionKey,
          eventId: sel.eventId,
          status: 'UNVERIFIED',
          officialMatchStatus: match.matchStatus,
          score: match.score,
          playedSeconds: match.playedSeconds,
          currentOdds: liveOdds,
          oddsChanged,
          reason: 'Match ended without verifiable final score — marked UNVERIFIED.',
          checkedAt,
        };
      }
      const outcomeRes = settleSingleSelectionOutcome(sel, parsedScore);
      return {
        selectionKey: sel.selectionKey,
        eventId: sel.eventId,
        status: outcomeRes.status,
        officialMatchStatus: match.matchStatus,
        score: match.score,
        playedSeconds: match.playedSeconds,
        currentOdds: liveOdds,
        oddsChanged,
        reason: outcomeRes.reason,
        checkedAt,
      };
    }

    if (isMatchLiveStatus(match)) {
      return {
        selectionKey: sel.selectionKey,
        eventId: sel.eventId,
        status: 'LIVE',
        officialMatchStatus: match.matchStatus,
        score: match.score || '0:0',
        playedSeconds: match.playedSeconds,
        currentOdds: liveOdds,
        oddsChanged,
        reason: `In-Play (${match.matchStatus}${match.playedSeconds ? ` ${match.playedSeconds}'` : ''})`,
        checkedAt,
      };
    }

    return {
      selectionKey: sel.selectionKey,
      eventId: sel.eventId,
      status: 'PENDING',
      officialMatchStatus: match.matchStatus,
      score: match.score,
      playedSeconds: match.playedSeconds,
      currentOdds: liveOdds,
      oddsChanged,
      reason: 'Scheduled upcoming kickoff',
      checkedAt,
    };
  });

  // Compute accumulator-level status & effective combined odds
  const hasLost = nextSettlements.some((s) => s.status === 'LOST');
  const allVoid = nextSettlements.length > 0 && nextSettlements.every((s) => s.status === 'VOID');
  const allTerminal = nextSettlements.every(
    (s) => s.status === 'WON' || s.status === 'LOST' || s.status === 'VOID'
  );
  const hasWon = nextSettlements.some((s) => s.status === 'WON');
  const hasVoid = nextSettlements.some((s) => s.status === 'VOID');
  const hasUnverified = nextSettlements.some((s) => s.status === 'UNVERIFIED');
  const hasLive = nextSettlements.some((s) => s.status === 'LIVE');
  const hasPending = nextSettlements.some((s) => s.status === 'PENDING');

  // Recalculate effective combined odds (voided legs reduce multiplier to 1.00)
  let effectiveCombinedOdds = 1;
  for (let i = 0; i < ticket.selections.length; i++) {
    const leg = ticket.selections[i];
    const legSettlement = nextSettlements[i];
    if (legSettlement?.status === 'VOID') {
      effectiveCombinedOdds *= 1.0;
    } else {
      effectiveCombinedOdds *= leg.odds;
    }
  }
  effectiveCombinedOdds = Number(effectiveCombinedOdds.toFixed(2));

  let ticketStatus: TicketStatus = 'PENDING';
  let settledAt: string | null = null;

  if (hasLost) {
    ticketStatus = 'LOST';
    settledAt = checkedAt;
  } else if (allVoid) {
    ticketStatus = 'VOID';
    effectiveCombinedOdds = 1.0;
    settledAt = checkedAt;
  } else if (allTerminal && hasWon) {
    ticketStatus = 'WON';
    settledAt = checkedAt;
  } else if (hasUnverified) {
    ticketStatus = 'UNVERIFIED';
  } else if ((hasWon || hasVoid) && (hasPending || hasLive)) {
    ticketStatus = 'PARTIALLY_SETTLED';
  } else if (hasLive) {
    ticketStatus = 'LIVE';
  } else {
    ticketStatus = 'PENDING';
  }

  return {
    ...ticket,
    status: ticketStatus,
    effectiveCombinedOdds,
    selectionSettlements: nextSettlements,
    settledAt,
    lastCheckedAt: checkedAt,
  };
}

function makeBreakdownRows(
  groups: Map<string, GeneratedTicket[]>
): PerformanceBreakdownRow[] {
  const rows: PerformanceBreakdownRow[] = [];
  for (const [label, list] of groups.entries()) {
    const won = list.filter((t) => t.status === 'WON').length;
    const lost = list.filter((t) => t.status === 'LOST').length;
    const voided = list.filter((t) => t.status === 'VOID').length;
    const pending = list.filter(
      (t) =>
        t.status === 'PENDING' ||
        t.status === 'LIVE' ||
        t.status === 'PARTIALLY_SETTLED' ||
        t.status === 'UNVERIFIED'
    ).length;
    const settledNonVoid = won + lost;
    rows.push({
      label,
      total: list.length,
      won,
      lost,
      voided,
      pending,
      settledNonVoid,
      winRatePct: settledNonVoid > 0 ? Number(((won / settledNonVoid) * 100).toFixed(1)) : null,
    });
  }
  return rows.sort((a, b) => b.total - a.total);
}

export function computePerformanceAnalytics(
  tickets: GeneratedTicket[],
  meta?: {
    todayKey?: string;
    dailyTarget?: number;
    lastScanningAt?: string | null;
    lastSettlementAt?: string | null;
  }
): PerformanceAnalyticsSummary {
  const wonCount = tickets.filter((t) => t.status === 'WON').length;
  const lostCount = tickets.filter((t) => t.status === 'LOST').length;
  const voidCount = tickets.filter((t) => t.status === 'VOID').length;
  const partiallySettledCount = tickets.filter(
    (t) => t.status === 'PARTIALLY_SETTLED'
  ).length;
  const pendingOrLiveCount = tickets.filter(
    (t) => t.status === 'PENDING' || t.status === 'LIVE'
  ).length;
  const unverifiedCount = tickets.filter((t) => t.status === 'UNVERIFIED').length;
  const validSharingCodes = tickets.filter((t) => Boolean(t.shareCode && t.shareCodeVerified)).length;
  const failedBookingCodes = tickets.filter((t) => t.bookingCodeStatus === 'FAILED').length;
  const generatedToday = meta?.todayKey
    ? tickets.filter((t) => t.generatedDateKey === meta.todayKey).length
    : tickets.length;

  const totalSettled = wonCount + lostCount + voidCount;
  const settledNonVoidDenominator = wonCount + lostCount;
  const winRatePct =
    settledNonVoidDenominator > 0
      ? Number(((wonCount / settledNonVoidDenominator) * 100).toFixed(1))
      : null;

  const categoryGroups = new Map<string, GeneratedTicket[]>();
  const marketGroups = new Map<string, GeneratedTicket[]>();
  const leagueGroups = new Map<string, GeneratedTicket[]>();
  const dailyMap = new Map<
    string,
    { dateKey: string; generated: number; won: number; lost: number; voided: number }
  >();

  for (const t of tickets) {
    const catLabel = t.categoryLabel || 'Custom';
    categoryGroups.set(catLabel, [...(categoryGroups.get(catLabel) || []), t]);

    const seenMkts = new Set<string>();
    const seenLeagues = new Set<string>();
    for (const s of t.selections) {
      if (!seenMkts.has(s.marketName)) {
        seenMkts.add(s.marketName);
        marketGroups.set(s.marketName, [...(marketGroups.get(s.marketName) || []), t]);
      }
      if (!seenLeagues.has(s.leagueName)) {
        seenLeagues.add(s.leagueName);
        leagueGroups.set(s.leagueName, [...(leagueGroups.get(s.leagueName) || []), t]);
      }
    }

    const dayRow = dailyMap.get(t.generatedDateKey) || {
      dateKey: t.generatedDateKey,
      generated: 0,
      won: 0,
      lost: 0,
      voided: 0,
    };
    dayRow.generated += 1;
    if (t.status === 'WON') dayRow.won += 1;
    if (t.status === 'LOST') dayRow.lost += 1;
    if (t.status === 'VOID') dayRow.voided += 1;
    dailyMap.set(t.generatedDateKey, dayRow);
  }

  return {
    totalGenerated: tickets.length,
    generatedToday,
    dailyTarget: meta?.dailyTarget ?? 55,
    totalSettled,
    wonCount,
    lostCount,
    voidCount,
    partiallySettledCount,
    pendingOrLiveCount,
    unverifiedCount,
    validSharingCodes,
    failedBookingCodes,
    settledNonVoidDenominator,
    winRatePct,
    lastScanningAt: meta?.lastScanningAt ?? null,
    lastSettlementAt: meta?.lastSettlementAt ?? null,
    byCategory: makeBreakdownRows(categoryGroups),
    byMarket: makeBreakdownRows(marketGroups).slice(0, 12),
    byLeague: makeBreakdownRows(leagueGroups).slice(0, 12),
    dailyTrends: Array.from(dailyMap.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    ),
    performanceDisclaimer:
      'Metrics represent automatically generated candidate combinations and their verified bookmaker market settlements (Won / (Won + Lost)). Candidate tickets are distinct from actual wagers placed by users; hypothetical multipliers are never presented as real betting profits.',
  };
}
