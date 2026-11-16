import { useCallback, useEffect, useState } from 'react';
import {
  Bot,
  Command,
  History,
  Layers,
  Menu,
  Moon,
  Settings,
  Shield,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { api } from './lib/api';
import { DEFAULT_SETTINGS } from './shared/agentsCatalog';
import type {
  ApprovalRequestRecord,
  AuditLogRecord,
  HealthStatus,
  KnowledgeDocRecord,
  OrchestrationSession,
  SystemSettings,
} from './shared/types';
import { AgentsView } from './views/AgentsView';
import { CommandCenterView } from './views/CommandCenterView';
import { CouncilView } from './views/CouncilView';
import { HistoryView } from './views/HistoryView';
import { SecurityAuditView } from './views/SecurityAuditView';
import { SettingsView } from './views/SettingsView';
import { SixHatsView } from './views/SixHatsView';

type ActivePage =
  | 'command'
  | 'agents'
  | 'council'
  | 'six_hats'
  | 'history'
  | 'security'
  | 'settings';

const NAV_ITEMS: Array<{
  id: ActivePage;
  label: string;
  breadcrumb: string;
  icon: typeof Command;
}> = [
  {
    id: 'command',
    label: 'Command Center',
    breadcrumb: 'Command Center / Panoramica Operativa',
    icon: Command,
  },
  {
    id: 'agents',
    label: 'Agenti (16)',
    breadcrumb: 'Divisioni / Catalogo 16 Agenti',
    icon: Bot,
  },
  {
    id: 'council',
    label: 'Consiglio dei 16',
    breadcrumb: 'Orchestrazione / Consiglio dei 16 Agenti',
    icon: Users,
  },
  {
    id: 'six_hats',
    label: 'Sei Cappelli',
    breadcrumb: 'Divisione C / Metodo Sei Cappelli',
    icon: Layers,
  },
  {
    id: 'history',
    label: 'Storico',
    breadcrumb: 'Archivio / Storico Sessioni',
    icon: History,
  },
  {
    id: 'security',
    label: 'Sicurezza & Audit',
    breadcrumb: 'Governance / Controllo Umano e Audit',
    icon: Shield,
  },
  {
    id: 'settings',
    label: 'Impostazioni',
    breadcrumb: 'Sistema / Configurazione Modelli e Limiti',
    icon: Settings,
  },
];

export default function App() {
  const [page, setPage] = useState<ActivePage>('command');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [sessions, setSessions] = useState<OrchestrationSession[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequestRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [docs, setDocs] = useState<KnowledgeDocRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const applyThemeClass = useCallback((theme: 'dark' | 'light') => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  const refreshGlobal = useCallback(async () => {
    try {
      const [h, s, sess, apr, logs, kDocs] = await Promise.all([
        api.getHealth(),
        api.getSettings(),
        api.listSessions(),
        api.listApprovals(),
        api.listAuditLogs(),
        api.listKnowledgeDocs(),
      ]);
      setHealth(h);
      setSettings(s);
      applyThemeClass(s.theme);
      setSessions(sess);
      setApprovals(apr);
      setAuditLogs(logs);
      setDocs(kDocs);
    } catch {
      // Keep UI usable even during transient reload
    }
  }, [applyThemeClass]);

  useEffect(() => {
    void refreshGlobal();
  }, [refreshGlobal]);

  async function toggleTheme() {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    applyThemeClass(nextTheme);
    setSettings((prev) => ({ ...prev, theme: nextTheme }));
    try {
      const updated = await api.updateSettings({ theme: nextTheme });
      setSettings(updated);
    } catch {
      // ignore
    }
  }

  function handleNavigate(target: ActivePage) {
    setPage(target);
    setMobileNavOpen(false);
  }

  const currentNav = NAV_ITEMS.find((n) => n.id === page) ?? NAV_ITEMS[0];
  const pendingCount = approvals.filter((a) => a.status === 'pending').length;

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 space-y-6">
          {/* Brand Logo */}
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <svg
                viewBox="0 0 32 32"
                className="w-7 h-7 shrink-0 text-sky-600 dark:text-sky-400"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="2"
                  y="2"
                  width="28"
                  height="28"
                  rx="6"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <circle cx="16" cy="16" r="4" fill="currentColor" />
                <path
                  d="M16 6V12M16 20V26M6 16H12M20 16H26"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">
                AI Multi-Agent Command Center
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="p-1.5 rounded-md text-slate-500 lg:hidden"
              aria-label="Chiudi menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="space-y-1" aria-label="Navigazione principale">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = page === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'security' && pendingCount > 0 && (
                    <span className="font-mono tabular-nums text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <span className="flex items-center gap-2">
              {settings.theme === 'dark' ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
              {settings.theme === 'dark' ? 'Passa a Tema Chiaro' : 'Passa a Tema Scuro'}
            </span>
          </button>

          <div className="px-1 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
            <div>
              Provider: <span className="font-medium text-slate-700 dark:text-slate-300">Google Gemini</span>
            </div>
            <div className="font-mono truncate">
              {health?.apiKeyConfigured ? 'API Server Connessa' : 'Chiave API da configurare'}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Apri menu di navigazione"
              className="p-2 -ml-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
              {currentNav.breadcrumb}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveSessionId(null);
                handleNavigate('command');
              }}
              className="px-3.5 py-1.5 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 text-white transition-colors whitespace-nowrap shrink-0"
            >
              Nuova Analisi
            </button>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {page === 'command' && (
            <CommandCenterView
              health={health}
              sessions={sessions}
              docs={docs}
              activeSessionId={activeSessionId}
              onSelectSessionId={setActiveSessionId}
              onSessionCreated={(s) =>
                setSessions((prev) => [s, ...prev.filter((x) => x.id !== s.id)])
              }
              onRefreshGlobal={refreshGlobal}
              onNavigate={handleNavigate}
            />
          )}

          {page === 'agents' && (
            <AgentsView
              settings={settings}
              onSettingsUpdated={(next) => setSettings(next)}
            />
          )}

          {page === 'council' && (
            <CouncilView
              sessions={sessions}
              onSessionCreated={(s) =>
                setSessions((prev) => [s, ...prev.filter((x) => x.id !== s.id)])
              }
              onRefreshGlobal={refreshGlobal}
            />
          )}

          {page === 'six_hats' && (
            <SixHatsView
              sessions={sessions}
              onSessionCreated={(s) =>
                setSessions((prev) => [s, ...prev.filter((x) => x.id !== s.id)])
              }
              onRefreshGlobal={refreshGlobal}
            />
          )}

          {page === 'history' && (
            <HistoryView
              sessions={sessions}
              onRefreshGlobal={refreshGlobal}
            />
          )}

          {page === 'security' && (
            <SecurityAuditView
              approvals={approvals}
              auditLogs={auditLogs}
              docs={docs}
              onRefreshAll={refreshGlobal}
            />
          )}

          {page === 'settings' && (
            <SettingsView
              settings={settings}
              health={health}
              onSettingsUpdated={(next) => {
                setSettings(next);
                applyThemeClass(next.theme);
              }}
              onRefreshAll={refreshGlobal}
            />
          )}
        </main>
      </div>
    </div>
  );
}
