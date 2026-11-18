import { Download, Play, Plus, RotateCcw, Check } from 'lucide-react';
import { StatusLabel } from '../components/StatusLabel.tsx';
import { selectionFromQualifying, useOddsHunter } from '../hooks/useOddsHunter.tsx';
import {
  downloadCsvFile,
  downloadJsonFile,
  formatKickoffDate,
  formatKickoffTime,
  formatOdds,
} from '../utils/formatters.ts';

export function OddsScannerPage() {
  const {
    activeBookmaker,
    activeBookmakerInfo,
    markets,
    scannerConfig,
    setScannerConfig,
    resetScannerConfig,
    scanResult,
    scanning,
    scanError,
    executeScan,
    betslip,
    addToBetslip,
    removeFromBetslip,
    openMatchDetail,
    autoRescanSec,
    setAutoRescanSec,
  } = useOddsHunter();

  const toggleMarket = (id: string) => {
    setScannerConfig((prev) => {
      const exists = prev.markets.includes(id);
      const next = exists ? prev.markets.filter((m) => m !== id) : [...prev.markets, id];
      return { ...prev, markets: next.length > 0 ? next : [id] };
    });
  };

  const exportPrefix = activeBookmaker.toLowerCase();

  const handleExportCsv = () => {
    if (!scanResult || scanResult.results.length === 0) return;
    downloadCsvFile(
      `${exportPrefix}-scan-${new Date().toISOString().slice(0, 10)}.csv`,
      scanResult.results.map((r) => ({
        Event: `${r.homeTeam} vs ${r.awayTeam}`,
        League: r.leagueName,
        Country: r.country,
        Kickoff: r.kickoffIso,
        Market: r.marketName,
        Specifier: r.specifier,
        Selection: r.outcomeDesc,
        DecimalOdds: r.odds,
        Status: r.matchStatus,
        Source: r.dataSource,
        RetrievedAt: r.retrievedAt,
      }))
    );
  };

  const handleExportJson = () => {
    if (!scanResult) return;
    downloadJsonFile(`${exportPrefix}-scan-${new Date().toISOString().slice(0, 10)}.json`, scanResult);
  };

  return (
    <div className="space-y-6">
      {/* Scanner Control Panel */}
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-5 space-y-5 shadow-xs dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Automated Odds Scanner
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Scans real {activeBookmakerInfo.name} fixtures and returns deduplicated selections
              within your exact decimal odds range.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetScannerConfig}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              disabled={scanning}
              onClick={() => void executeScan()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-semibold text-white"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{scanning ? 'Scanning...' : `Scan ${activeBookmakerInfo.shortName}`}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <label className="space-y-1.5 text-xs">
            <span className="text-slate-600 dark:text-slate-400 block">Min Decimal Odds</span>
            <input
              type="number"
              step="0.01"
              min="1.01"
              value={scannerConfig.minOdds}
              onChange={(e) =>
                setScannerConfig((p) => ({ ...p, minOdds: Number(e.target.value) || 1.01 }))
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:border-blue-500"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="text-slate-600 dark:text-slate-400 block">Max Decimal Odds</span>
            <input
              type="number"
              step="0.01"
              min="1.01"
              value={scannerConfig.maxOdds}
              onChange={(e) =>
                setScannerConfig((p) => ({ ...p, maxOdds: Number(e.target.value) || 1.5 }))
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono tabular-nums focus:outline-none focus:border-blue-500"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="text-slate-600 dark:text-slate-400 block">Start Date</span>
            <input
              type="date"
              value={scannerConfig.startDate}
              onChange={(e) => setScannerConfig((p) => ({ ...p, startDate: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-blue-500"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="text-slate-600 dark:text-slate-400 block">End Date</span>
            <input
              type="date"
              value={scannerConfig.endDate}
              onChange={(e) => setScannerConfig((p) => ({ ...p, endDate: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-blue-500"
            />
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="text-slate-600 dark:text-slate-400 block">Match Status</span>
            <select
              value={scannerConfig.matchStatus}
              onChange={(e) =>
                setScannerConfig((p) => ({
                  ...p,
                  matchStatus: e.target.value as 'ALL' | 'UPCOMING' | 'LIVE',
                }))
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">All (Live & Upcoming)</option>
              <option value="UPCOMING">Upcoming Only</option>
              <option value="LIVE">Live In-Play Only</option>
            </select>
          </label>

          <label className="space-y-1.5 text-xs">
            <span className="text-slate-600 dark:text-slate-400 block">Auto-Rescan</span>
            <select
              value={autoRescanSec}
              onChange={(e) => setAutoRescanSec(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            >
              <option value={0}>Manual Only</option>
              <option value={30}>Every 30 seconds</option>
              <option value={60}>Every 60 seconds</option>
              <option value={180}>Every 3 minutes</option>
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <span className="text-xs text-slate-600 dark:text-slate-400 block">
            Target Betting Markets ({activeBookmakerInfo.shortName})
          </span>
          <div className="flex flex-wrap gap-2">
            {markets.map((m) => {
              const active = scannerConfig.markets.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMarket(m.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-600/20 dark:border-blue-500/50 dark:text-blue-300'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-[#0B101B] dark:border-white/10 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {scanError && (
        <div className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 text-sm dark:text-red-300">
          {scanError}
        </div>
      )}

      {/* Results Table */}
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-hidden shadow-xs dark:shadow-none">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              Scan Results
            </span>
            {scanResult && (
              <>
                <StatusLabel status={scanResult.status} />
                <span className="font-mono tabular-nums">
                  {scanResult.qualifyingCount} qualifying from {scanResult.totalMatchesScanned}{' '}
                  matches
                </span>
                <span>·</span>
                <span className="font-mono">
                  Retrieved {formatKickoffTime(scanResult.scannedAt)}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={scannerConfig.sortBy || 'kickoff_asc'}
              onChange={(e) =>
                setScannerConfig((p) => ({
                  ...p,
                  sortBy: e.target.value as 'kickoff_asc' | 'odds_asc' | 'odds_desc',
                }))
              }
              className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-xs text-slate-800 dark:text-slate-200"
            >
              <option value="kickoff_asc">Sort: Kickoff Earliest</option>
              <option value="odds_asc">Sort: Odds Low to High</option>
              <option value="odds_desc">Sort: Odds High to Low</option>
            </select>
            <button
              type="button"
              disabled={!scanResult || scanResult.results.length === 0}
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              disabled={!scanResult}
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {!scanResult ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              No scan executed yet in this session.
            </p>
            <button
              type="button"
              onClick={() => void executeScan()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Run Initial Scan</span>
            </button>
          </div>
        ) : scanResult.results.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-600 dark:text-slate-400">
            Scanned {scanResult.totalMatchesScanned} matches, but zero active markets fell
            between {scannerConfig.minOdds.toFixed(2)} and {scannerConfig.maxOdds.toFixed(2)}.
            Broaden your odds range or date window and rescan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.08] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0B101B]/60">
                  <th className="py-3 px-4 font-medium">Match</th>
                  <th className="py-3 px-4 font-medium">League / Country</th>
                  <th className="py-3 px-4 font-medium">Kickoff</th>
                  <th className="py-3 px-4 font-medium">Market &amp; Selection</th>
                  <th className="py-3 px-4 font-medium text-right">Odds</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/[0.06] text-sm">
                {scanResult.results.map((item) => {
                  const inSlip = betslip.some((s) => s.selectionKey === item.selectionKey);
                  return (
                    <tr
                      key={item.selectionKey}
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => openMatchDetail(item.eventId)}
                          className="text-left font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {item.homeTeam} vs {item.awayTeam}
                        </button>
                        <div className="text-xs text-slate-500">
                          {item.isLive ? 'LIVE' : item.matchStatus} · {item.dataSource}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                        <div>{item.leagueName}</div>
                        <div className="text-slate-500">{item.country}</div>
                      </td>
                      <td className="py-3 px-4 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <div>{formatKickoffDate(item.estimateStartTime)}</div>
                        <div className="text-slate-500">
                          {formatKickoffTime(item.estimateStartTime)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="text-slate-800 dark:text-slate-200 font-medium">
                          {item.marketName}
                          {item.specifier ? ` (${item.specifier.replace(/^total=/, '')})` : ''}
                        </div>
                        <div className="text-blue-700 dark:text-blue-300">{item.outcomeDesc}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatOdds(item.odds)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (inSlip) {
                              removeFromBetslip(item.selectionKey);
                            } else {
                              addToBetslip(selectionFromQualifying(item));
                            }
                          }}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                            inSlip
                              ? 'bg-emerald-50 border border-emerald-300 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-300'
                              : 'bg-blue-600 hover:bg-blue-500 text-white'
                          }`}
                        >
                          {inSlip ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>In Slip</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
