import { useState } from 'react';
import { Download, FileText, Search, Trash2, X } from 'lucide-react';
import { AgentOutputCard } from '../components/AgentOutputCard';
import { FinalReportPanel } from '../components/FinalReportPanel';
import { api, sessionToMarkdown, triggerFileDownload } from '../lib/api';
import { AGENTS_BY_ID, ORCHESTRATION_MODES } from '../shared/agentsCatalog';
import type { OrchestrationSession } from '../shared/types';
import { SessionStatusLabel } from './CommandCenterView';

interface HistoryViewProps {
  sessions: OrchestrationSession[];
  onRefreshGlobal: () => void;
}

export function HistoryView({ sessions, onRefreshGlobal }: HistoryViewProps) {
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [inspectedSession, setInspectedSession] =
    useState<OrchestrationSession | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const filtered = sessions.filter((s) => {
    if (modeFilter !== 'all' && s.mode !== modeFilter) return false;
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.prompt.toLowerCase().includes(q) ||
      (s.userDecision ?? '').toLowerCase().includes(q)
    );
  });

  async function handleInspect(id: string) {
    setLoadingDetail(true);
    try {
      const full = await api.getSession(id);
      setInspectedSession(full);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleDelete(id: string) {
    await api.deleteSession(id);
    if (inspectedSession?.id === id) setInspectedSession(null);
    onRefreshGlobal();
  }

  function handleExportCsv() {
    const headers = [
      'ID',
      'Data',
      'Titolo',
      'Modalità',
      'Stato',
      'Agenti',
      'Token',
      'Durata (s)',
      'Decisione Utente',
    ];
    const rows = filtered.map((s) => [
      s.id,
      new Date(s.createdAt).toISOString(),
      `"${s.title.replace(/"/g, '""')}"`,
      s.mode,
      s.status,
      String(s.selectedAgents.length),
      String(s.totalTokens),
      (s.durationMs / 1000).toFixed(1),
      `"${(s.userDecision ?? '').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerFileDownload(
      `storico-command-center-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Storico Analisi e Decisioni
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Consulta, filtra ed esporta tutte le sessioni multi-agente eseguite e le decisioni registrate.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Esporta CSV ({filtered.length})
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per testo richiesta, titolo o decisione..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value)}
          aria-label="Filtra per modalità"
          className="text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
        >
          <option value="all">Tutte le modalità</option>
          {ORCHESTRATION_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.shortLabel}
            </option>
          ))}
          <option value="six_hats">Sei Cappelli</option>
          <option value="single_test">Test Singolo</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtra per stato"
          className="text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
        >
          <option value="all">Tutti gli stati</option>
          <option value="completed">Completate</option>
          <option value="running">In esecuzione</option>
          <option value="failed">Con errore</option>
        </select>
      </div>

      {/* Sessions Table */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
            Nessuna sessione trovata nello storico con i filtri selezionati.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 font-medium">Data</th>
                  <th className="py-3 px-4 font-medium">Richiesta / Titolo</th>
                  <th className="py-3 px-4 font-medium">Modalità</th>
                  <th className="py-3 px-4 text-right font-medium">Agenti</th>
                  <th className="py-3 px-4 text-right font-medium">Token</th>
                  <th className="py-3 px-4 text-right font-medium">Durata</th>
                  <th className="py-3 px-4 font-medium">Stato</th>
                  <th className="py-3 px-4 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(s.createdAt).toLocaleString('it-IT', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <button
                        type="button"
                        onClick={() => handleInspect(s.id)}
                        className="text-left font-medium text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 truncate block w-full"
                      >
                        {s.title}
                      </button>
                      {s.userDecision && (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                          Decisione: {s.userDecision}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {s.mode}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {s.selectedAgents.length}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {s.totalTokens.toLocaleString('it-IT')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {(s.durationMs / 1000).toFixed(1)}s
                    </td>
                    <td className="py-3 px-4">
                      <SessionStatusLabel status={s.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleInspect(s.id)}
                          className="text-sky-600 dark:text-sky-400 hover:underline font-medium"
                        >
                          Apri
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id)}
                          aria-label={`Elimina sessione ${s.title}`}
                          className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspected Session Detail */}
      {loadingDetail && (
        <div className="p-6 text-center text-xs text-slate-500">
          Caricamento dettagli sessione...
        </div>
      )}

      {inspectedSession && !loadingDetail && (
        <div className="space-y-4 pt-2">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {inspectedSession.id} · {inspectedSession.mode}
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {inspectedSession.title}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    triggerFileDownload(
                      `sessione-${inspectedSession.id}.md`,
                      sessionToMarkdown(inspectedSession),
                      'text/markdown;charset=utf-8'
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Markdown
                </button>
                <button
                  type="button"
                  onClick={() => setInspectedSession(null)}
                  aria-label="Chiudi dettaglio sessione"
                  className="p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Richiesta Originale
              </div>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line">
                {inspectedSession.prompt}
              </p>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              Agenti coinvolti:{' '}
              {inspectedSession.selectedAgents
                .map((id) => AGENTS_BY_ID[id]?.name ?? id)
                .join(' · ')}
            </div>
          </div>

          {inspectedSession.finalReport && (
            <FinalReportPanel
              session={inspectedSession}
              onSessionUpdated={(updated) => {
                setInspectedSession(updated);
                onRefreshGlobal();
              }}
            />
          )}

          {inspectedSession.agentRuns && inspectedSession.agentRuns.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Risposte Individuali degli Agenti ({inspectedSession.agentRuns.length})
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {inspectedSession.agentRuns.map((run) => (
                  <AgentOutputCard key={run.id} run={run} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
