import { useState } from 'react';
import { ExternalLink, Play, Search } from 'lucide-react';
import { AgentDetailModal } from '../components/AgentDetailModal';
import { AgentIcon } from '../components/AgentIcon';
import { AGENTS_CATALOG } from '../shared/agentsCatalog';
import type {
  AgentDefinition,
  DivisionId,
  SystemSettings,
} from '../shared/types';

interface AgentsViewProps {
  settings: SystemSettings;
  onSettingsUpdated: (next: SystemSettings) => void;
}

const DIVISION_TABS: Array<{ id: 'ALL' | DivisionId; label: string }> = [
  { id: 'ALL', label: 'Tutti i 16 Agenti' },
  { id: 'A', label: 'Divisione A · Analitici (5)' },
  { id: 'B', label: 'Divisione B · Vita Quotidiana (5)' },
  { id: 'C', label: 'Divisione C · Sei Cappelli (6)' },
];

export function AgentsView({
  settings,
  onSettingsUpdated,
}: AgentsViewProps) {
  const [divisionFilter, setDivisionFilter] = useState<'ALL' | DivisionId>('ALL');
  const [query, setQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<{
    agent: AgentDefinition;
    focusTest: boolean;
  } | null>(null);

  const filtered = AGENTS_CATALOG.filter((a) => {
    if (divisionFilter !== 'ALL' && a.division !== divisionFilter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.competencies.some((c) => c.toLowerCase().includes(q))
    );
  });

  const divisionsToShow: DivisionId[] =
    divisionFilter === 'ALL' ? ['A', 'B', 'C'] : [divisionFilter];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Catalogo dei 16 Agenti Specializzati
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Ispeziona il prompt di sistema, le competenze, i limiti di sicurezza e testa singolarmente ogni agente.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca agente o competenza..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Division Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg w-fit">
        {DIVISION_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setDivisionFilter(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              divisionFilter === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Division Sections */}
      {divisionsToShow.map((divId) => {
        const agentsInDiv = filtered.filter((a) => a.division === divId);
        if (agentsInDiv.length === 0) return null;

        return (
          <section key={divId} className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-2">
              {agentsInDiv[0].divisionName}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {agentsInDiv.map((agent) => {
                const activeModel =
                  settings.agentModels[agent.id] ||
                  settings.defaultModel ||
                  agent.defaultModel;

                return (
                  <div
                    key={agent.id}
                    className="flex flex-col justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                  >
                    {agent.hatMeta && (
                      <div className={`h-1 w-full ${agent.hatMeta.topLineClass}`} />
                    )}
                    <div className="p-5 space-y-3 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
                            <AgentIcon iconName={agent.iconName} className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {agent.number.toString().padStart(2, '0')}. {agent.name}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {agent.shortRole} · Operativo
                            </p>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {agent.description}
                      </p>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Competenze principali
                        </div>
                        <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
                          {agent.competencies.slice(0, 3).map((comp, idx) => (
                            <li key={idx} className="truncate">
                              • {comp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                        {activeModel}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedAgent({ agent, focusTest: false })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Apri Agente
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedAgent({ agent, focusTest: true })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-sky-600 hover:bg-sky-700 text-white transition-colors whitespace-nowrap shrink-0"
                        >
                          <Play className="w-3 h-3" />
                          Test Agente
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <div className="p-8 text-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-500 dark:text-slate-400">
          Nessun agente corrisponde ai criteri di ricerca.
        </div>
      )}

      {selectedAgent && (
        <AgentDetailModal
          agent={selectedAgent.agent}
          settings={settings}
          initialFocusTest={selectedAgent.focusTest}
          onClose={() => setSelectedAgent(null)}
          onSettingsUpdated={onSettingsUpdated}
        />
      )}
    </div>
  );
}
