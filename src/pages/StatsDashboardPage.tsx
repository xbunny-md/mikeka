import { RefreshCw, ShieldAlert } from 'lucide-react';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import { formatDateTimeCompact } from '../utils/formatters.ts';

export function StatsDashboardPage() {
  const { analyticsSummary, schedulerStatus, refreshAnalytics, refreshScheduler } =
    useOddsHunter();

  const summary = analyticsSummary;

  const handleRefresh = () => {
    void refreshAnalytics();
    void refreshScheduler();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Daily Statistics Dashboard
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Real-time daily production totals, booking code verification counts, and verified
            settlement performance.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-[#111827] dark:hover:bg-[#1A2438] border dark:border-white/[0.08] text-xs font-medium dark:text-slate-200"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Statistics</span>
        </button>
      </div>

      {/* Primary KPI Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-4 shadow-xs dark:shadow-none">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            Generated Today / Target
          </span>
          <div className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {summary?.generatedToday ?? 0}
            <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
              {' '}
              / {summary?.dailyTarget ?? schedulerStatus?.dailyTicketTarget ?? 55}
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-4 shadow-xs dark:shadow-none">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            Genuine Booking Codes
          </span>
          <div className="mt-1 font-display text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {summary?.validSharingCodes ?? 0}
          </div>
          <span className="text-[11px] text-slate-500 tabular-nums">
            Code failures: {summary?.failedBookingCodes ?? 0}
          </span>
        </div>

        <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-4 shadow-xs dark:shadow-none">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            Settled Win Rate
          </span>
          <div className="mt-1 font-display text-2xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">
            {summary?.winRatePct !== null && summary?.winRatePct !== undefined
              ? `${summary.winRatePct.toFixed(1)}%`
              : '—'}
          </div>
          <span className="text-[11px] text-slate-500 tabular-nums">
            Denominator: {summary?.settledNonVoidDenominator ?? 0} non-void
          </span>
        </div>

        <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-4 shadow-xs dark:shadow-none">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            Total Published Archive
          </span>
          <div className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {summary?.totalGenerated ?? 0}
          </div>
          <span className="text-[11px] text-slate-500">Unique tickets stored</span>
        </div>
      </section>

      {/* Secondary Status Breakdown + Timestamps */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div className="rounded-lg bg-white dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.07] p-3">
          <span className="text-slate-500 block">Pending / Live</span>
          <span className="font-mono text-base font-bold text-blue-700 dark:text-blue-300 tabular-nums">
            {summary?.pendingOrLiveCount ?? 0}
          </span>
        </div>
        <div className="rounded-lg bg-white dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.07] p-3">
          <span className="text-slate-500 block">Won Tickets</span>
          <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {summary?.wonCount ?? 0}
          </span>
        </div>
        <div className="rounded-lg bg-white dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.07] p-3">
          <span className="text-slate-500 block">Lost Tickets</span>
          <span className="font-mono text-base font-bold text-rose-700 dark:text-rose-300 tabular-nums">
            {summary?.lostCount ?? 0}
          </span>
        </div>
        <div className="rounded-lg bg-white dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.07] p-3">
          <span className="text-slate-500 block">Void Tickets</span>
          <span className="font-mono text-base font-bold text-slate-700 dark:text-slate-300 tabular-nums">
            {summary?.voidCount ?? 0}
          </span>
        </div>
        <div className="rounded-lg bg-white dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.07] p-3">
          <span className="text-slate-500 block">Last Scanning</span>
          <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 mt-0.5 block truncate">
            {summary?.lastScanningAt ? formatDateTimeCompact(summary.lastScanningAt) : '—'}
          </span>
        </div>
        <div className="rounded-lg bg-white dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.07] p-3">
          <span className="text-slate-500 block">Last Settlement</span>
          <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 mt-0.5 block truncate">
            {summary?.lastSettlementAt ? formatDateTimeCompact(summary.lastSettlementAt) : '—'}
          </span>
        </div>
      </section>

      {/* Daily Trend Bar Chart (SVG) */}
      {summary && summary.dailyTrends.length > 0 && (
        <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-5 space-y-4 shadow-xs dark:shadow-none">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Historical Daily Ticket Production &amp; Settlement
            </h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Last {summary.dailyTrends.length} active days
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[420px] flex items-end gap-3 h-40 pt-4">
              {(() => {
                const maxVal = Math.max(
                  1,
                  ...summary.dailyTrends.map((d) => d.generated)
                );
                return summary.dailyTrends.map((d) => {
                  const totalH = Math.max(8, Math.round((d.generated / maxVal) * 110));
                  const wonH =
                    d.generated > 0 ? Math.round((d.won / maxVal) * 110) : 0;
                  return (
                    <div
                      key={d.dateKey}
                      className="flex-1 flex flex-col items-center justify-end gap-1.5"
                    >
                      <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300 tabular-nums">
                        {d.generated}
                      </span>
                      <div
                        className="w-full max-w-[38px] rounded-t-md bg-blue-500/20 border border-blue-500/40 relative overflow-hidden"
                        style={{ height: `${totalH}px` }}
                        title={`${d.dateKey}: ${d.generated} generated (${d.won} won, ${d.lost} lost)`}
                      >
                        {wonH > 0 && (
                          <div
                            className="absolute bottom-0 inset-x-0 bg-emerald-500/80 dark:bg-emerald-400/70"
                            style={{ height: `${wonH}px` }}
                          />
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                        {d.dateKey.slice(5)}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </section>
      )}

      {/* Breakdown by Odds Category, Market, League */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(
          [
            { title: 'Performance by Odds Category', rows: summary?.byCategory || [] },
            { title: 'Top Markets Performance', rows: summary?.byMarket || [] },
            { title: 'Top Leagues Performance', rows: summary?.byLeague || [] },
          ] as const
        ).map((block) => (
          <div
            key={block.title}
            className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] overflow-hidden shadow-xs dark:shadow-none"
          >
            <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.07]">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {block.title}
              </h3>
            </div>
            {block.rows.length === 0 ? (
              <div className="p-6 text-xs text-slate-500 text-center">No data recorded yet.</div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#0B101B] text-[10px] uppercase text-slate-500">
                    <th className="py-2 px-3">Segment</th>
                    <th className="py-2 px-3 text-right">Total</th>
                    <th className="py-2 px-3 text-right">Won</th>
                    <th className="py-2 px-3 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                  {block.rows.slice(0, 8).map((row) => (
                    <tr key={row.label}>
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                        {row.label}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {row.total}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                        {row.won}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-blue-700 dark:text-blue-300">
                        {row.winRatePct !== null ? `${row.winRatePct.toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </section>

      {/* Honest Analytics Disclosure */}
      <div className="rounded-xl bg-slate-100 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.08] p-4 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-400">
        <ShieldAlert className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
        <span>
          {summary?.performanceDisclaimer ||
            'Generated tickets are analytical combinations built from live Tanzania bookmaker market feeds — not placed cash wagers. Win rates evaluate settled non-void outcomes strictly against official final match results.'}
        </span>
      </div>
    </div>
  );
}
