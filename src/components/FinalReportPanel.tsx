import { useState } from 'react';
import { Check, Download, FileText } from 'lucide-react';
import { api, sessionToMarkdown, triggerFileDownload } from '../lib/api';
import type { OrchestrationSession } from '../shared/types';

interface FinalReportPanelProps {
  session: OrchestrationSession;
  onSessionUpdated?: (updated: OrchestrationSession) => void;
}

export function FinalReportPanel({
  session,
  onSessionUpdated,
}: FinalReportPanelProps) {
  const report = session.finalReport;
  const [decisionDraft, setDecisionDraft] = useState(session.userDecision ?? '');
  const [savingDecision, setSavingDecision] = useState(false);
  const [decisionSavedMsg, setDecisionSavedMsg] = useState<string | null>(null);

  if (!report) return null;

  async function handleSaveDecision() {
    if (!decisionDraft.trim()) return;
    setSavingDecision(true);
    setDecisionSavedMsg(null);
    try {
      const updated = await api.recordDecision(session.id, decisionDraft.trim());
      onSessionUpdated?.(updated);
      setDecisionSavedMsg('Decisione registrata nello storico e nel registro di audit.');
    } catch (err) {
      setDecisionSavedMsg(
        err instanceof Error ? err.message : 'Errore salvataggio decisione.'
      );
    } finally {
      setSavingDecision(false);
    }
  }

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Report Finale Unificato (9 Sezioni)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
            {session.selectedAgents.length} agenti · {session.totalTokens.toLocaleString('it-IT')} token · {(session.durationMs / 1000).toFixed(1)}s
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              triggerFileDownload(
                `report-${session.id}.md`,
                sessionToMarkdown(session),
                'text/markdown;charset=utf-8'
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            Esporta Markdown
          </button>
          <button
            type="button"
            onClick={() =>
              triggerFileDownload(
                `report-${session.id}.json`,
                JSON.stringify(session, null, 2),
                'application/json'
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Esporta JSON
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-200 dark:divide-slate-800">
        {/* 1. Sintesi esecutiva */}
        <section className="p-6">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
            01. Sintesi Esecutiva
          </h4>
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">
            {report.executiveSummary}
          </p>
        </section>

        {/* 2. Analisi degli agenti */}
        <section className="p-6">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            02. Analisi degli Agenti
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-4 font-medium">Agente</th>
                  <th className="py-2 pr-4 font-medium">Contributo Chiave</th>
                  <th className="py-2 text-right font-medium">Confidenza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {report.agentAnalysesSummary.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 pr-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {item.agentName}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300 leading-relaxed">
                      {item.keyTakeaway}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {item.confidenceLevel}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3 & 4. Accordo e Disaccordo */}
        <section className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
              03. Punti di Accordo
            </h4>
            <ReportList items={report.pointsOfAgreement} emptyLabel="Nessuna convergenza rilevata" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
              04. Punti di Disaccordo
            </h4>
            <ReportList items={report.pointsOfDisagreement} emptyLabel="Nessun disaccordo significativo" />
          </div>
        </section>

        {/* 5, 6 & 7. Rischi, Opportunità, Alternative */}
        <section className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">
              05. Rischi
            </h4>
            <ReportList items={report.risks} emptyLabel="Nessun rischio segnalato" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
              06. Opportunità
            </h4>
            <ReportList items={report.opportunities} emptyLabel="Nessuna opportunità segnalata" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-sky-700 dark:text-sky-400 mb-2">
              07. Alternative
            </h4>
            <ReportList items={report.alternatives} emptyLabel="Nessuna alternativa segnalata" />
          </div>
        </section>

        {/* 8. Raccomandazione Finale */}
        <section className="p-6">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
            08. Raccomandazione Finale
          </h4>
          <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line">
            {report.finalRecommendation}
          </p>
          {report.uncertainties && report.uncertainties.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Elementi che rimangono incerti
              </div>
              <ReportList items={report.uncertainties} emptyLabel="" />
            </div>
          )}
        </section>

        {/* 9. Piano Operativo */}
        <section className="p-6">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            09. Piano Operativo
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-medium">#</th>
                  <th className="py-2 pr-4 font-medium">Azione Operativa</th>
                  <th className="py-2 pr-4 font-medium">Responsabile</th>
                  <th className="py-2 pr-4 font-medium">Priorità</th>
                  <th className="py-2 text-right font-medium">Orizzonte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {report.operationalPlan.map((step, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {step.step}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-800 dark:text-slate-200">
                      {step.action}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {step.ownerAgent}
                    </td>
                    <td className="py-2.5 pr-4 font-medium whitespace-nowrap">
                      <span
                        className={
                          step.priority === 'Alta'
                            ? 'text-red-600 dark:text-red-400'
                            : step.priority === 'Media'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-400'
                        }
                      >
                        {step.priority}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {step.timeframe}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Decision Mode User Authority Block */}
        {(session.mode === 'decision' || session.userDecision) && (
          <section className="p-6 bg-slate-50/70 dark:bg-slate-950/50">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Decisione Finale dell’Utente
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              {report.userOwnsDecisionNote ||
                'La decisione definitiva appartiene sempre all’utente. Registra la scelta adottata per conservarla nello storico.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={decisionDraft}
                onChange={(e) => setDecisionDraft(e.target.value)}
                placeholder="Es. Procedo con lo Scenario B con budget limitato a 30 giorni..."
                className="flex-1 px-3 py-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="button"
                onClick={handleSaveDecision}
                disabled={savingDecision || !decisionDraft.trim()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                {savingDecision ? 'Salvataggio...' : 'Registra Decisione'}
              </button>
            </div>
            {decisionSavedMsg && (
              <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                {decisionSavedMsg}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function ReportList({
  items,
  emptyLabel,
}: {
  items: string[];
  emptyLabel: string;
}) {
  if (!items || items.length === 0) {
    return emptyLabel ? (
      <p className="text-xs text-slate-400 dark:text-slate-500">{emptyLabel}</p>
    ) : null;
  }
  return (
    <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
      {items.map((item, idx) => (
        <li key={idx}>• {item}</li>
      ))}
    </ul>
  );
}
