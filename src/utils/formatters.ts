export function formatTzs(amount: number): string {
  if (!Number.isFinite(amount)) return 'TZS 0';
  return `TZS ${Math.round(amount).toLocaleString('en-US')}`;
}

export function formatOdds(odds: number): string {
  if (!Number.isFinite(odds) || odds <= 0) return '—';
  return odds.toFixed(2);
}

export function formatKickoffDate(msOrIso: number | string): string {
  const date = typeof msOrIso === 'number' ? new Date(msOrIso) : new Date(msOrIso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatKickoffTime(msOrIso: number | string): string {
  const date = typeof msOrIso === 'number' ? new Date(msOrIso) : new Date(msOrIso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTimeCompact(msOrIso: number | string): string {
  const date = typeof msOrIso === 'number' ? new Date(msOrIso) : new Date(msOrIso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatKickoffDate(date.getTime())} · ${formatKickoffTime(date.getTime())}`;
}

export function getTodayInputDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function downloadJsonFile(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsvFile(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
