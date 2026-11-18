import { AlertCircle, CheckCircle2, Clock, MinusCircle, XCircle } from 'lucide-react';
import type { DiagnosticStatus } from '../types/sportybet.ts';

interface StatusLabelProps {
  status: DiagnosticStatus | 'ACTIVE' | 'EXPIRED' | 'INVALID' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'LIVE' | 'UPCOMING';
  label?: string;
}

export function StatusLabel({ status, label }: StatusLabelProps) {
  const text = label || status;

  if (status === 'CONNECTED' || status === 'ACTIVE' || status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{text}</span>
      </span>
    );
  }

  if (status === 'LIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{text}</span>
      </span>
    );
  }

  if (status === 'ERROR' || status === 'UNAVAILABLE' || status === 'EXPIRED' || status === 'INVALID' || status === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{text}</span>
      </span>
    );
  }

  if (status === 'PARTIAL') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{text}</span>
      </span>
    );
  }

  if (status === 'UPCOMING') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>{text}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
      <MinusCircle className="w-3.5 h-3.5 shrink-0" />
      <span>{text}</span>
    </span>
  );
}
