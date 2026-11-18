import React from 'react';
import { Bookmark, Check, Copy, Layers } from 'lucide-react';
import type { GeneratedTicket, TicketStatus } from '../types/sportybet.ts';
import { formatKickoffTime } from '../utils/formatters.ts';

interface TicketPosterCardProps {
  ticket: GeneratedTicket;
  favorited: boolean;
  onOpenDetails: (internalTicketId: string) => void;
  onToggleFavorite: (ticket: GeneratedTicket) => void;
}

const STATUS_STYLE: Record<
  TicketStatus,
  { dot: string; text: string; label: string }
> = {
  WON: { dot: 'bg-emerald-500 dark:bg-emerald-400', text: 'text-emerald-700 dark:text-emerald-300', label: 'WON' },
  LOST: { dot: 'bg-rose-500 dark:bg-rose-400', text: 'text-rose-700 dark:text-rose-300', label: 'LOST' },
  VOID: { dot: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-300', label: 'VOID' },
  LIVE: { dot: 'bg-amber-500 dark:bg-amber-400 animate-pulse', text: 'text-amber-700 dark:text-amber-300', label: 'LIVE' },
  PARTIALLY_SETTLED: { dot: 'bg-cyan-500 dark:bg-cyan-400', text: 'text-cyan-700 dark:text-cyan-300', label: 'PARTIAL' },
  UNVERIFIED: { dot: 'bg-orange-500 dark:bg-orange-400', text: 'text-orange-700 dark:text-orange-300', label: 'UNVERIFIED' },
  PENDING: { dot: 'bg-blue-500 dark:bg-blue-400', text: 'text-blue-700 dark:text-blue-300', label: 'PENDING' },
};

export function TicketPosterCard({
  ticket,
  favorited,
  onOpenDetails,
  onToggleFavorite,
}: TicketPosterCardProps) {
  const [copied, setCopied] = React.useState(false);
  const statusMeta = STATUS_STYLE[ticket.status] || STATUS_STYLE.PENDING;
  const bookmakerLabel = ticket.bookmakerId === 'BETPAWA_TZ' ? 'betPawa TZ' : 'SportyBet TZ';

  const shortId = ticket.internalTicketId.replace(/^TKT[-_]?/i, '').slice(-6).toUpperCase();
  const kickoffSpan =
    ticket.kickoffStartMs > 0
      ? ticket.kickoffStartMs === ticket.kickoffEndMs
        ? formatKickoffTime(ticket.kickoffStartMs)
        : `${formatKickoffTime(ticket.kickoffStartMs)}–${formatKickoffTime(ticket.kickoffEndMs)}`
      : '—';

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ticket.shareCode) return;
    navigator.clipboard.writeText(ticket.shareCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(ticket.internalTicketId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetails(ticket.internalTicketId);
        }
      }}
      className="group relative flex flex-col justify-between rounded-xl bg-white dark:bg-gradient-to-b dark:from-[#131C2E] dark:via-[#0F1726] dark:to-[#0B101B] border border-slate-200 dark:border-white/[0.08] hover:border-blue-500/50 dark:hover:border-blue-500/40 shadow-xs hover:shadow-[0_12px_32px_-12px_rgba(37,99,235,0.28)] transition-all duration-200 overflow-hidden cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-blue-500/50"
    >
      {/* Top Poster Accent Bar */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="min-w-0">
          <span className="font-mono text-[11px] font-semibold tracking-tight text-blue-700 dark:text-blue-300 truncate block">
            {ticket.categoryLabel}
          </span>
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate block">
            {bookmakerLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(ticket);
          }}
          aria-label={favorited ? 'Remove ticket from favorites' : 'Save ticket to favorites'}
          className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
            favorited
              ? 'bg-amber-50 border-amber-300 text-amber-600 dark:bg-amber-500/15 dark:border-amber-400/30 dark:text-amber-300'
              : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-900 dark:bg-white/[0.03] dark:border-white/[0.08] dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${favorited ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Poster Hero Centerpiece */}
      <div className="px-3 py-4 sm:py-5 flex flex-col items-center justify-center text-center relative">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Combined Odds
        </span>
        <div className="mt-1 font-display font-extrabold text-3xl sm:text-4xl tracking-tight text-slate-900 dark:text-white tabular-nums group-hover:text-blue-700 dark:group-hover:text-blue-200 transition-colors">
          {ticket.actualCombinedOdds.toFixed(2)}
        </div>

        <div className="mt-2.5 flex items-center justify-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium tabular-nums">
            <Layers className="w-3 h-3 text-slate-400" />
            {ticket.selectionCount} {ticket.selectionCount === 1 ? 'Match' : 'Matches'}
          </span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className={`inline-flex items-center gap-1.5 font-mono font-semibold ${statusMeta.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
            {statusMeta.label}
          </span>
        </div>
      </div>

      {/* Structured Poster Metadata Footer */}
      <div className="bg-slate-50/90 dark:bg-[#090D16]/75 border-t border-slate-200/80 dark:border-white/[0.07] px-3 py-2.5 space-y-2">
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
          <div className="min-w-0">
            <span className="block text-[9px] uppercase tracking-wider text-slate-500">
              Ticket ID
            </span>
            <span className="font-mono text-slate-800 dark:text-slate-200 truncate block">#{shortId}</span>
          </div>
          <div className="min-w-0 text-right">
            <span className="block text-[9px] uppercase tracking-wider text-slate-500">
              Generated
            </span>
            <span className="font-mono text-slate-700 dark:text-slate-300 tabular-nums truncate block">
              {ticket.generatedDateKey}
            </span>
          </div>
          <div className="min-w-0 col-span-2 flex items-center justify-between pt-1 border-t border-slate-200/70 dark:border-white/[0.05]">
            <span className="text-[10px] text-slate-500">Kickoff</span>
            <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 tabular-nums">{kickoffSpan}</span>
          </div>
        </div>

        {/* Booking Code Availability Strip */}
        <div className="pt-1.5 border-t border-slate-200/80 dark:border-white/[0.06] flex items-center justify-between gap-2">
          {ticket.shareCode ? (
            <>
              <div className="min-w-0">
                <span className="block text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400/80">
                  Booking Code
                </span>
                <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300 truncate block">
                  {ticket.shareCode}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyCode}
                title="Copy booking code"
                className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/25 dark:border-emerald-500/30 dark:text-emerald-300 text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-between text-[10px]">
              <span className="text-slate-500">Booking Code</span>
              <span className="font-mono text-slate-500 dark:text-slate-400">
                {ticket.bookingCodeStatus === 'FAILED' ? 'Manual Slip' : 'Pending'}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
