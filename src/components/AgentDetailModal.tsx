import { useState } from 'react';
import { Play, X } from 'lucide-react';
import { api } from '../lib/api';
import { AVAILABLE_MODELS } from '../shared/agentsCatalog';
import type {
  AgentDefinition,
  AgentRunRecord,
  GeminiModelId,
  SystemSettings,
} from '../shared/types';
import { AgentIcon } from './AgentIcon';
import { AgentOutputCard } from './AgentOutputCard';

interface AgentDetailModalProps {
  agent: AgentDefinition;
  settings: SystemSettings;
  initialFocusTest?: boolean;
  onClose: () => void;
  onSettingsUpdated: (next: SystemSettings) => void;
}

export function AgentDetailModal({
  agent,
  settings,
  initialFocusTest = false,
  onClose,
  onSettingsUpdated,
}: AgentDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'scheda' | 'test'>(
    initialFocusTest ? 'test' : 'scheda'
  );
  const [testPrompt, setTestPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [testRun, setTestRun] = useState<AgentRunRecord | null>(null);
  const [savingModel, setSavingModel] = useState(false);

  const currentModel =
    settings.agentModels[agent.id] || settings.defaultModel || agent.defaultModel;

  async function handleModelChange(modelId: GeminiModelId) {
    setSavingModel(true);
    try {
      const updated = await api.updateSettings({
        agentModels: {
          ...settings.agentModels,
          [agent.id]: modelId,
        },
      });
      onSettingsUpdated(updated);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Errore salvataggio modello.'
      );
    } finally {
      setSavingModel(false);
    }
  }

  async function handleRunTest() {
    if (!testPrompt.trim()) return;
    setRunning(true);
    setErrorMsg(null);
    setTestRun(null);
    try {
      const res = await api.testAgent(agent.id, { prompt: testPrompt.trim() });
      setTestRun(res.run);
      if (res.run.status === 'error' && res.run.errorMessage) {
        setErrorMsg(res.run.errorMessage);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Errore durante il test dell’agente.'
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-modal-title"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xl">
        {agent.hatMeta && <div className={`h-1 w-full ${agent.hatMeta.topLineClass}`} />}

        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-800 dark:text-slate-100 shrink-0">
              <AgentIcon iconName={agent.iconName} className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="agent-modal-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate"
              >
                {agent.number.toString().padStart(2, '0')}. {agent.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {agent.divisionName} · {agent.shortRole}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi scheda agente"
            className="p-2 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setActiveTab('scheda')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'scheda'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Scheda Operativa
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('test')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'test'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Test Individuale
            </button>
          </div>

          <div className="flex items-center gap-2 pb-1">
            <label
              htmlFor="agent-model-select"
              className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap"
            >
              Modello:
            </label>
            <select
              id="agent-model-select"
              value={currentModel}
              disabled={savingModel}
              onChange={(e) => handleModelChange(e.target.value as GeminiModelId)}
              className="text-xs px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'scheda' ? (
            <>
              <div>
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Obiettivo Operativo
                </h3>
                <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                  {agent.objective}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    Competenze Specialistiche
                  </h3>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {agent.competencies.map((c, idx) => (
                      <li key={idx}>• {c}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                      Strumenti Autorizzati
                    </h3>
                    <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                      {agent.authorizedTools.map((t, idx) => (
                        <li key={idx}>• {t}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
                      Azioni Vietate e Limiti di Sicurezza
                    </h3>
                    <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                      {agent.forbiddenActions.map((f, idx) => (
                        <li key={idx}>• {f}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  Prompt di Sistema Dedicato
                </h3>
                <pre className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {agent.systemPrompt}
                </pre>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="single-agent-test-prompt"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Invia una richiesta diretta a {agent.name}
                </label>
                <textarea
                  id="single-agent-test-prompt"
                  rows={4}
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  placeholder={`Scrivi uno scenario o una domanda specifica per testare le capacità di ${agent.name}...`}
                  className="w-full px-3.5 py-2.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  Modello attivo: {currentModel}
                </span>
                <button
                  type="button"
                  onClick={handleRunTest}
                  disabled={running || !testPrompt.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  {running ? 'Esecuzione in corso...' : 'Esegui Test Agente'}
                </button>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
                  {errorMsg}
                </div>
              )}

              {testRun && <AgentOutputCard run={testRun} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
