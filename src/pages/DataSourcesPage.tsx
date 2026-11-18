import { CheckCircle2, ExternalLink, ShieldCheck } from 'lucide-react';
import { useOddsHunter } from '../hooks/useOddsHunter.tsx';

export function DataSourcesPage() {
  const { activeBookmakerInfo, researchReport } = useOddsHunter();

  if (!researchReport) {
    return (
      <div className="p-8 text-sm text-slate-500 dark:text-slate-400">
        Loading technical integration report...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {activeBookmakerInfo.name} Data Sources &amp; Research Report
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Empirically verified endpoint inventory, payload formats, and booking-code
            integration analysis.
          </p>
        </div>

        <a
          href={researchReport.targetWebsite}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#161F30] dark:hover:bg-[#1E293B] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white"
        >
          <span>Official Target</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-5 space-y-3 shadow-xs dark:shadow-none">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Technical Findings Summary
        </h3>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {researchReport.summary}
        </p>
        <div className="pt-2 border-t border-slate-200 dark:border-white/[0.06] flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {researchReport.bookingCodeSupported
                ? 'Genuine Booking Code Creation Supported'
                : 'Manual Slip Preparation Only'}
            </span>
          </span>
          <span className="text-slate-400 dark:text-slate-500">·</span>
          <span className="text-slate-600 dark:text-slate-400 font-mono">
            {activeBookmakerInfo.bookingCodeMechanism}
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          {researchReport.bookingCodeMechanism}
        </p>
      </section>

      <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-hidden shadow-xs dark:shadow-none">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.08]">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Verified Endpoints
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/[0.08] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0B101B]/60">
                <th className="py-3 px-4 font-medium">Endpoint</th>
                <th className="py-3 px-4 font-medium">Method</th>
                <th className="py-3 px-4 font-medium">Auth</th>
                <th className="py-3 px-4 font-medium">Format &amp; Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/[0.06] text-xs">
              {researchReport.endpoints.map((ep) => (
                <tr key={ep.name}>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900 dark:text-white">{ep.name}</div>
                    <div className="font-mono text-[11px] text-slate-500 break-all mt-0.5">
                      {ep.url}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-blue-700 dark:text-blue-300">
                    {ep.method}
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                    {ep.authRequired ? 'Required' : 'Public Read / Share'}
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 space-y-1">
                    <div>{ep.purpose}</div>
                    <div className="font-mono text-[11px] text-slate-500">{ep.format}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-5 space-y-3 shadow-xs dark:shadow-none">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Integration Limitations
          </h3>
          <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
            {researchReport.limitations.map((item, i) => (
              <li key={i} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-white/[0.08] rounded-xl p-5 space-y-3 shadow-xs dark:shadow-none">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Compliance &amp; Safety Boundaries
            </h3>
          </div>
          <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
            {researchReport.complianceBoundaries.map((item, i) => (
              <li key={i} className="leading-relaxed">
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
