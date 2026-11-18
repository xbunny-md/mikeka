import React, { useState } from 'react';
import { Lock, MailCheck, RefreshCw, ShieldAlert, UserPlus } from 'lucide-react';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';

interface ProtectedRouteGateProps {
  children: React.ReactNode;
  title: string;
  description: string;
  requireVerifiedEmail?: boolean;
  requireAdmin?: boolean;
}

export function ProtectedRouteGate({
  children,
  title,
  description,
  requireVerifiedEmail = false,
  requireAdmin = false,
}: ProtectedRouteGateProps) {
  const {
    user,
    authReady,
    isAdmin,
    openAuthModal,
    resendVerificationEmail,
    refreshAuthUser,
  } = useFirebase();

  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  if (!authReady) {
    return (
      <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-10 text-center text-xs text-slate-500">
        Verifying authentication session...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-10 text-center space-y-4 max-w-xl mx-auto shadow-xs dark:shadow-none">
        <Lock className="w-8 h-8 text-blue-600 dark:text-blue-400 mx-auto" />
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">{description}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => openAuthModal('signin')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => openAuthModal('signup')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#0B101B] dark:hover:bg-[#161F30] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create Account</span>
          </button>
        </div>
      </div>
    );
  }

  if (requireVerifiedEmail && !user.emailVerified) {
    return (
      <div className="rounded-xl bg-white dark:bg-[#111827] border border-amber-200 dark:border-amber-500/30 p-8 text-center space-y-4 max-w-xl mx-auto shadow-xs dark:shadow-none">
        <MailCheck className="w-8 h-8 text-amber-600 dark:text-amber-400 mx-auto" />
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Verify Your Email to Unlock Cloud Sync
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Signed in as <span className="font-mono font-semibold">{user.email}</span>. Firestore
            security rules require a verified email before saving or reading private profile data.
          </p>
        </div>
        {statusMsg && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{statusMsg}</p>
        )}
        {errMsg && <p className="text-xs text-rose-600 dark:text-rose-300">{errMsg}</p>}
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              setErrMsg(null);
              try {
                const ok = await refreshAuthUser();
                setStatusMsg(
                  ok
                    ? 'Email verified!'
                    : 'Not verified yet — open the link in your email inbox first.'
                );
              } catch (e) {
                setErrMsg(e instanceof Error ? e.message : 'Unable to refresh status.');
              } finally {
                setRefreshing(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-semibold text-white whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>I&apos;ve Verified — Refresh</span>
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={async () => {
              setSending(true);
              setErrMsg(null);
              try {
                await resendVerificationEmail();
                setStatusMsg(`Verification link sent to ${user.email}.`);
              } catch (e) {
                setErrMsg(e instanceof Error ? e.message : 'Failed to send verification link.');
              } finally {
                setSending(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#0B101B] dark:hover:bg-[#161F30] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
          >
            <span>Resend Verification Email</span>
          </button>
        </div>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] p-10 text-center space-y-2 max-w-xl mx-auto shadow-xs dark:shadow-none">
        <ShieldAlert className="w-8 h-8 text-rose-500 dark:text-rose-400 mx-auto" />
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          Administrator Authorization Required
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Signed in as <span className="font-mono">{user.email}</span>. Platform integration toggles,
          user management, and daily factory controls require an authorized administrator account.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
