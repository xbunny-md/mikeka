import { useState } from 'react';
import { Check, Copy, ExternalLink, QrCode, Search, Trash2, Upload } from 'lucide-react';
import { StatusLabel } from '../components/StatusLabel.tsx';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import {
  deleteBookingCodeRecord,
  updateBookingCodeStatus,
} from '../firebase/firestore/repository.ts';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import { formatDateTimeCompact, formatOdds, formatTzs } from '../utils/formatters.ts';

export function BookingCodesPage() {
  const { user, bookingCodes } = useFirebase();
  const {
    bookmakers,
    activeBookmaker,
    activeBookmakerInfo,
    betslip,
    latestBookingCode,
    generatingCode,
    codeError,
    generateBookingCode,
    verifyAndLoadBookingCode,
    setActiveSection,
    replaceBetslip,
    portfolioTickets,
    createBookingCodeForTicket,
  } = useOddsHunter();

  const [lookupCode, setLookupCode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [creatingForId, setCreatingForId] = useState<string | null>(null);

  const slipBookmakerId = betslip[0]?.bookmakerId || activeBookmaker;
  const slipBookmakerInfo =
    bookmakers.find((b) => b.id === slipBookmakerId) || activeBookmakerInfo;
  const latestBookmakerId = latestBookingCode?.bookmakerId || activeBookmaker;
  const latestBookmakerInfo =
    bookmakers.find((b) => b.id === latestBookmakerId) || activeBookmakerInfo;

  const aiTicketsWithCodes = portfolioTickets.filter((t) => Boolean(t.shareCode));
  const aiTicketsPendingCode = portfolioTickets.filter(
    (t) => !t.shareCode && (t.status === 'PENDING' || t.status === 'LIVE')
  );

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // Clipboard blocked in restricted frame; user can copy directly from mono display
    }
  };

  const handleVerifyLookup = async () => {
    if (!lookupCode.trim()) return;
    setLookingUp(true);
    try {
      await verifyAndLoadBookingCode(lookupCode.trim(), false, activeBookmaker);
    } finally {
      setLookingUp(false);
    }
  };

  const handleLoadIntoSlip = async () => {
    if (!lookupCode.trim()) return;
    setLookingUp(true);
    try {
      const res = await verifyAndLoadBookingCode(lookupCode.trim(), true, activeBookmaker);
      if (res) setActiveSection('betslip');
    } finally {
      setLookingUp(false);
    }
  };

  const recheckSavedCode = async (
    docId: string,
    shareCode: string,
    targetBookmaker = activeBookmaker
  ) => {
    const res = await verifyAndLoadBookingCode(shareCode, false, targetBookmaker);
    if (user) {
      if (!res) {
        await updateBookingCodeStatus(user.uid, docId, 'INVALID');
      } else if (res.deadline > 0 && res.deadline < Date.now()) {
        await updateBookingCodeStatus(user.uid, docId, 'EXPIRED');
      } else {
        await updateBookingCodeStatus(user.uid, docId, 'ACTIVE');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          Booking Code Manager
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Directly creates and verifies official {activeBookmakerInfo.name} sharing codes via{' '}
          <span className="font-mono text-slate-700 dark:text-slate-300">
            {activeBookmakerInfo.bookingCodeMechanism}
          </span>
          . No local or fabricated IDs are ever generated.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Booking Code from Active Slip */}
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-5 space-y-4 shadow-xs dark:shadow-none">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Generate From Active Slip ({slipBookmakerInfo.shortName})
            </h3>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {betslip.length} legs ready
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Submits your prepared selections to {slipBookmakerInfo.name} to receive a verified,
            loadable sharing code. Never places bets or initiates account transactions.
          </p>

          <button
            type="button"
            disabled={betslip.length === 0 || generatingCode}
            onClick={() => void generateBookingCode()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-semibold text-white transition-colors"
          >
            <QrCode className="w-4 h-4" />
            <span>
              {generatingCode
                ? 'Requesting Official Code...'
                : `Generate Genuine ${slipBookmakerInfo.shortName} Code`}
            </span>
          </button>
        </section>

        {/* Verify / Load Existing Bookmaker Code */}
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-5 space-y-4 shadow-xs dark:shadow-none">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Verify or Load {activeBookmakerInfo.shortName} Code
          </h3>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={lookupCode}
              onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
              placeholder={`Enter ${activeBookmakerInfo.shortName} code (e.g. ${
                activeBookmaker === 'BETPAWA_TZ' ? '8A2F4B' : '67YAVU'
              })`}
              className="flex-1 min-w-[180px] px-3 py-2 text-sm font-mono uppercase rounded-lg bg-slate-50 dark:bg-[#0B101B] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            <button
              type="button"
              disabled={lookingUp || !lookupCode.trim()}
              onClick={() => void handleVerifyLookup()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#161F30] dark:hover:bg-[#1E293B] border border-slate-200 dark:border-white/10 disabled:opacity-40 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Verify</span>
            </button>
            <button
              type="button"
              disabled={lookingUp || !lookupCode.trim()}
              onClick={() => void handleLoadIntoSlip()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-medium text-white"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Load to Slip</span>
            </button>
          </div>
        </section>
      </div>

      {codeError && (
        <div className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 text-sm dark:text-red-300">
          {codeError}
        </div>
      )}

      {/* Active / Latest Verified Code Card */}
      {latestBookingCode && (
        <section className="bg-white dark:bg-[#111827] border border-emerald-300 dark:border-emerald-500/30 rounded-xl p-6 space-y-4 shadow-xs dark:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Verified {latestBookingCode.bookmakerName || latestBookmakerInfo.name} Code
                </span>
                <StatusLabel status="ACTIVE" label="VERIFIED" />
              </div>
              <div className="text-3xl font-bold font-mono tracking-wider text-slate-900 dark:text-white">
                {latestBookingCode.shareCode}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {latestBookingCode.selectionCount} selections · Combined Odds{' '}
                {formatOdds(latestBookingCode.combinedOdds)} · Expires{' '}
                {latestBookingCode.deadline > 0
                  ? formatDateTimeCompact(latestBookingCode.deadline)
                  : 'On kickoff'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy(latestBookingCode.shareCode)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#161F30] dark:hover:bg-[#1E293B] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-800 dark:text-white"
              >
                {copiedCode === latestBookingCode.shareCode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>

              <a
                href={latestBookingCode.shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
              >
                <span>Open on {latestBookmakerInfo.shortName}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/[0.08] pt-4 space-y-2">
            {latestBookingCode.selections.map((s) => (
              <div
                key={s.selectionKey}
                className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5"
              >
                <span className="text-slate-800 dark:text-slate-200">
                  {s.homeTeam} vs {s.awayTeam} —{' '}
                  <span className="text-blue-700 dark:text-blue-300">
                    {s.marketName}: {s.outcomeDesc}
                  </span>
                </span>
                <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatOdds(s.odds)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Daily Factory Portfolio Tickets Booking Code Queue */}
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-hidden shadow-xs dark:shadow-none">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Daily Portfolio Booking Codes ({aiTicketsWithCodes.length} issued ·{' '}
            {aiTicketsPendingCode.length} awaiting code)
          </h3>
        </div>
        {portfolioTickets.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No generated daily tickets yet. Run the Daily Factory from the Admin Control Center.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
            {portfolioTickets.slice(0, 20).map((t) => {
              const tBookmakerId = t.bookmakerId || 'SPORTYBET_TZ';
              const tBookmakerInfo =
                bookmakers.find((b) => b.id === tBookmakerId) || activeBookmakerInfo;
              const tShortName = tBookmakerInfo.shortName;
              return (
                <div
                  key={t.internalTicketId}
                  className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 font-mono">
                      <span className="text-slate-900 dark:text-white font-semibold">
                        {t.internalTicketId}
                      </span>
                      <span className="text-slate-400 dark:text-slate-600">·</span>
                      <span className="text-slate-600 dark:text-slate-300">{tShortName}</span>
                      <span className="text-slate-400 dark:text-slate-600">·</span>
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {t.shareCode ? `Code: ${t.shareCode}` : `No ${tShortName} Code Yet`}
                      </span>
                      <span className="text-slate-400 dark:text-slate-600">·</span>
                      <span className="text-slate-500 dark:text-slate-400">{t.status}</span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 font-mono">
                      {t.selectionCount} legs · {formatOdds(t.actualCombinedOdds)}x ·{' '}
                      {t.generatedDateKey}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {t.shareCode ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleCopy(t.shareCode!)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white"
                        >
                          {copiedCode === t.shareCode ? 'Copied' : 'Copy Code'}
                        </button>
                        {t.shareUrl && (
                          <a
                            href={t.shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 dark:bg-blue-600/20 dark:border-blue-500/30 dark:text-blue-300"
                          >
                            Open {tShortName}
                          </a>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={creatingForId === t.internalTicketId}
                        onClick={async () => {
                          setCreatingForId(t.internalTicketId);
                          try {
                            await createBookingCodeForTicket(t.internalTicketId);
                          } finally {
                            setCreatingForId(null);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 dark:bg-emerald-600/20 dark:hover:bg-emerald-600/30 dark:border-emerald-500/30 dark:text-emerald-300 disabled:opacity-50"
                      >
                        {creatingForId === t.internalTicketId
                          ? 'Requesting...'
                          : 'Create Genuine Code'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Saved Cloud Booking Codes */}
      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-hidden shadow-xs dark:shadow-none">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Saved Cloud Booking Codes
          </h3>
        </div>

        {!user ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Sign in with Google to save generated booking codes and monitor their validity in
            Firestore.
          </div>
        ) : bookingCodes.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            No booking codes saved yet. Generate a code from your Bet Slip to archive it here.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
            {bookingCodes.map((rec) => {
              const recBookmaker = rec.selections?.[0]?.bookmakerId || activeBookmaker;
              return (
                <div
                  key={rec.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                        {rec.shareCode}
                      </span>
                      <StatusLabel status={rec.status} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {rec.selectionCount} legs · {formatOdds(rec.combinedOdds)}x · Est.{' '}
                      {formatTzs(rec.estimatedReturnTzs)} · Expires{' '}
                      {rec.deadline > 0 ? formatDateTimeCompact(rec.deadline) : 'Kickoff'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(rec.shareCode)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    >
                      {copiedCode === rec.shareCode ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        replaceBetslip(rec.selections);
                        setActiveSection('betslip');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                    >
                      Reload Slip
                    </button>
                    <button
                      type="button"
                      onClick={() => void recheckSavedCode(rec.id, rec.shareCode, recBookmaker)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs text-blue-700 dark:text-blue-300 hover:border-blue-500/40"
                    >
                      Re-verify
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteBookingCodeRecord(user.uid, rec.id)}
                      className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                      title="Delete record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
