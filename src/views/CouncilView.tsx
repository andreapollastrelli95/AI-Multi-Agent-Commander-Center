import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Play,
} from 'lucide-react';
import { AgentIcon } from '../components/AgentIcon';
import { AgentOutputCard } from '../components/AgentOutputCard';
import { FinalReportPanel } from '../components/FinalReportPanel';
import { api } from '../lib/api';
import { useSessionStream } from '../lib/useSessionStream';
import { AGENTS_CATALOG } from '../shared/agentsCatalog';
import type { AgentRunRecord, OrchestrationSession } from '../shared/types';

interface CouncilViewProps {
  sessions: OrchestrationSession[];
  onSessionCreated: (session: OrchestrationSession) => void;
  onRefreshGlobal: () => void;
}

export function CouncilView({
  sessions,
  onSessionCreated,
  onRefreshGlobal,
}: CouncilViewProps) {
  const latestCouncil = useMemo(
    () => sessions.find((s) => s.mode === 'council16') ?? null,
    [sessions]
  );

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    latestCouncil?.id ?? null
  );
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inspectedAgentId, setInspectedAgentId] = useState<string | null>(null);

  const effectiveSessionId = selectedSessionId ?? latestCouncil?.id ?? null;
  const { session, setSession, streamError } = useSessionStream(
    effectiveSessionId,
    onRefreshGlobal
  );

  async function handleStartCouncil() {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    setInspectedAgentId(null);
    try {
      const created = await api.startSession({
        prompt: prompt.trim(),
        mode: 'council16',
      });
      setSelectedSessionId(created.id);
      onSessionCreated(created);
      onRefreshGlobal();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Errore avvio Consiglio dei 16 Agenti.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Latest run per agent (handles follow-up round 3 updates cleanly)
  const latestRunByAgent = useMemo(() => {
    const map: Record<string, AgentRunRecord> = {};
    for (const run of session?.agentRuns ?? []) {
      const existing = map[run.agentId];
      if (!existing || run.round >= existing.round) {
        map[run.agentId] = run;
      }
    }
    return map;
  }, [session?.agentRuns]);

  const completedCount = Object.values(latestRunByAgent).filter(
    (r) => r.status === 'completed'
  ).length;
  const runningCount = Object.values(latestRunByAgent).filter(
    (r) => r.status === 'running'
  ).length;
  const queuedCount = Object.values(latestRunByAgent).filter(
    (r) => r.status === 'queued'
  ).length;
  const errorCount = Object.values(latestRunByAgent).filter(
    (r) => r.status === 'error'
  ).length;

  const councilSessions = sessions.filter((s) => s.mode === 'council16');
  const inspectedRuns = inspectedAgentId
    ? (session?.agentRuns ?? []).filter((r) => r.agentId === inspectedAgentId)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Consiglio Direttivo dei 16 Agenti
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Tutti e 16 gli agenti analizzano la questione in parallelo, seguiti dall’audit del Verification Agent, eventuali approfondimenti e sintesi finale.
          </p>
        </div>

        {councilSessions.length > 0 && (
          <select
            value={effectiveSessionId ?? ''}
            onChange={(e) => {
              setSelectedSessionId(e.target.value || null);
              setInspectedAgentId(null);
            }}
            aria-label="Seleziona sessione Consiglio dei 16"
            className="text-xs px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 max-w-xs"
          >
            {councilSessions.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.title} ({new Date(cs.createdAt).toLocaleDateString('it-IT')})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Launch Bar */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <label
          htmlFor="council-prompt"
          className="block text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          Convoca il Consiglio Plenaria su una questione strategica o complessa
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <textarea
            id="council-prompt"
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Es. Valutazione completa dell'espansione aziendale sul mercato DACH nel 2027..."
            className="flex-1 px-3.5 py-2.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="button"
            onClick={handleStartCouncil}
            disabled={submitting || !prompt.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0 self-end sm:self-stretch"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Convoca i 16 Agenti
          </button>
        </div>

        {(errorMsg || streamError) && (
          <div className="p-3 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
            {errorMsg || streamError}
          </div>
        )}
      </section>

      {/* Council Telemetry Summary */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Attivi ora</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-sky-600 dark:text-sky-400 mt-0.5">
            {runningCount}
          </div>
        </div>
        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">In attesa</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-300 mt-0.5">
            {queuedCount}
          </div>
        </div>
        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Completati</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
            {completedCount} / 16
          </div>
        </div>
        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Errori</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-red-600 dark:text-red-400 mt-0.5">
            {errorCount}
          </div>
        </div>
      </section>

      {/* 16 Council Members Boardroom Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {AGENTS_CATALOG.map((agent) => {
          const run = latestRunByAgent[agent.id];
          const isInspected = inspectedAgentId === agent.id;
          const status = run?.status ?? 'idle';

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() =>
                setInspectedAgentId(isInspected ? null : agent.id)
              }
              className={`text-left rounded-lg border transition-colors bg-white dark:bg-slate-900 overflow-hidden flex flex-col justify-between ${
                isInspected
                  ? 'border-sky-600 dark:border-sky-400 ring-1 ring-sky-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {agent.hatMeta && (
                <div className={`h-1 w-full ${agent.hatMeta.topLineClass}`} />
              )}
              <div className="p-4 space-y-2.5 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
                      <AgentIcon iconName={agent.iconName} className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {agent.number.toString().padStart(2, '0')}. {agent.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        Div. {agent.division} · {agent.shortRole}
                      </div>
                    </div>
                  </div>
                </div>

                {run?.output ? (
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                    {run.output.analysis}
                  </p>
                ) : run?.errorMessage ? (
                  <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2">
                    {run.errorMessage}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-2">
                    {agent.description}
                  </p>
                )}
              </div>

              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                <CouncilMemberStatus status={status} />
                {run?.output ? (
                  <span className="text-slate-600 dark:text-slate-400">
                    Conf. {run.output.confidenceLevel}%
                  </span>
                ) : (
                  <span className="text-slate-400">
                    {run ? `R${run.round}` : 'Pronto'}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Inspected Council Member Detail */}
      {inspectedAgentId && inspectedRuns.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Dettaglio Contributo Membro del Consiglio
            </h3>
            <button
              type="button"
              onClick={() => setInspectedAgentId(null)}
              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Chiudi dettaglio
            </button>
          </div>
          {inspectedRuns.map((r) => (
            <AgentOutputCard key={r.id} run={r} />
          ))}
        </section>
      )}

      {/* Activity & Inter-Agent Audit Feed */}
      {session && session.messages && session.messages.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Registro Attività del Consiglio e Richieste di Approfondimento ({session.messages.length})
          </h3>
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {session.messages.map((m) => (
              <div key={m.id} className="py-2.5 text-xs flex items-start justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <div className="font-mono text-slate-700 dark:text-slate-300 font-medium flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>
                      {m.senderId} → {m.receiverId}
                    </span>
                    <span className="text-slate-400">({m.messageType})</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">{m.content}</p>
                </div>
                <span className="font-mono tabular-nums text-slate-400 shrink-0">
                  R{m.round}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Final Synthesis */}
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

function CouncilMemberStatus({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Completato
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        In esecuzione
      </span>
    );
  }
  if (status === 'queued') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
        <Clock className="w-3.5 h-3.5" />
        In coda
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
        <AlertCircle className="w-3.5 h-3.5" />
        Errore
      </span>
    );
  }
  return <span className="text-slate-400">In attesa</span>;
}
