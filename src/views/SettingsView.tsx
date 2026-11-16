import { useState } from 'react';
import { Check, Download, RotateCcw, Save, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { AGENTS_CATALOG, AVAILABLE_MODELS } from '../shared/agentsCatalog';
import type {
  GeminiModelId,
  HealthStatus,
  ResponseStylePreference,
  SystemSettings,
  ThinkingLevelSetting,
} from '../shared/types';

interface SettingsViewProps {
  settings: SystemSettings;
  health: HealthStatus | null;
  onSettingsUpdated: (next: SystemSettings) => void;
  onRefreshAll: () => void;
}

export function SettingsView({
  settings,
  health,
  onSettingsUpdated,
  onRefreshAll,
}: SettingsViewProps) {
  const [draft, setDraft] = useState<SystemSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  async function handleSave() {
    setSaving(true);
    setStatusMsg(null);
    try {
      const updated = await api.updateSettings(draft);
      setDraft(updated);
      onSettingsUpdated(updated);
      setStatusMsg('Impostazioni salvate nel database locale.');
    } catch (err) {
      setStatusMsg(
        err instanceof Error ? err.message : 'Errore salvataggio impostazioni.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyDefaultToAllAgents() {
    const updatedMap: Record<string, GeminiModelId> = {};
    for (const a of AGENTS_CATALOG) {
      updatedMap[a.id] = draft.defaultModel;
    }
    setDraft((prev) => ({ ...prev, agentModels: updatedMap }));
  }

  async function handleReset() {
    setSaving(true);
    try {
      const reset = await api.resetSettings();
      setDraft(reset);
      onSettingsUpdated(reset);
      setStatusMsg('Impostazioni ripristinate ai valori predefiniti.');
    } finally {
      setSaving(false);
    }
  }

  async function handleClearHistory() {
    await api.clearHistory();
    setConfirmClearHistory(false);
    onRefreshAll();
    setStatusMsg('Storico delle sessioni svuotato.');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Impostazioni Piattaforma e Modelli AI
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Configura provider, modelli per singolo agente, parametri di generazione, limiti di esecuzione e gestione dei dati.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white transition-colors whitespace-nowrap shrink-0"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Salvataggio...' : 'Salva Configurazione'}
        </button>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Provider & Server Status */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Provider AI e Sicurezza Chiavi Server-Side
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label
              htmlFor="provider-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Provider Principale
            </label>
            <select
              id="provider-select"
              value={draft.provider}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  provider: e.target.value as SystemSettings['provider'],
                }))
              }
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="gemini">Google Gemini API (@google/genai · Attivo)</option>
              <option value="multi_provider_ready">
                Modalità Multi-Provider (Gemini attivo + Adapter estendibile)
              </option>
            </select>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
              Tutte le chiamate AI avvengono esclusivamente sul backend Node.js. Nessuna chiave viene mai esposta al browser.
            </p>
          </div>

          <div className="p-3.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-1">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Stato Credenziali Server
            </div>
            <div className="text-xs font-mono">
              {health?.apiKeyConfigured ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  GEMINI_API_KEY rilevata e attiva lato server
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">
                  GEMINI_API_KEY mancante · Configurala in Settings &gt; Secrets
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Nota: i modelli avanzati (Gemini 4 Argon / Carbon) richiedono una chiave con fatturazione abilitata.
            </p>
          </div>
        </div>
      </section>

      {/* Generation & Orchestration Parameters */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Parametri di Generazione, Esecuzione e Limiti
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div>
            <label
              htmlFor="default-model-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Modello Predefinito Orchestratore
            </label>
            <select
              id="default-model-select"
              value={draft.defaultModel}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  defaultModel: e.target.value as GeminiModelId,
                }))
              }
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.tier})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="thinking-level-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Livello di Ragionamento (Thinking)
            </label>
            <select
              id="thinking-level-select"
              value={draft.thinkingLevel}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  thinkingLevel: e.target.value as ThinkingLevelSetting,
                }))
              }
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="LOW">Basso (Latenza minima)</option>
              <option value="MEDIUM">Medio (Bilanciato)</option>
              <option value="HIGH">Alto (Analisi profonda)</option>
              <option value="XHIGH">Massimo XHIGH (Solo Gemini 4 Hydrogen)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="response-style-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Preferenza Stile Risposta
            </label>
            <select
              id="response-style-select"
              value={draft.responseStyle}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  responseStyle: e.target.value as ResponseStylePreference,
                }))
              }
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="sintetico">Sintetico (Esecutivo)</option>
              <option value="bilanciato">Bilanciato (Standard)</option>
              <option value="dettagliato">Dettagliato (Approfondito)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="execution-mode-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Modalità di Esecuzione
            </label>
            <select
              id="execution-mode-select"
              value={draft.executionMode}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  executionMode: e.target.value as SystemSettings['executionMode'],
                }))
              }
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="auto">Automatica (Parallelo + Sequenziale)</option>
              <option value="parallel_priority">Priorità Parallela</option>
              <option value="sequential_strict">Sequenziale Rigorosa (1 alla volta)</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="max-active-agents"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Max Agenti Attivi in Parallelo ({draft.maxActiveAgents})
            </label>
            <input
              id="max-active-agents"
              type="range"
              min={1}
              max={16}
              value={draft.maxActiveAgents}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  maxActiveAgents: Number(e.target.value),
                }))
              }
              className="w-full accent-sky-600"
            />
          </div>

          <div>
            <label
              htmlFor="max-iterations"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Limite Interazioni Inter-Agente ({draft.maxIterations} round)
            </label>
            <input
              id="max-iterations"
              type="range"
              min={1}
              max={4}
              value={draft.maxIterations}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  maxIterations: Number(e.target.value),
                }))
              }
              className="w-full accent-sky-600"
            />
          </div>

          <div>
            <label
              htmlFor="agent-timeout"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Timeout per Agente (secondi)
            </label>
            <input
              id="agent-timeout"
              type="number"
              min={10}
              max={120}
              value={Math.round(draft.agentTimeoutMs / 1000)}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  agentTimeoutMs: Math.max(10, Number(e.target.value)) * 1000,
                }))
              }
              className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="token-limit"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Limite Token per Sessione
            </label>
            <input
              id="token-limit"
              type="number"
              min={10000}
              max={500000}
              step={10000}
              value={draft.tokenLimitPerSession}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  tokenLimitPerSession: Math.max(10000, Number(e.target.value)),
                }))
              }
              className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label
              htmlFor="max-retries"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Retry Controllati su Errore
            </label>
            <input
              id="max-retries"
              type="number"
              min={0}
              max={4}
              value={draft.maxRetries}
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  maxRetries: Math.max(0, Math.min(4, Number(e.target.value))),
                }))
              }
              className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </section>

      {/* Per-Agent Model Assignment */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Assegnazione Modello per Singolo Agente (16 Agenti)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Personalizza il modello Gemini utilizzato da ciascun agente specialistico.
            </p>
          </div>
          <button
            type="button"
            onClick={handleApplyDefaultToAllAgents}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            Applica modello predefinito a tutti
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">#</th>
                <th className="py-2.5 px-4 font-medium">Agente</th>
                <th className="py-2.5 px-4 font-medium">Divisione</th>
                <th className="py-2.5 px-4 font-medium text-right">Modello Assegnato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {AGENTS_CATALOG.map((agent) => (
                <tr key={agent.id}>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {agent.number.toString().padStart(2, '0')}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                    {agent.name}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                    Divisione {agent.division} · {agent.shortRole}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <select
                      aria-label={`Modello per ${agent.name}`}
                      value={draft.agentModels[agent.id] || draft.defaultModel}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          agentModels: {
                            ...p.agentModels,
                            [agent.id]: e.target.value as GeminiModelId,
                          },
                        }))
                      }
                      className="text-xs px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      {AVAILABLE_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Data Management */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Gestione dei Dati Locali (SQLite)
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/export/backup"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Esporta Backup Completo (JSON)
          </a>

          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Ripristina Impostazioni Predefinite
          </button>

          {!confirmClearHistory ? (
            <button
              type="button"
              onClick={() => setConfirmClearHistory(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Cancella Storico Sessioni
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 p-1.5 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40">
              <span className="text-xs text-red-700 dark:text-red-300 px-1.5">
                Confermi cancellazione?
              </span>
              <button
                type="button"
                onClick={handleClearHistory}
                className="px-2.5 py-1 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700"
              >
                Conferma
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearHistory(false)}
                className="px-2.5 py-1 text-xs font-medium rounded text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
              >
                Annulla
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
