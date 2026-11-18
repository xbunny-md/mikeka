import type {
  BetslipSelection,
  BetslipValidationItem,
  BetslipValidationResponse,
  NormalizedMatch,
} from '../../src/types/sportybet.ts';

export function calculateCombinedOdds(selections: Pick<BetslipSelection, 'odds'>[]): number {
  if (selections.length === 0) return 0;
  const product = selections.reduce((acc, s) => {
    const val = Number(s.odds);
    return Number.isFinite(val) && val > 1 ? acc * val : acc;
  }, 1);
  return Number(product.toFixed(2));
}

export function calculateEstimatedReturn(
  combinedOdds: number,
  stakeTzs: number
): { estimatedReturnTzs: number; potentialProfitTzs: number } {
  if (!Number.isFinite(combinedOdds) || combinedOdds <= 0 || !Number.isFinite(stakeTzs) || stakeTzs <= 0) {
    return { estimatedReturnTzs: 0, potentialProfitTzs: 0 };
  }
  const estimatedReturnTzs = Number((combinedOdds * stakeTzs).toFixed(2));
  const potentialProfitTzs = Number(Math.max(0, estimatedReturnTzs - stakeTzs).toFixed(2));
  return { estimatedReturnTzs, potentialProfitTzs };
}

export function detectDuplicateSelections(selections: BetslipSelection[]): {
  duplicateKeys: Set<string>;
  duplicateEvents: Set<string>;
} {
  const keyCounts = new Map<string, number>();
  const eventCounts = new Map<string, number>();

  for (const s of selections) {
    keyCounts.set(s.selectionKey, (keyCounts.get(s.selectionKey) || 0) + 1);
    eventCounts.set(s.eventId, (eventCounts.get(s.eventId) || 0) + 1);
  }

  const duplicateKeys = new Set<string>();
  const duplicateEvents = new Set<string>();
  for (const [k, c] of keyCounts.entries()) {
    if (c > 1) duplicateKeys.add(k);
  }
  for (const [e, c] of eventCounts.entries()) {
    if (c > 1) duplicateEvents.add(e);
  }
  return { duplicateKeys, duplicateEvents };
}

export function validateBetslipAgainstMatches(
  selections: BetslipSelection[],
  liveMatchLookup: Map<string, NormalizedMatch | null>,
  nowMs = Date.now()
): BetslipValidationResponse {
  const { duplicateKeys, duplicateEvents } = detectDuplicateSelections(selections);
  const items: BetslipValidationItem[] = [];
  const globalWarnings: string[] = [];

  let hasDuplicates = duplicateKeys.size > 0 || duplicateEvents.size > 0;
  let hasSuspendedMarkets = false;
  let hasOddsChanges = false;
  let hasStartedMatches = false;
  let hasMissingSelections = false;

  const distinctBookmakers = new Set(
    selections.map((s) => s.bookmakerId).filter(Boolean)
  );
  if (distinctBookmakers.size > 1) {
    globalWarnings.push(
      'Betslip contains selections from different bookmakers. Keep SportyBet TZ and betPawa TZ selections strictly separated.'
    );
  }

  if (duplicateEvents.size > 0) {
    globalWarnings.push(
      'Multiple selections target the same match; standard accumulator slips require independent events.'
    );
  }

  for (const sel of selections) {
    const warnings: string[] = [];
    const match = liveMatchLookup.get(sel.eventId) ?? null;

    const duplicateEvent = duplicateEvents.has(sel.eventId);
    if (duplicateEvent) {
      warnings.push('Duplicate event in betslip.');
    }

    let currentOdds: number | null = sel.odds;
    let oddsChanged = false;
    let oddsDiff = 0;
    let marketSuspended = false;
    let matchStarted = sel.estimateStartTime > 0 && sel.estimateStartTime <= nowMs && !sel.isLive;
    let missingSelection = false;

    if (!match) {
      missingSelection = true;
      currentOdds = null;
      hasMissingSelections = true;
      warnings.push('Event no longer returned by active feed (settled, postponed, or removed).');
    } else {
      if (match.isLive && !sel.isLive) {
        matchStarted = true;
        hasStartedMatches = true;
        warnings.push('Match has kicked off and transitioned to live play.');
      }

      const market = match.markets.find(
        (m) => m.marketId === sel.marketId && (m.specifier || '') === (sel.specifier || '')
      );
      const outcome =
        market?.outcomes.find((o) => o.outcomeId === sel.outcomeId) ||
        market?.outcomes.find(
          (o) => o.desc.trim().toLowerCase() === (sel.outcomeDesc || '').trim().toLowerCase()
        );

      if (!market || !outcome) {
        missingSelection = true;
        currentOdds = null;
        hasMissingSelections = true;
        warnings.push('Selected market or outcome is no longer offered.');
      } else if (market.status !== 0 || market.banned || !outcome.isActive) {
        marketSuspended = true;
        currentOdds = outcome.odds;
        hasSuspendedMarkets = true;
        warnings.push('Market or outcome is currently suspended.');
      } else {
        currentOdds = outcome.odds;
        oddsDiff = Number((outcome.odds - sel.odds).toFixed(2));
        if (Math.abs(oddsDiff) >= 0.01) {
          oddsChanged = true;
          hasOddsChanges = true;
          warnings.push(
            `Odds shifted from ${sel.odds.toFixed(2)} to ${outcome.odds.toFixed(2)}.`
          );
        }
      }
    }

    const itemValid =
      !duplicateEvent && !marketSuspended && !missingSelection && !matchStarted;

    items.push({
      selectionKey: sel.selectionKey,
      eventId: sel.eventId,
      valid: itemValid,
      currentOdds,
      previousOdds: sel.odds,
      oddsChanged,
      oddsDiff,
      marketSuspended,
      matchStarted,
      duplicateEvent,
      missingSelection,
      warnings,
    });
  }

  const combinedOdds = calculateCombinedOdds(selections);
  const valid =
    selections.length > 0 &&
    !hasDuplicates &&
    !hasSuspendedMarkets &&
    !hasMissingSelections &&
    !hasStartedMatches;

  return {
    valid,
    combinedOdds,
    selectionCount: selections.length,
    hasDuplicates,
    hasSuspendedMarkets,
    hasOddsChanges,
    hasStartedMatches,
    hasMissingSelections,
    items,
    globalWarnings,
    checkedAt: new Date(nowMs).toISOString(),
  };
}
