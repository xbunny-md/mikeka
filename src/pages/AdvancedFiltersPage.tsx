import { useState } from 'react';
import { BookmarkPlus, Download, Play, RotateCcw, Trash2 } from 'lucide-react';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import { deleteFilterPreset, saveFilterPreset } from '../firebase/firestore/repository.ts';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import { downloadJsonFile } from '../utils/formatters.ts';

export function AdvancedFiltersPage() {
  const { user, presets } = useFirebase();
  const {
    activeBookmaker,
    activeBookmakerInfo,
    markets,
    leagues,
    scannerConfig,
    setScannerConfig,
    resetScannerConfig,
    executeScan,
    scanResult,
    setActiveSection,
    scanning,
  } = useOddsHunter();

  const [presetName, setPresetName] = useState('');
  const [leagueSearch, setLeagueSearch] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);

  const visibleLeagues = leagues.filter((l) =>
    `${l.country} ${l.tournamentName}`.toLowerCase().includes(leagueSearch.toLowerCase())
  );

  const toggleLeague = (tournamentId: string) => {
    setScannerConfig((prev) => {
      const exists = prev.leagues.includes(tournamentId);
      return {
        ...prev,
        leagues: exists
          ? prev.leagues.filter((id) => id !== tournamentId)
          : [...prev.leagues, tournamentId],
      };
    });
  };

  const handleSavePreset = async () => {
    if (!user || !presetName.trim()) return;
    setSavingPreset(true);
    try {
      await saveFilterPreset(user.uid, {
        name: presetName.trim(),
        minOdds: scannerConfig.minOdds,
        maxOdds: scannerConfig.maxOdds,
        markets: scannerConfig.markets,
        leagues: scannerConfig.leagues,
        matchStatus: scannerConfig.matchStatus,
        maxResults: scannerConfig.maxResults,
      });
      setPresetName('');
    } finally {
      setSavingPreset(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Advanced Filtering Engine
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Independently tune decimal odds bounds, date horizon, leagues, markets, and saved
            filter presets for {activeBookmakerInfo.name}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resetScannerConfig}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
          <button
            type="button"
            disabled={!scanResult}
            onClick={() =>
              scanResult &&
              downloadJsonFile(
                `${activeBookmaker.toLowerCase()}-filtered-results-${new Date()
                  .toISOString()
                  .slice(0, 10)}.json`,
                scanResult
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Results</span>
          </button>
          <button
            type="button"
            disabled={scanning}
            onClick={async () => {
              await executeScan();
              setActiveSection('scanner');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Apply Filters &amp; Scan</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Bounds */}
        <section className="lg:col-span-2 bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-5 space-y-5 shadow-xs dark:shadow-none">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Filter Parameters
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 block">Minimum Odds</span>
              <input
                type="number"
                step="0.01"
                min="1.01"
                value={scannerConfig.minOdds}
                onChange={(e) =>
                  setScannerConfig((p) => ({ ...p, minOdds: Number(e.target.value) || 1.01 }))
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 block">Maximum Odds</span>
              <input
                type="number"
                step="0.01"
                min="1.01"
                value={scannerConfig.maxOdds}
                onChange={(e) =>
                  setScannerConfig((p) => ({ ...p, maxOdds: Number(e.target.value) || 1.5 }))
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 block">Start Date</span>
              <input
                type="date"
                value={scannerConfig.startDate}
                onChange={(e) =>
                  setScannerConfig((p) => ({ ...p, startDate: e.target.value }))
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono"
              />
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 block">End Date</span>
              <input
                type="date"
                value={scannerConfig.endDate}
                onChange={(e) => setScannerConfig((p) => ({ ...p, endDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono"
              />
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 block">Maximum Results</span>
              <input
                type="number"
                min="1"
                max="500"
                value={scannerConfig.maxResults}
                onChange={(e) =>
                  setScannerConfig((p) => ({
                    ...p,
                    maxResults: Math.max(1, Math.min(500, Number(e.target.value) || 100)),
                  }))
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 block">
                Team / Keyword Filter
              </span>
              <input
                type="text"
                value={scannerConfig.searchQuery || ''}
                onChange={(e) =>
                  setScannerConfig((p) => ({ ...p, searchQuery: e.target.value }))
                }
                placeholder="e.g. Arsenal, Real Madrid..."
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Football Leagues (
                {scannerConfig.leagues.length === 0
                  ? 'All Leagues'
                  : `${scannerConfig.leagues.length} selected`}
                )
              </span>
              {scannerConfig.leagues.length > 0 && (
                <button
                  type="button"
                  onClick={() => setScannerConfig((p) => ({ ...p, leagues: [] }))}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
                >
                  Clear League Selection
                </button>
              )}
            </div>
            <input
              type="text"
              value={leagueSearch}
              onChange={(e) => setLeagueSearch(e.target.value)}
              placeholder={`Filter ${activeBookmakerInfo.shortName} league directory...`}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100"
            />
            <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
              {visibleLeagues.slice(0, 60).map((l) => {
                const checked = scannerConfig.leagues.includes(l.tournamentId);
                return (
                  <button
                    key={l.tournamentId}
                    type="button"
                    onClick={() => toggleLeague(l.tournamentId)}
                    className={`px-3 py-2 rounded-lg border text-left text-xs flex items-center justify-between gap-2 ${
                      checked
                        ? 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-blue-600/20 dark:border-blue-500/40 dark:text-blue-200'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-[#0B101B] dark:border-white/[0.06] dark:text-slate-300 dark:hover:border-white/20'
                    }`}
                  >
                    <span className="truncate">
                      {l.country} · {l.tournamentName}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                      {l.eventSize}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block">
              Markets Included ({activeBookmakerInfo.shortName})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {markets.map((m) => {
                const active = scannerConfig.markets.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      setScannerConfig((prev) => {
                        const exists = prev.markets.includes(m.id);
                        const next = exists
                          ? prev.markets.filter((x) => x !== m.id)
                          : [...prev.markets, m.id];
                        return { ...prev, markets: next.length > 0 ? next : [m.id] };
                      })
                    }
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      active
                        ? 'bg-blue-50 border-blue-500 text-slate-900 dark:bg-blue-600/15 dark:border-blue-500/40 dark:text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-[#0B101B] dark:border-white/[0.06] dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-medium">{m.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{m.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Saved Presets */}
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-5 space-y-4 h-fit shadow-xs dark:shadow-none">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Filter Presets</h3>
          {!user ? (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Sign in with Google from the sidebar to save and sync reusable filter presets in
              Firestore.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name (e.g. Safe DC 1.15-1.35)"
                  className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={savingPreset || !presetName.trim()}
                  onClick={() => void handleSavePreset()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium text-white shrink-0"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>

              {presets.length === 0 ? (
                <p className="text-xs text-slate-500">No saved presets yet.</p>
              ) : (
                <div className="space-y-2">
                  {presets.map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.08] flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setScannerConfig((prev) => ({
                            ...prev,
                            minOdds: p.minOdds,
                            maxOdds: p.maxOdds,
                            markets: p.markets,
                            leagues: p.leagues,
                            matchStatus: p.matchStatus,
                            maxResults: p.maxResults,
                          }))
                        }
                        className="text-left min-w-0 flex-1"
                      >
                        <div className="text-xs font-medium text-slate-900 dark:text-white truncate">
                          {p.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          {p.minOdds.toFixed(2)}–{p.maxOdds.toFixed(2)} · {p.markets.length}{' '}
                          markets
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteFilterPreset(user.uid, p.id)}
                        className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete preset"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
