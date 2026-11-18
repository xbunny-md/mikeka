import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, Mail, User as UserIcon, X } from 'lucide-react';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';

export function AuthModal() {
  const {
    authModalOpen,
    authModalTab,
    openAuthModal,
    closeAuthModal,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    signInWithGoogle,
  } = useFirebase();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (authModalOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [authModalOpen, authModalTab]);

  if (!authModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      if (authModalTab === 'signin') {
        await signInWithEmail({ email, password, rememberMe });
      } else if (authModalTab === 'signup') {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        await signUpWithEmail({ email, password, displayName, rememberMe });
      } else {
        await sendPasswordReset(email);
        setSuccessMsg(
          `Password reset link sent to ${email.trim()}. Check your inbox (and spam folder).`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
          <div>
            <h2
              id="auth-modal-title"
              className="text-base font-bold text-slate-900 dark:text-white"
            >
              {authModalTab === 'signin'
                ? 'Sign In to Odds Hunter'
                : authModalTab === 'signup'
                  ? 'Create Your Account'
                  : 'Reset Account Password'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Firebase Authentication with persistent secure sessions
            </p>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Close authentication modal"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B101B] border border-slate-200 dark:border-white/[0.06] text-xs font-medium">
            <button
              type="button"
              onClick={() => openAuthModal('signin')}
              className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                authModalTab === 'signin'
                  ? 'bg-white dark:bg-[#161F30] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => openAuthModal('signup')}
              className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                authModalTab === 'signup'
                  ? 'bg-white dark:bg-[#161F30] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => openAuthModal('reset')}
              className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                authModalTab === 'reset'
                  ? 'bg-white dark:bg-[#161F30] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Reset
            </button>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-4">
          {errorMsg && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 px-3.5 py-2.5 text-xs dark:text-rose-200">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 px-3.5 py-2.5 text-xs dark:text-emerald-200">
              {successMsg}
            </div>
          )}

          {authModalTab === 'signup' && (
            <label className="block space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 font-medium block">
                Full Name / Analyst Alias
              </span>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Amina Hassan"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                />
              </div>
            </label>
          )}

          <label className="block space-y-1.5 text-xs">
            <span className="text-slate-600 dark:text-slate-400 font-medium block">
              Email Address
            </span>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
              />
            </div>
          </label>

          {authModalTab !== 'reset' && (
            <label className="block space-y-1.5 text-xs">
              <span className="text-slate-600 dark:text-slate-400 font-medium block">
                Password
              </span>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete={
                    authModalTab === 'signup' ? 'new-password' : 'current-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
          )}

          {authModalTab !== 'reset' && (
            <div className="flex items-center justify-between text-xs">
              <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 dark:border-white/20"
                />
                <span>Keep me signed in</span>
              </label>

              {authModalTab === 'signin' && (
                <button
                  type="button"
                  onClick={() => openAuthModal('reset')}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Forgot password?
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-xs font-semibold text-white transition-colors"
          >
            {submitting
              ? 'Please wait...'
              : authModalTab === 'signin'
                ? 'Sign In'
                : authModalTab === 'signup'
                  ? 'Create Account & Send Verification'
                  : 'Send Password Reset Email'}
          </button>

          {authModalTab !== 'reset' && (
            <>
              <div className="relative flex items-center py-1">
                <div className="flex-1 border-t border-slate-200 dark:border-white/10" />
                <span className="px-3 text-[11px] uppercase tracking-wider text-slate-400">
                  or
                </span>
                <div className="flex-1 border-t border-slate-200 dark:border-white/10" />
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleGoogle()}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-[#0B101B] dark:hover:bg-[#161F30] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5 text-blue-500" />
                <span>Continue with Google</span>
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
