import { useMemo, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { AgentIcon } from '../components/AgentIcon';
import { FinalReportPanel } from '../components/FinalReportPanel';
import { api } from '../lib/api';
import { useSessionStream } from '../lib/useSessionStream';
import { AGENTS_CATALOG } from '../shared/agentsCatalog';
import type { AgentRunRecord, OrchestrationSession } from '../shared/types';

interface SixHatsViewProps {
  sessions: OrchestrationSession[];
  onSessionCreated: (session: OrchestrationSession) => void;
  onRefreshGlobal: () => void;
}

export function SixHatsView({
  sessions,
  onSessionCreated,
  onRefreshGlobal,
}: SixHatsViewProps) {
  const hatAgents = useMemo(
    () => AGENTS_CATALOG.filter((a) => a.division === 'C'),
    []
  );

  const latestHatSession = useMemo(
    () =>
      sessions.find(
        (s) => s.mode === 'six_hats' || s.mode === 'decision'
      ) ?? null,
    [sessions]
  );

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    latestHatSession?.id ?? null
  );
  const [problemPrompt, setProblemPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveSessionId = selectedSessionId ?? latestHatSession?.id ?? null;
  const { session, setSession, streamError } = useSessionStream(
    effectiveSessionId,
    onRefreshGlobal
  );

  async function handleStartSixHats() {
    if (!problemPrompt.trim() || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const created = await api.startSession({
        prompt: problemPrompt.trim(),
        mode: 'six_hats',
      });
      setSelectedSessionId(created.id);
      onSessionCreated(created);
      onRefreshGlobal();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Errore avvio sessione Sei Cappelli.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  const runByHatId = useMemo(() => {
    const map: Record<string, AgentRunRecord> = {};
    for (const r of session?.agentRuns ?? []) {
      if (hatAgents.some((h) => h.id === r.agentId)) {
        map[r.agentId] = r;
      }
    }
    return map;
  }, [session?.agentRuns, hatAgents]);

  const hatSessions = sessions.filter(
    (s) => s.mode === 'six_hats' || s.mode === 'decision'
  );
  const completedHatsCount = Object.values(runByHatId).filter(
    (r) => r.status === 'completed' && r.output
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Sei Cappelli per Pensare · Metodo Edward de Bono
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Analizza lo stesso problema attraverso sei prospettive cognitive indipendenti: fatti, emozioni, criticità, benefici, creatività e regia metodologica.
          </p>
        </div>

        {hatSessions.length > 0 && (
          <select
            value={effectiveSessionId ?? ''}
            onChange={(e) => setSelectedSessionId(e.target.value || null)}
            aria-label="Seleziona sessione Sei Cappelli"
            className="text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 max-w-xs"
          >
            {hatSessions.map((hs) => (
              <option key={hs.id} value={hs.id}>
                {hs.title} ({new Date(hs.createdAt).toLocaleDateString('it-IT')})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Problem Input */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <label
          htmlFor="six-hats-prompt"
          className="block text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          Problema o idea da sottoporre ai Sei Cappelli
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <textarea
            id="six-hats-prompt"
            rows={2}
            value={problemPrompt}
            onChange={(e) => setProblemPrompt(e.target.value)}
            placeholder="Es. Introdurre la settimana lavorativa corta (4 giorni) nel nostro team di 18 persone..."
            className="flex-1 px-3.5 py-2.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="button"
            onClick={handleStartSixHats}
            disabled={submitting || !problemPrompt.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0 self-end sm:self-stretch"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Avvia Sessione Sei Cappelli
          </button>
        </div>

        {(errorMsg || streamError) && (
          <div className="p-3 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
            {errorMsg || streamError}
          </div>
        )}
      </section>

      {/* 6 Colored Hats Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {hatAgents.map((hat) => {
          const run = runByHatId[hat.id];
          const meta = hat.hatMeta!;
          return (
            <div
              key={hat.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col"
            >
              <div className={`h-1.5 w-full ${meta.topLineClass}`} />
              <div className="p-5 space-y-3 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${meta.accentBgClass} ${meta.accentTextClass}`}
                    >
                      <AgentIcon iconName={hat.iconName} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        Cappello {meta.colorName} · {hat.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {meta.perspectiveLabel}
                      </p>
                    </div>
                  </div>
                  {run?.output && (
                    <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
                      {run.output.confidenceLevel}%
                    </span>
                  )}
                </div>

                {run?.status === 'running' && (
                  <div className="py-6 flex items-center justify-center gap-2 text-xs text-sky-600 dark:text-sky-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Elaborazione prospettiva {meta.colorName}...
                  </div>
                )}

                {run?.status === 'queued' && (
                  <div className="py-6 text-center text-xs text-slate-400">
                    In attesa del proprio turno nella sessione...
                  </div>
                )}

                {run?.status === 'error' && (
                  <div className="text-xs text-red-600 dark:text-red-400">
                    {run.errorMessage || 'Errore esecuzione cappello.'}
                  </div>
                )}

                {run?.output ? (
                  <div className="space-y-3 flex-1 text-xs">
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                      {run.output.analysis}
                    </p>
                    {run.output.recommendations.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Punti chiave &amp; Raccomandazioni
                        </div>
                        <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                          {run.output.recommendations.slice(0, 3).map((rec, i) => (
                            <li key={i}>• {rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  !run && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {hat.description}
                    </p>
                  )
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Comparative Matrix of the 6 Perspectives */}
      {completedHatsCount > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Matrice Comparativa delle Sei Prospettive
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Confronto strutturato tra fatti, intuizioni, rischi, opportunità, creatività e sintesi metodologica.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 font-medium">Cappello</th>
                  <th className="py-3 px-4 font-medium">Prospettiva</th>
                  <th className="py-3 px-4 font-medium">Evidenze / Punti Chiave</th>
                  <th className="py-3 px-4 font-medium">Criticità / Limiti</th>
                  <th className="py-3 px-4 font-medium">Raccomandazione Principale</th>
                  <th className="py-3 px-4 text-right font-medium">Confidenza</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {hatAgents.map((hat) => {
                  const run = runByHatId[hat.id];
                  const o = run?.output;
                  if (!o) return null;
                  return (
                    <tr key={hat.id} className="align-top hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {hat.hatMeta?.colorName} ({hat.name})
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {hat.hatMeta?.perspectiveLabel}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 min-w-[200px]">
                        {o.evidence[0] || o.relevantInfo[0] || o.analysis.slice(0, 110)}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 min-w-[180px]">
                        {o.criticalIssues[0] || o.missingInfo[0] || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 min-w-[200px]">
                        {o.recommendations[0] || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {o.confidenceLevel}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {session?.finalReport && (
        <FinalReportPanel
          session={session}
          onSessionUpdated={(updated) => {
            setSession(updated);
            onRefreshGlobal();
          }}
        />
      )}
    </div>
  );
}
