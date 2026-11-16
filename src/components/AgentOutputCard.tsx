import { AGENTS_BY_ID } from '../shared/agentsCatalog';
import type { AgentRunRecord } from '../shared/types';
import { AgentIcon } from './AgentIcon';

interface AgentOutputCardProps {
  run: AgentRunRecord;
  compact?: boolean;
}

export function AgentOutputCard({ run, compact = false }: AgentOutputCardProps) {
  const agent = AGENTS_BY_ID[run.agentId];
  const output = run.output;

  if (!output) {
    return (
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {agent && <AgentIcon iconName={agent.iconName} className="w-4 h-4 text-slate-500 shrink-0" />}
            <span className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
              {agent?.name ?? run.agentId}
            </span>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {run.status === 'error' ? 'Errore' : run.status}
          </span>
        </div>
        {run.errorMessage && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {run.errorMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
      {agent?.hatMeta && (
        <div className={`h-1 w-full ${agent.hatMeta.topLineClass}`} />
      )}
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-700 dark:text-slate-200">
              <AgentIcon iconName={agent?.iconName ?? 'Cpu'} className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {output.agentName}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {output.agentId} · Round {run.round} · {run.modelUsed} · {(run.durationMs / 1000).toFixed(1)}s
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-slate-500 dark:text-slate-400">Confidenza</div>
            <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {output.confidenceLevel}%
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Obiettivo
          </div>
          <p className="text-sm text-slate-800 dark:text-slate-200">
            {output.objective}
          </p>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Analisi
          </div>
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">
            {output.analysis}
          </p>
        </div>

        {!compact && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <FieldList title="Informazioni rilevanti" items={output.relevantInfo} />
            <FieldList title="Evidenze" items={output.evidence} />
            <FieldList title="Ipotesi" items={output.hypotheses} />
            <FieldList title="Criticità" items={output.criticalIssues} tone="warning" />
            <FieldList title="Raccomandazioni" items={output.recommendations} tone="accent" />
            <FieldList title="Informazioni mancanti" items={output.missingInfo} />
          </div>
        )}

        {output.proposedSensitiveAction?.required && (
          <div className="p-3 rounded-md border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200">
            <span className="font-semibold">Azione critica bloccata per sicurezza:</span>{' '}
            {output.proposedSensitiveAction.description} (Impatto: {output.proposedSensitiveAction.impact})
          </div>
        )}
      </div>
    </div>
  );
}

function FieldList({
  title,
  items,
  tone = 'neutral',
}: {
  title: string;
  items: string[];
  tone?: 'neutral' | 'warning' | 'accent';
}) {
  const titleColor =
    tone === 'warning'
      ? 'text-amber-700 dark:text-amber-400'
      : tone === 'accent'
        ? 'text-sky-700 dark:text-sky-400'
        : 'text-slate-500 dark:text-slate-400';

  return (
    <div>
      <div className={`text-xs font-medium mb-1.5 ${titleColor}`}>{title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">Nessun elemento segnalato</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              • {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
