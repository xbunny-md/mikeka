import { Download, FolderOpen, Trash2 } from 'lucide-react';
import { ProtectedRouteGate } from '../components/ProtectedRouteGate.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import { deleteScanHistoryRecord } from '../firebase/firestore/repository.ts';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import type { BookmakerId } from '../types/sportybet.ts';
import { downloadJsonFile, formatDateTimeCompact } from '../utils/formatters.ts';

export function ScanHistoryPage() {
  const { user, scanHistory } = useFirebase();
  const { setScanResult, setScannerConfig, setActiveSection } = useOddsHunter();

  const handleReopen = (item: (typeof scanHistory)[number]) => {
    const detectedBookmaker: BookmakerId =
      item.resultsPreview?.[0]?.bookmakerId ||
      (item.dataSource.toLowerCase().includes('betpawa') ? 'BETPAWA_TZ' : 'SPORTYBET_TZ');
    const appliedConfig = {
      bookmakerId: detectedBookmaker,
      minOdds: item.minOdds,
      maxOdds: item.maxOdds,
      startDate: item.startDate,
      endDate: item.endDate,
      sportId: 'sr:sport:1',
      leagues: item.leagues,
      matchStatus: item.matchStatus,
      markets: item.markets,
      maxResults: 100,
    };
    setScannerConfig(appliedConfig);
    setScanResult({
      bookmakerId: detectedBookmaker,
      bookmakerName:
        detectedBookmaker === 'BETPAWA_TZ' ? 'betPawa Tanzania' : 'SportyBet Tanzania',
      scanId: item.id,
      scannedAt:
        typeof item.createdAt === 'string'
          ? item.createdAt
          : item.createdAt && typeof item.createdAt.toDate === 'function'
            ? item.createdAt.toDate().toISOString()
            : new Date().toISOString(),
      dataSource: item.dataSource,
      status: item.status,
      totalMatchesScanned: item.totalMatchesScanned,
      qualifyingCount: item.qualifyingCount,
      results: item.resultsPreview,
      appliedConfig,
      warnings: [],
    });
    setActiveSection('scanner');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Scan History</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Archived odds scanner runs persisted per account in Firestore.
          </p>
        </div>

        {user && user.emailVerified && scanHistory.length > 0 && (
          <button
            type="button"
            onClick={() =>
              downloadJsonFile(
                `odds-hunter-scan-history-${new Date().toISOString().slice(0, 10)}.json`,
                scanHistory
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export History</span>
          </button>
        )}
      </div>

      <ProtectedRouteGate
        requireVerifiedEmail
        title="Sign In to View Personal Scan History"
        description="Sign in or create an account to automatically record, reopen, and export your odds scanner runs across devices."
      >
        {scanHistory.length === 0 ? (
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-10 text-center space-y-3 shadow-xs dark:shadow-none">
            <p className="text-sm text-slate-700 dark:text-slate-300">No scan history saved yet.</p>
            <button
              type="button"
              onClick={() => setActiveSection('scanner')}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
            >
              Run First Odds Scan
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {scanHistory.map((item) => {
              const ts =
                typeof item.createdAt === 'string'
                  ? item.createdAt
                  : item.createdAt && typeof item.createdAt.toDate === 'function'
                    ? item.createdAt.toDate().toISOString()
                    : new Date().toISOString();

              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs dark:shadow-none"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusLabel status={item.status} />
                      <span className="text-sm font-medium text-slate-900 dark:text-white font-mono tabular-nums">
                        Odds {item.minOdds.toFixed(2)}–{item.maxOdds.toFixed(2)}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {formatDateTimeCompact(ts)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Scanned {item.totalMatchesScanned} matches · Found {item.qualifyingCount}{' '}
                      qualifying selections · {item.dataSource}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleReopen(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-600/20 dark:border-blue-500/40 dark:text-blue-300 dark:hover:bg-blue-600/30 whitespace-nowrap"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Reopen</span>
                    </button>
                    {user && (
                      <button
                        type="button"
                        onClick={() => void deleteScanHistoryRecord(user.uid, item.id)}
                        className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete history entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ProtectedRouteGate>
    </div>
  );
}
