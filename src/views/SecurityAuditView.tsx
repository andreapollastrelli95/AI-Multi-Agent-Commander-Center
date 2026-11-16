import { useState } from 'react';
import {
  Check,
  FilePlus2,
  Lock,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { AGENTS_BY_ID } from '../shared/agentsCatalog';
import type {
  ApprovalRequestRecord,
  AuditLogRecord,
  KnowledgeDocRecord,
} from '../shared/types';

interface SecurityAuditViewProps {
  approvals: ApprovalRequestRecord[];
  auditLogs: AuditLogRecord[];
  docs: KnowledgeDocRecord[];
  onRefreshAll: () => void;
}

const SECURITY_POLICIES = [
  'Divieto assoluto di eseguire pagamenti, bonifici o transazioni finanziarie autonome',
  'Divieto di cancellazione permanente di dati o archivi senza esplicita conferma',
  'Divieto di inviare comunicazioni esterne (email, SMS, webhook) senza approvazione',
  'Divieto di modificare sistemi esterni o infrastrutture in produzione',
  'Isolamento dei documenti personali nella Knowledge Base con tracciamento fonti',
];

export function SecurityAuditView({
  approvals,
  auditLogs,
  docs,
  onRefreshAll,
}: SecurityAuditViewProps) {
  const [docTitle, setDocTitle] = useState('');
  const [docTags, setDocTags] = useState('');
  const [docContent, setDocContent] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function handleResolve(id: string, decision: 'approved' | 'rejected') {
    setResolvingId(id);
    try {
      await api.resolveApproval(id, decision);
      onRefreshAll();
    } finally {
      setResolvingId(null);
    }
  }

  async function handleAddDoc() {
    if (!docTitle.trim() || !docContent.trim()) return;
    setSavingDoc(true);
    try {
      await api.createKnowledgeDoc({
        title: docTitle.trim(),
        tags: docTags.trim(),
        content: docContent.trim(),
      });
      setDocTitle('');
      setDocTags('');
      setDocContent('');
      onRefreshAll();
    } finally {
      setSavingDoc(false);
    }
  }

  async function handleDeleteDoc(id: string) {
    await api.deleteKnowledgeDoc(id);
    onRefreshAll();
  }

  const filteredLogs = auditLogs.filter((l) => {
    if (!logSearch.trim()) return true;
    const q = logSearch.toLowerCase();
    return (
      l.eventType.toLowerCase().includes(q) ||
      l.actor.toLowerCase().includes(q) ||
      l.details.toLowerCase().includes(q)
    );
  });

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Sicurezza, Controllo Umano &amp; Knowledge Base
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Gestisci le autorizzazioni per operazioni critiche, i documenti interni per il Knowledge Manager e il registro di audit completo.
        </p>
      </div>

      {/* Security Guardrails + Human Approval Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Lock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            Politiche di Controllo Attive
          </div>
          <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {SECURITY_POLICIES.map((p, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Coda Approvazioni Umane ({pendingApprovals.length} in sospeso)
            </h2>
          </div>

          {approvals.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Nessuna operazione sensibile o esterna intercettata finora. Quando un agente rileva una richiesta di pagamento, cancellazione o invio esterno, apparirà qui per l’approvazione esplicita.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {approvals.map((apr) => {
                const agentName = AGENTS_BY_ID[apr.agentId]?.name ?? apr.agentId;
                return (
                  <div key={apr.id} className="py-3.5 flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        {agentName} · {apr.actionType} ·{' '}
                        {new Date(apr.createdAt).toLocaleString('it-IT')}
                      </div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {apr.description}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        Impatto: {apr.impact}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {apr.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            disabled={resolvingId === apr.id}
                            onClick={() => handleResolve(apr.id, 'approved')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approva
                          </button>
                          <button
                            type="button"
                            disabled={resolvingId === apr.id}
                            onClick={() => handleResolve(apr.id, 'rejected')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 whitespace-nowrap"
                          >
                            <X className="w-3.5 h-3.5" />
                            Rifiuta
                          </button>
                        </>
                      ) : (
                        <span
                          className={`text-xs font-medium font-mono ${
                            apr.status === 'approved'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {apr.status === 'approved' ? 'Approvata' : 'Rifiutata'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Knowledge Base Repository */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Archivio Documentale · Knowledge Base ({docs.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Carica estratti di documenti, note tecniche o bilanci personali per renderli consultabili in modo verificato dal Knowledge Manager e dagli altri agenti.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="Titolo documento (es. Preventivo Ristrutturazione Bagno)"
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              value={docTags}
              onChange={(e) => setDocTags(e.target.value)}
              placeholder="Tag separati da virgola (es. casa, budget, 2026)"
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <textarea
              rows={4}
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
              placeholder="Incolla il testo o i dati estratti dal documento..."
              className="w-full px-3 py-2 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={handleAddDoc}
              disabled={savingDoc || !docTitle.trim() || !docContent.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white whitespace-nowrap"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              {savingDoc ? 'Salvataggio...' : 'Archivia Documento'}
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md max-h-72 overflow-y-auto">
            {docs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Nessun documento archiviato.
              </div>
            ) : (
              docs.map((doc) => (
                <div
                  key={doc.id}
                  className="p-3.5 flex items-start justify-between gap-3 bg-white dark:bg-slate-900"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {doc.title}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {doc.tags || 'senza tag'} · {doc.content.length} caratteri
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                      {doc.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(doc.id)}
                    aria-label={`Elimina documento ${doc.title}`}
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Audit Log */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Registro di Audit delle Attività ({filteredLogs.length})
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Filtra eventi audit..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Timestamp</th>
                <th className="py-2.5 px-4 font-medium">Evento</th>
                <th className="py-2.5 px-4 font-medium">Attore</th>
                <th className="py-2.5 px-4 font-medium">Dettagli</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 px-4 text-center text-slate-500">
                    Nessun evento registrato.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('it-IT')}
                    </td>
                    <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                      <span
                        className={
                          log.severity === 'critical'
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : log.severity === 'warning'
                              ? 'text-amber-600 dark:text-amber-400 font-medium'
                              : 'text-slate-700 dark:text-slate-300'
                        }
                      >
                        {log.eventType}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {log.actor}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
