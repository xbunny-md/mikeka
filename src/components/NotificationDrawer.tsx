import { Bell, Check, Trash2, X } from 'lucide-react';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import {
  deleteNotificationRecord,
  markNotificationRead,
} from '../firebase/firestore/repository.ts';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';
import { formatDateTimeCompact } from '../utils/formatters.ts';

export function NotificationDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, cloudNotifications } = useFirebase();
  const { notifications, markLocalNotificationRead } = useOddsHunter();

  if (!open) return null;

  const items = user
    ? cloudNotifications.map((c) => ({
        id: c.id,
        type: c.type,
        title: c.title,
        message: c.message,
        read: c.read,
        createdAt:
          typeof c.createdAt === 'string'
            ? c.createdAt
            : c.createdAt && typeof c.createdAt.toDate === 'function'
              ? c.createdAt.toDate().toISOString()
              : new Date().toISOString(),
        isCloud: true,
      }))
    : notifications.map((n) => ({ ...n, isCloud: false }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 dark:bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-[#111827] border-l border-slate-200 dark:border-white/10 h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Notification Center
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            aria-label="Close notifications"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400 space-y-2">
              <p>No operational notifications recorded yet.</p>
              <p className="text-xs text-slate-500">
                Real alerts appear here when scans complete, odds shift, markets suspend, or
                booking codes are verified.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const colorClass =
                item.type === 'CODE_CREATED'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : item.type === 'INTEGRATION_ERROR' || item.type === 'MARKET_UNAVAILABLE'
                    ? 'text-red-600 dark:text-red-400'
                    : item.type === 'ODDS_SHIFT'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-blue-700 dark:text-blue-400';

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border transition-colors space-y-1.5 ${
                    item.read
                      ? 'bg-slate-50 border-slate-200/80 dark:bg-[#0B101B]/60 dark:border-white/[0.05] opacity-75'
                      : 'bg-white border-slate-200 dark:bg-[#0B101B] dark:border-white/[0.12] shadow-xs dark:shadow-none'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-xs font-semibold ${colorClass}`}>{item.title}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {!item.read && (
                        <button
                          type="button"
                          onClick={() => {
                            if (item.isCloud && user) {
                              void markNotificationRead(user.uid, item.id);
                            } else {
                              markLocalNotificationRead(item.id);
                            }
                          }}
                          title="Mark as read"
                          className="p-1 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {item.isCloud && user && (
                        <button
                          type="button"
                          onClick={() => void deleteNotificationRecord(user.uid, item.id)}
                          title="Delete notification"
                          className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.message}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500">
                    {formatDateTimeCompact(item.createdAt)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
