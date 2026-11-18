import React, { useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  BookmarkCheck,
  CalendarClock,
  Database,
  History,
  LayoutGrid,
  ListChecks,
  LogIn,
  LogOut,
  MailCheck,
  Menu,
  QrCode,
  Radio,
  Radar,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  X,
} from 'lucide-react';
import { AuthModal } from '../components/AuthModal.tsx';
import { MatchDetailModal } from '../components/MatchDetailModal.tsx';
import { NotificationDrawer } from '../components/NotificationDrawer.tsx';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import { useOddsHunter, type NavSection } from '../hooks/useOddsHunter.tsx';

interface NavItemConfig {
  id: NavSection;
  label: string;
  group: 'FACTORY' | 'MARKETS' | 'SYSTEM';
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'feed', label: 'Daily Tickets', group: 'FACTORY', icon: LayoutGrid },
  { id: 'stats', label: 'Statistics Dashboard', group: 'FACTORY', icon: BarChart3 },
  { id: 'favorites', label: 'Favorites', group: 'FACTORY', icon: BookmarkCheck },
  {
    id: 'admin-control',
    label: 'Admin Control Center',
    group: 'FACTORY',
    icon: ShieldCheck,
    adminOnly: true,
  },
  { id: 'live', label: 'Live Matches', group: 'MARKETS', icon: Radio },
  { id: 'upcoming', label: 'Upcoming Matches', group: 'MARKETS', icon: CalendarClock },
  { id: 'scanner', label: 'Odds Scanner', group: 'MARKETS', icon: Radar },
  { id: 'filters', label: 'Advanced Filters', group: 'MARKETS', icon: SlidersHorizontal },
  { id: 'betslip', label: 'Bet Slip Builder', group: 'MARKETS', icon: ListChecks },
  { id: 'booking-codes', label: 'Booking Code Tools', group: 'MARKETS', icon: QrCode },
  { id: 'transfer', label: 'Bet Transfer', group: 'MARKETS', icon: ArrowLeftRight },
  { id: 'history', label: 'Scan History', group: 'SYSTEM', icon: History },
  { id: 'data-sources', label: 'Data Sources', group: 'SYSTEM', icon: Database },
  { id: 'settings', label: 'Account Settings', group: 'SYSTEM', icon: Settings },
  { id: 'diagnostics', label: 'System Diagnostics', group: 'SYSTEM', icon: Activity },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const {
    user,
    isAdmin,
    favoriteTickets,
    cloudNotifications,
    openAuthModal,
    signOut,
    authNotice,
    clearAuthNotice,
    resendVerificationEmail,
    refreshAuthUser,
  } = useFirebase();
  const {
    activeSection,
    setActiveSection,
    betslip,
    portfolioTickets,
    loadingPortfolio,
    refreshPortfolio,
    unreadCount,
    activeBookmakerInfo,
  } = useOddsHunter();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [verifyingAction, setVerifyingAction] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const activeNav =
    activeSection === 'ticket-details'
      ? { id: 'ticket-details' as const, label: 'Ticket Details' }
      : visibleNavItems.find((n) => n.id === activeSection) || visibleNavItems[0];

  const cloudUnread = cloudNotifications.filter((n) => !n.read).length;
  const effectiveUnread = user && user.emailVerified ? cloudUnread : unreadCount;

  const handleNavClick = (id: NavSection) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
  };

  const renderSidebarAccountFooter = (isMobile = false) => {
    if (user) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                {user.displayName || 'Signed In'}
                {isAdmin ? ' · Admin' : ''}
              </p>
              <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
              {!user.emailVerified && (
                <p className="text-[10px] font-medium text-amber-600 dark:text-amber-300 mt-0.5">
                  Email verification pending
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              title="Sign out"
              aria-label="Sign out"
              className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          {isMobile && (
            <button
              type="button"
              onClick={() => handleNavClick('settings')}
              className="w-full py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Manage Profile
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(false);
            openAuthModal('signin');
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors whitespace-nowrap"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>Sign In</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(false);
            openAuthModal('signup');
          }}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#161F30] dark:hover:bg-[#1E293B] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Create Account</span>
        </button>
      </div>
    );
  };

  const renderNavGroups = () => (
    <div className="space-y-4">
      {(
        [
          { key: 'FACTORY', title: 'Daily Odds Factory' },
          { key: 'MARKETS', title: 'Live Markets & Transfer' },
          { key: 'SYSTEM', title: 'Platform' },
        ] as const
      ).map((group) => {
        const items = visibleNavItems.filter((i) => i.group === group.key);
        if (items.length === 0) return null;
        return (
          <div key={group.key} className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {group.title}
            </p>
            {items.map((item) => {
              const Icon = item.icon;
              const active =
                activeSection === item.id ||
                (item.id === 'feed' && activeSection === 'ticket-details');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-600/15 dark:text-blue-300 dark:border-blue-500/30'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'feed' && portfolioTickets.length > 0 && (
                    <span className="font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                      {portfolioTickets.length}
                    </span>
                  )}
                  {item.id === 'favorites' && favoriteTickets.length > 0 && (
                    <span className="font-mono text-xs tabular-nums text-amber-600 dark:text-amber-300">
                      {favoriteTickets.length}
                    </span>
                  )}
                  {item.id === 'betslip' && betslip.length > 0 && (
                    <span className="font-mono text-xs tabular-nums text-blue-600 dark:text-blue-300">
                      {betslip.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#090D16] dark:text-slate-100 flex transition-colors duration-200">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-[260px] shrink-0 flex-col border-r border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0B101B] sticky top-0 h-screen transition-colors duration-200">
        <div className="px-5 py-5 border-b border-slate-200 dark:border-white/[0.08]">
          <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap block">
            SportyBet Odds Hunter
          </span>
          <span className="text-[11px] text-slate-500 whitespace-nowrap block mt-0.5">
            Automatic Daily Odds Factory · {activeBookmakerInfo.shortName}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">{renderNavGroups()}</nav>

        <div className="p-4 border-t border-slate-200 dark:border-white/[0.08]">
          {renderSidebarAccountFooter(false)}
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex bg-slate-900/50 dark:bg-black/70 backdrop-blur-xs">
          <aside className="w-[270px] bg-white dark:bg-[#0B101B] border-r border-slate-200 dark:border-white/10 h-full flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
              <span className="text-base font-bold text-slate-900 dark:text-white whitespace-nowrap">
                SportyBet Odds Hunter
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">{renderNavGroups()}</nav>
            <div className="p-4 border-t border-slate-200 dark:border-white/[0.08]">
              {renderSidebarAccountFooter(true)}
            </div>
          </aside>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb/Section — Controls — Primary CTA */}
        <header className="sticky top-0 z-30 bg-white/90 dark:bg-[#090D16]/90 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.08] px-4 lg:px-8 h-16 flex items-center justify-between gap-4 transition-colors duration-200">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">
                {activeBookmakerInfo.shortName}
              </span>
              <span className="text-slate-400 dark:text-slate-600 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 dark:text-white truncate">
                {activeNav.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleNavClick('transfer')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white hover:border-slate-300 dark:bg-[#111827] dark:hover:border-white/20 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Transfer</span>
            </button>

            <button
              type="button"
              onClick={() => handleNavClick('betslip')}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white hover:border-slate-300 dark:bg-[#111827] dark:hover:border-white/20 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0 transition-colors"
            >
              Slip (<span className="font-mono tabular-nums">{betslip.length}</span>)
            </button>

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              aria-label="Open notification center"
              className="relative p-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white hover:border-slate-300 dark:bg-[#111827] dark:hover:border-white/20 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors shrink-0"
            >
              <Bell className="w-4 h-4" />
              {effectiveUnread > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 min-w-[18px] h-[18px] rounded-full bg-blue-600 text-[10px] font-mono font-semibold text-white flex items-center justify-center">
                  {effectiveUnread}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSection('feed');
                void refreshPortfolio();
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPortfolio ? 'animate-spin' : ''}`} />
              <span>Daily Feed</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto space-y-4">
          {authNotice && (
            <div className="rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-800 dark:text-blue-200">
              <span>{authNotice}</span>
              <button
                type="button"
                onClick={clearAuthNotice}
                className="text-blue-600 dark:text-blue-300 hover:underline font-medium whitespace-nowrap"
              >
                Dismiss
              </button>
            </div>
          )}

          {user && !user.emailVerified && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                <MailCheck className="w-4 h-4 shrink-0" />
                <span>
                  Verify <strong className="font-mono">{user.email}</strong> to enable personal
                  cloud sync (Favorites, Scan History, Saved Transfers).
                  {verifyMsg ? ` · ${verifyMsg}` : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={verifyingAction}
                  onClick={async () => {
                    setVerifyingAction(true);
                    try {
                      const ok = await refreshAuthUser();
                      setVerifyMsg(
                        ok ? 'Verified!' : 'Not yet verified — check your email link first.'
                      );
                    } finally {
                      setVerifyingAction(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold whitespace-nowrap"
                >
                  {verifyingAction ? 'Checking...' : "I've Verified — Refresh"}
                </button>
                <button
                  type="button"
                  disabled={verifyingAction}
                  onClick={async () => {
                    setVerifyingAction(true);
                    try {
                      await resendVerificationEmail();
                      setVerifyMsg('Verification email resent.');
                    } catch (e) {
                      setVerifyMsg(e instanceof Error ? e.message : 'Unable to send link.');
                    } finally {
                      setVerifyingAction(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-200 font-medium whitespace-nowrap"
                >
                  Resend Link
                </button>
              </div>
            </div>
          )}

          {children}
        </main>
      </div>

      <AuthModal />
      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
      <MatchDetailModal />
    </div>
  );
}
