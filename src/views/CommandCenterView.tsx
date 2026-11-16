import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  Play,
  ShieldAlert,
} from 'lucide-react';
import { AgentIcon } from '../components/AgentIcon';
import { AgentOutputCard } from '../components/AgentOutputCard';
import { FinalReportPanel } from '../components/FinalReportPanel';
import { api } from '../lib/api';
import { useSessionStream } from '../lib/useSessionStream';
import {
  AGENTS_BY_ID,
  AGENTS_CATALOG,
  ORCHESTRATION_MODES,
} from '../shared/agentsCatalog';
import type {
  HealthStatus,
  KnowledgeDocRecord,
  OrchestrationMode,
  OrchestrationSession,
} from '../shared/types';

interface CommandCenterViewProps {
  health: HealthStatus | null;
  sessions: OrchestrationSession[];
  docs: KnowledgeDocRecord[];
  activeSessionId: string | null;
  onSelectSessionId: (id: string | null) => void;
  onSessionCreated: (session: OrchestrationSession) => void;
  onRefreshGlobal: () => void;
  onNavigate: (
    page:
      | 'command'
      | 'agents'
      | 'council'
      | 'six_hats'
      | 'history'
      | 'security'
      | 'settings'
  ) => void;
}

const EXAMPLE_PROMPTS: Array<{
  label: string;
  mode: OrchestrationMode;
  prompt: string;
}> = [
  {
    label: 'Lancio Micro-SaaS B2B',
    mode: 'full',
    prompt:
      'Voglio lanciare una piattaforma SaaS per automatizzare la fatturazione elettronica di studi medici in Italia con un budget iniziale di 15.000 euro e 4 mesi di tempo. Analizza fattibilità tecnica, strategia di mercato, rischi normativi e piano operativo.',
  },
  {
    label: 'Decisione Cambio Carriera',
    mode: 'decision',
    prompt:
      'Devo decidere se lasciare il mio lavoro dipendente a tempo indeterminato (RAL 48k) per avviare un attività di consulenza indipendente entro 6 mesi avendo 20.000 euro di risparmi. Valuta dati, rischi, emozioni e alternative.',
  },
  {
    label: 'Ristrutturazione & Budget Casa',
    mode: 'debate',
    prompt:
      'Conviene installare subito un impianto fotovoltaico con accumulo da 14.000 euro sulla prima casa oppure investire quella somma in titoli di Stato e fare solo efficienza termica di base?',
  },
];

export function CommandCenterView({
  health,
  sessions,
  docs,
  activeSessionId,
  onSelectSessionId,
  onSessionCreated,
  onRefreshGlobal,
  onNavigate,
}: CommandCenterViewProps) {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<OrchestrationMode>('full');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [showDocsPicker, setShowDocsPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAllAgentOutputs, setShowAllAgentOutputs] = useState(false);

  const { session: activeSession, setSession: setActiveSession, streamError } =
    useSessionStream(activeSessionId, onRefreshGlobal);

  const activeModeInfo =
    ORCHESTRATION_MODES.find((m) => m.id === mode) ?? ORCHESTRATION_MODES[1];

  const isRunning =
    activeSession &&
    (activeSession.status === 'pending' ||
      activeSession.status === 'running' ||
      activeSession.status === 'verifying' ||
      activeSession.status === 'synthesizing');

  async function handleLaunch() {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await api.startSession({
        prompt: prompt.trim(),
        mode,
        contextDocIds: selectedDocIds,
      });
      onSelectSessionId(created.id);
      onSessionCreated(created);
      onRefreshGlobal();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Impossibile avviare la sessione.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function toggleDoc(id: string) {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const runningAgentsCount =
    activeSession?.agentRuns?.filter((r) => r.status === 'running').length ?? 0;
  const completedSessionsCount = sessions.filter(
    (s) => s.status === 'completed'
  ).length;

  return (
    <div className="space-y-6">
      {!health?.apiKeyConfigured && health !== null && (
        <div className="p-4 rounded-lg border border-amber-300 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <span className="font-semibold">Configurazione Gemini API richiesta:</span>{' '}
            la variabile d’ambiente <code className="font-mono">GEMINI_API_KEY</code> non risulta impostata sul server. Configurala nel pannello{' '}
            <span className="font-semibold">Settings &gt; Secrets</span> per eseguire analisi reali con i 16 agenti.
          </div>
        </div>
      )}

      {/* Central Composer */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 text-balance">
              AI Chief Orchestrator · Centro di Comando
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Invia una richiesta complessa, un progetto o una decisione: l’orchestratore coordina fino a 16 agenti specializzati.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => {
                  setPrompt(ex.prompt);
                  setMode(ex.mode);
                }}
                className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5 Modes Selector */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Modalità Operativa dell’Orchestratore
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {ORCHESTRATION_MODES.map((m) => {
              const selected = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`text-left px-3.5 py-2.5 rounded-md border text-xs transition-colors ${
                    selected
                      ? 'border-sky-600 dark:border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-100 font-semibold'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="truncate">{m.shortLabel}</div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {activeModeInfo.description}
          </p>
        </div>

        {/* Textarea */}
        <div className="space-y-2">
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descrivi il problema, l’obiettivo, i dati disponibili o la decisione da valutare..."
            className="w-full px-4 py-3 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowDocsPicker((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <FileText className="w-3.5 h-3.5" />
                Documenti Allegati ({selectedDocIds.length})
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
                Knowledge Manager & Analysis Agent leggeranno i documenti selezionati
              </span>
            </div>

            <button
              type="button"
              onClick={handleLaunch}
              disabled={submitting || !prompt.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Avvia Analisi
            </button>
          </div>

          {showDocsPicker && (
            <div className="mt-3 p-4 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Seleziona documenti dalla Knowledge Base
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('security')}
                  className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
                >
                  Gestisci Documenti
                </button>
              </div>
              {docs.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nessun documento salvato. Aggiungine uno nella sezione Sicurezza &amp; Audit → Knowledge Base.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {docs.map((doc) => {
                    const checked = selectedDocIds.includes(doc.id);
                    return (
                      <label
                        key={doc.id}
                        className="flex items-center gap-2.5 p-2 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 cursor-pointer text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDoc(doc.id)}
                          className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                          {doc.title}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {(submitError || streamError) && (
            <div className="mt-2 p-3 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
              {submitError || streamError}
            </div>
          )}
        </div>
      </section>

      {/* Compact 4-Column Operational KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Agenti Disponibili
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {AGENTS_CATALOG.length} / 16
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            3 divisioni operative
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Stato Orchestratore
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            {isRunning ? (
              <>
                <Loader2 className="w-5 h-5 text-sky-500 animate-spin" />
                <span className="text-lg">Attivo ({runningAgentsCount})</span>
              </>
            ) : (
              <span className="text-lg">Pronto</span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {health?.apiKeyConfigured ? 'Gemini API connessa' : 'In attesa di chiave API'}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Analisi Completate
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {completedSessionsCount}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {sessions.length} sessioni totali salvate
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Controllo Umano
          </div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {health?.pendingApprovalsCount ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Richieste critiche in sospeso
          </div>
        </div>
      </section>

      {/* Active / Selected Session Monitor */}
      {activeSession && (
        <section className="space-y-5">
          {/* Status & Progress Bar */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  Sessione {activeSession.id} · Modalità {activeSession.mode}
                </div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {activeSession.title}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <SessionStatusLabel status={activeSession.status} />
                {activeSession.mode === 'council16' && (
                  <button
                    type="button"
                    onClick={() => onNavigate('council')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0"
                  >
                    Apri vista Consiglio
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {activeSession.approvals && activeSession.approvals.length > 0 && (
              <div className="p-4 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 dark:text-amber-200">
                    <span className="font-semibold">
                      Richiesta autorizzazione umana ({activeSession.approvals.length}):
                    </span>{' '}
                    {activeSession.approvals[0].description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('security')}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600 hover:bg-amber-700 text-white whitespace-nowrap shrink-0"
                >
                  Gestisci Approvazioni
                </button>
              </div>
            )}

            {/* Agent Execution Grid + Inter-Agent Messages */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
                  Stato Agenti Coinvolti ({activeSession.agentRuns?.length ?? 0})
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                  {(!activeSession.agentRuns ||
                    activeSession.agentRuns.length === 0) && (
                    <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
                      Pianificazione routing dell’orchestratore in corso...
                    </div>
                  )}
                  {activeSession.agentRuns?.map((run) => {
                    const agent = AGENTS_BY_ID[run.agentId];
                    return (
                      <div
                        key={run.id}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white dark:bg-slate-900 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AgentIcon
                            iconName={agent?.iconName ?? 'Cpu'}
                            className="w-4 h-4 text-slate-500 shrink-0"
                          />
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {agent?.name ?? run.agentId}
                          </span>
                          <span className="text-slate-400 font-mono">
                            R{run.round}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                          {run.status === 'completed' && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Completato · {(run.durationMs / 1000).toFixed(1)}s
                            </span>
                          )}
                          {run.status === 'running' && (
                            <span className="text-sky-600 dark:text-sky-400 inline-flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              In esecuzione
                            </span>
                          )}
                          {run.status === 'queued' && (
                            <span className="text-slate-400">In attesa</span>
                          )}
                          {run.status === 'error' && (
                            <span className="text-red-600 dark:text-red-400">
                              Errore
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
                  Comunicazione Strutturata &amp; Timeline ({activeSession.messages?.length ?? 0})
                </h3>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md">
                  {(!activeSession.messages ||
                    activeSession.messages.length === 0) && (
                    <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
                      In attesa dei primi messaggi dell’orchestratore...
                    </div>
                  )}
                  {activeSession.messages?.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-3 bg-white dark:bg-slate-900 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-slate-500 dark:text-slate-400 font-mono">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                          <MessageSquare className="w-3 h-3" />
                          {msg.senderId} → {msg.receiverId}
                        </span>
                        <span className="tabular-nums">
                          {new Date(msg.createdAt).toLocaleTimeString('it-IT', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {activeSession.errorMessage && (
              <div className="p-3.5 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
                <span className="font-semibold">Errore sessione:</span>{' '}
                {activeSession.errorMessage}
              </div>
            )}
          </div>

          {/* 9-Section Final Report */}
          {activeSession.finalReport && (
            <FinalReportPanel
              session={activeSession}
              onSessionUpdated={(updated) => {
                setActiveSession(updated);
                onRefreshGlobal();
              }}
            />
          )}

          {/* Individual Structured Agent Outputs */}
          {activeSession.agentRuns &&
            activeSession.agentRuns.some((r) => r.output) && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowAllAgentOutputs((v) => !v)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  {showAllAgentOutputs ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  {showAllAgentOutputs
                    ? 'Nascondi Analisi Individuali degli Agenti'
                    : `Mostra Tutte le Analisi Individuali (${
                        activeSession.agentRuns.filter((r) => r.output).length
                      })`}
                </button>

                {showAllAgentOutputs && (
                  <div className="grid grid-cols-1 gap-4">
                    {activeSession.agentRuns
                      .filter((r) => r.output || r.errorMessage)
                      .map((run) => (
                        <AgentOutputCard key={run.id} run={run} />
                      ))}
                  </div>
                )}
              </div>
            )}
        </section>
      )}

      {/* Recent Activity & History Table */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Ultime Attività e Cronologia Analisi
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline whitespace-nowrap shrink-0"
          >
            Vedi tutto lo storico
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Nessuna analisi eseguita finora
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Inserisci una richiesta nel campo centrale qui sopra oppure seleziona uno dei casi d’uso rapidi per avviare il sistema multi-agente.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sessions.slice(0, 6).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSessionId(s.id)}
                className={`w-full text-left px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                  activeSessionId === s.id
                    ? 'bg-sky-50/60 dark:bg-sky-950/20'
                    : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {s.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                    {s.mode} · {s.selectedAgents.length} agenti ·{' '}
                    {new Date(s.createdAt).toLocaleString('it-IT', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <SessionStatusLabel status={s.status} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function SessionStatusLabel({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Completata
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 whitespace-nowrap shrink-0">
        <AlertCircle className="w-3.5 h-3.5" />
        Errore
      </span>
    );
  }
  if (
    status === 'running' ||
    status === 'verifying' ||
    status === 'synthesizing'
  ) {
    const label =
      status === 'verifying'
        ? 'Verifica'
        : status === 'synthesizing'
          ? 'Sintesi Finale'
          : 'In Esecuzione';
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 whitespace-nowrap shrink-0">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
      <Clock className="w-3.5 h-3.5" />
      In Attesa
    </span>
  );
}
