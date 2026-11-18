import { RefreshCw } from 'lucide-react';
import { StatusLabel } from '../components/StatusLabel.tsx';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import type { DiagnosticStatus } from '../types/sportybet.ts';
import { formatDateTimeCompact } from '../utils/formatters.ts';

export function DiagnosticsPage() {
  const {
    user,
    authReady,
    firestoreStatus,
    firestoreLatencyMs,
    firestoreMessage,
    retestFirestore,
  } = useFirebase();
  const {
    activeBookmakerInfo,
    diagnostics,
    diagnosticsCheckedAt,
    loadingDiagnostics,
    runDiagnosticsCheck,
    scanResult,
  } = useOddsHunter();

  const handleRunAll = async () => {
    await Promise.all([runDiagnosticsCheck(), retestFirestore()]);
  };

  const authStatus: DiagnosticStatus = !authReady
    ? 'UNVERIFIED'
    : user
      ? 'CONNECTED'
      : 'DISCONNECTED';

  const scannerStatus: DiagnosticStatus = scanResult
    ? scanResult.status === 'FAILED'
      ? 'ERROR'
      : 'CONNECTED'
    : diagnostics.some((d) => d.key.endsWith('_upcoming') && d.status === 'CONNECTED')
      ? 'CONNECTED'
      : 'UNVERIFIED';

  const allChecks = [
    ...diagnostics,
    {
      key: 'firestore_db',
      label: 'Firebase Firestore Database',
      status: firestoreStatus,
      latencyMs: firestoreLatencyMs,
      lastCheckedAt: diagnosticsCheckedAt || new Date().toISOString(),
      lastSuccessAt: firestoreStatus === 'CONNECTED' ? new Date().toISOString() : null,
      details: firestoreMessage,
      endpoint: 'firestore://test/connection',
    },
    {
      key: 'firebase_auth',
      label: 'Firebase Authentication',
      status: authStatus,
      latencyMs: null,
      lastCheckedAt: new Date().toISOString(),
      lastSuccessAt: user ? new Date().toISOString() : null,
      details: user
        ? `Authenticated as ${user.email}`
        : 'No active user session (sign in with Google to enable cloud sync).',
      endpoint: 'firebase-auth://popup',
    },
    {
      key: 'scanner_engine',
      label: 'Odds Scanner Engine',
      status: scannerStatus,
      latencyMs: null,
      lastCheckedAt: scanResult?.scannedAt || diagnosticsCheckedAt || new Date().toISOString(),
      lastSuccessAt: scanResult?.scannedAt || null,
      details: scanResult
        ? `Last run scanned ${scanResult.totalMatchesScanned} matches (${scanResult.qualifyingCount} qualifying).`
        : 'Ready; waiting for initial user scan or upstream probe.',
      endpoint: '/api/scanner/run',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            System Diagnostics
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Live verification probes against Backend API, Firestore, Firebase Auth, and{' '}
            {activeBookmakerInfo.name} endpoints.
          </p>
        </div>

        <button
          type="button"
          disabled={loadingDiagnostics}
          onClick={() => void handleRunAll()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#161F30] dark:hover:bg-[#1E293B] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-800 dark:text-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingDiagnostics ? 'animate-spin' : ''}`} />
          <span>{loadingDiagnostics ? 'Probing...' : 'Run Live Probes'}</span>
        </button>
      </div>

      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-hidden shadow-xs dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/[0.08] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0B101B]/60">
                <th className="py-3 px-4 font-medium">Subsystem</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Latency</th>
                <th className="py-3 px-4 font-medium">Last Success</th>
                <th className="py-3 px-4 font-medium">Verification Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/[0.06] text-xs">
              {allChecks.map((check) => (
                <tr key={check.key}>
                  <td className="py-3.5 px-4">
                    <div className="font-medium text-slate-900 dark:text-white">{check.label}</div>
                    <div className="font-mono text-[11px] text-slate-500">{check.endpoint}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusLabel status={check.status} />
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {check.latencyMs !== null ? `${check.latencyMs} ms` : '—'}
                  </td>
                  <td className="py-3.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {check.lastSuccessAt ? formatDateTimeCompact(check.lastSuccessAt) : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                    {check.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
