import { useEffect, useState } from 'react';
import {
  Check,
  ExternalLink,
  Globe,
  KeyRound,
  LogIn,
  MailCheck,
  Moon,
  RefreshCw,
  Save,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import { updateUserSettings } from '../firebase/firestore/repository.ts';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import { useTheme } from '../hooks/useTheme.tsx';
import type { BookmakerId } from '../types/sportybet.ts';

export function SettingsPage() {
  const {
    user,
    profile,
    isAdmin,
    openAuthModal,
    updateAccountProfile,
    sendPasswordReset,
    resendVerificationEmail,
    refreshAuthUser,
  } = useFirebase();
  const { theme, setTheme } = useTheme();
  const { bookmakers, activeBookmaker, setActiveBookmaker, betslip } = useOddsHunter();

  const [displayName, setDisplayName] = useState('');
  const [defaultMinOdds, setDefaultMinOdds] = useState(1.01);
  const [defaultMaxOdds, setDefaultMaxOdds] = useState(1.25);
  const [defaultStakeTzs, setDefaultStakeTzs] = useState(10000);
  const [autoScanIntervalSec, setAutoScanIntervalSec] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [accountActionMsg, setAccountActionMsg] = useState<string | null>(null);
  const [accountErrMsg, setAccountErrMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setDefaultMinOdds(profile.defaultMinOdds);
      setDefaultMaxOdds(profile.defaultMaxOdds);
      setDefaultStakeTzs(profile.defaultStakeTzs);
      setAutoScanIntervalSec(profile.autoScanIntervalSec);
    } else if (user) {
      setDisplayName(user.displayName || user.email?.split('@')[0] || '');
    }
  }, [profile, user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSavedNotice(null);
    setAccountErrMsg(null);
    try {
      const nextName = displayName.trim() || user.displayName || 'Analyst';
      if (nextName !== (user.displayName || '')) {
        await updateAccountProfile(nextName);
      }
      if (user.emailVerified) {
        await updateUserSettings(user.uid, {
          displayName: nextName,
          defaultMinOdds,
          defaultMaxOdds,
          defaultStakeTzs,
          autoScanIntervalSec,
        });
        setSavedNotice('Profile and scanner defaults saved to Firestore.');
      } else {
        setSavedNotice('Firebase Auth display name updated. Verify email to save Firestore defaults.');
      }
      setTimeout(() => setSavedNotice(null), 4000);
    } catch (err) {
      setAccountErrMsg(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setActionBusy(true);
    setAccountErrMsg(null);
    setAccountActionMsg(null);
    try {
      await sendPasswordReset(user.email);
      setAccountActionMsg(`Password reset email sent to ${user.email}.`);
    } catch (err) {
      setAccountErrMsg(err instanceof Error ? err.message : 'Failed to send password reset email.');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          Settings &amp; Account Preferences
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Customize your visual theme, switch active bookmaker feed, and manage your Firebase
          account profile and scanner defaults.
        </p>
      </div>

      {/* Appearance: Dark Mode & Light Mode */}
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-6 space-y-4 shadow-xs dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Appearance &amp; Theme Mode
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Switch instantly between Dark Mode and Light Mode. Saved automatically for future
              sessions{user && user.emailVerified ? ' and synced to your profile' : ''}.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300">
            Active: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`p-4 rounded-xl border text-left transition-all flex items-start justify-between gap-3 ${
              theme === 'dark'
                ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500/30 dark:bg-blue-600/15 dark:border-blue-500/50'
                : 'bg-slate-50 border-slate-200 hover:border-slate-300 dark:bg-[#0B101B] dark:border-white/[0.08] dark:hover:border-white/20'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-slate-900 text-blue-400 border border-slate-700 shrink-0">
                <Moon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Dark Mode
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Deep obsidian workspace with glass panels and crisp contrast.
                </p>
              </div>
            </div>
            {theme === 'dark' && (
              <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`p-4 rounded-xl border text-left transition-all flex items-start justify-between gap-3 ${
              theme === 'light'
                ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500/30 dark:bg-blue-600/15 dark:border-blue-500/50'
                : 'bg-slate-50 border-slate-200 hover:border-slate-300 dark:bg-[#0B101B] dark:border-white/[0.08] dark:hover:border-white/20'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-white text-amber-500 border border-slate-200 shadow-xs shrink-0">
                <Sun className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Light Mode
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Clean high-clarity daylight surface with structured card borders.
                </p>
              </div>
            </div>
            {theme === 'light' && (
              <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            )}
          </button>
        </div>
      </section>

      {/* Multi-Bookmaker Selector */}
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-6 space-y-4 shadow-xs dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Bookmaker Data Source (Strict Isolation)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Choose which Tanzania bookmaker powers Live Matches, Upcoming Matches, Odds Scanner,
              and Betslip Validation. Previously generated tickets stay preserved across switches.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bookmakers.map((bm) => {
            const isActive = activeBookmaker === bm.id;
            return (
              <button
                key={bm.id}
                type="button"
                onClick={() => setActiveBookmaker(bm.id as BookmakerId)}
                className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-3 ${
                  isActive
                    ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500/30 dark:bg-blue-600/15 dark:border-blue-500/50'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300 dark:bg-[#0B101B] dark:border-white/[0.08] dark:hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {bm.name}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      {bm.shortName} · {bm.country}
                    </div>
                  </div>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
                      <Check className="w-3.5 h-3.5" />
                      Active
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex items-center justify-between gap-2">
                    <span>Booking Codes:</span>
                    <span
                      className={`font-mono font-medium ${
                        bm.bookingCodeSupported
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {bm.bookingCodeSupported ? 'Official Share API' : 'Manual Slip Prep'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Official Portal:</span>
                    <a
                      href={bm.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-mono truncate"
                    >
                      <span>{bm.websiteUrl.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.06] px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <span>
            Each bookmaker maintains an isolated API client, market catalog, and betslip validation
            stream.{' '}
            {betslip.length > 0
              ? `Your current betslip has ${betslip.length} leg(s) locked to its originating bookmaker.`
              : 'Cross-bookmaker betslip mixing is blocked automatically.'}
          </span>
        </div>
      </section>

      {/* Account Security & Profile Management */}
      {!user ? (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-6 space-y-4 shadow-xs dark:shadow-none">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Account Profile &amp; Cloud Sync
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Sign in or create an account with Email &amp; Password or Google to synchronize your
              theme, preferred bookmaker, cross-bookmaker transfers, scanner defaults, and scan
              history across devices.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => openAuthModal('signin')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white whitespace-nowrap"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => openAuthModal('signup')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#0B101B] dark:hover:bg-[#161F30] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create Account</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-6 space-y-5 shadow-xs dark:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-white/[0.06] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Account Profile &amp; Scanner Defaults
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Signed in as <span className="font-mono">{user.email}</span> · Role:{' '}
                <strong className="font-mono">{isAdmin ? 'ADMIN' : 'USER'}</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {user.emailVerified ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <MailCheck className="w-3.5 h-3.5" />
                  <span>Email Verified</span>
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={async () => {
                      setActionBusy(true);
                      try {
                        const ok = await refreshAuthUser();
                        setAccountActionMsg(
                          ok ? 'Email verified!' : 'Not verified yet — check your inbox first.'
                        );
                      } finally {
                        setActionBusy(false);
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3 h-3 ${actionBusy ? 'animate-spin' : ''}`} />
                    <span>Refresh Verification</span>
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={async () => {
                      setActionBusy(true);
                      try {
                        await resendVerificationEmail();
                        setAccountActionMsg(`Verification email sent to ${user.email}.`);
                      } catch (e) {
                        setAccountErrMsg(e instanceof Error ? e.message : 'Unable to resend link.');
                      } finally {
                        setActionBusy(false);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  >
                    Resend Link
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handlePasswordReset()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 whitespace-nowrap"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Send Password Reset</span>
              </button>
            </div>
          </div>

          {accountActionMsg && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-3.5 py-2 text-xs text-emerald-700 dark:text-emerald-200">
              {accountActionMsg}
            </div>
          )}
          {accountErrMsg && (
            <div className="rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3.5 py-2 text-xs text-rose-700 dark:text-rose-200">
              {accountErrMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="space-y-1.5 text-xs sm:col-span-2">
              <span className="text-slate-600 dark:text-slate-400 block">
                Display Name
              </span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100"
              />
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 block">
                Default Minimum Odds
              </span>
              <input
                type="number"
                step="0.01"
                min="1.01"
                value={defaultMinOdds}
                onChange={(e) => setDefaultMinOdds(Number(e.target.value) || 1.01)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 block">
                Default Maximum Odds
              </span>
              <input
                type="number"
                step="0.01"
                min="1.01"
                value={defaultMaxOdds}
                onChange={(e) => setDefaultMaxOdds(Number(e.target.value) || 1.25)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 block">
                Default Hypothetical Stake (TZS)
              </span>
              <input
                type="number"
                min="0"
                step="500"
                value={defaultStakeTzs}
                onChange={(e) => setDefaultStakeTzs(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
              />
            </label>

            <label className="space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 block">
                Auto-Rescan Interval (Seconds)
              </span>
              <select
                value={autoScanIntervalSec}
                onChange={(e) => setAutoScanIntervalSec(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100"
              >
                <option value={0}>Manual Only (0s)</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
                <option value={180}>180 seconds</option>
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/[0.06]">
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              {savedNotice || ''}
            </span>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold text-white whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
