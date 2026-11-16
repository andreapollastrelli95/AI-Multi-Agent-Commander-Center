import type {
  AgentRunRecord,
  ApprovalRequestRecord,
  AuditLogRecord,
  HealthStatus,
  KnowledgeDocRecord,
  OrchestrationMode,
  OrchestrationSession,
  SystemSettings,
} from '../shared/types';

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Errore HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  getHealth: () => apiFetch<HealthStatus>('/api/health'),

  listSessions: () =>
    apiFetch<{ sessions: OrchestrationSession[] }>('/api/sessions').then(
      (r) => r.sessions
    ),

  getSession: (id: string) =>
    apiFetch<{ session: OrchestrationSession }>(`/api/sessions/${id}`).then(
      (r) => r.session
    ),

  startSession: (payload: {
    prompt: string;
    mode: OrchestrationMode;
    contextDocIds?: string[];
  }) =>
    apiFetch<{ session: OrchestrationSession }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((r) => r.session),

  recordDecision: (sessionId: string, decision: string) =>
    apiFetch<{ session: OrchestrationSession }>(
      `/api/sessions/${sessionId}/decision`,
      {
        method: 'PATCH',
        body: JSON.stringify({ decision }),
      }
    ).then((r) => r.session),

  deleteSession: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' }),

  clearHistory: () =>
    apiFetch<{ ok: boolean }>('/api/sessions', { method: 'DELETE' }),

  testAgent: (
    agentId: string,
    payload: { prompt: string; contextDocIds?: string[] }
  ) =>
    apiFetch<{ session: OrchestrationSession; run: AgentRunRecord }>(
      `/api/agents/${agentId}/test`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  listApprovals: () =>
    apiFetch<{ approvals: ApprovalRequestRecord[] }>('/api/approvals').then(
      (r) => r.approvals
    ),

  resolveApproval: (id: string, decision: 'approved' | 'rejected') =>
    apiFetch<{ approval: ApprovalRequestRecord }>(
      `/api/approvals/${id}/resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ decision }),
      }
    ).then((r) => r.approval),

  listAuditLogs: () =>
    apiFetch<{ logs: AuditLogRecord[] }>('/api/audit-logs').then((r) => r.logs),

  listKnowledgeDocs: () =>
    apiFetch<{ docs: KnowledgeDocRecord[] }>('/api/knowledge-docs').then(
      (r) => r.docs
    ),

  createKnowledgeDoc: (payload: {
    title: string;
    content: string;
    tags: string;
  }) =>
    apiFetch<{ doc: KnowledgeDocRecord }>('/api/knowledge-docs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((r) => r.doc),

  deleteKnowledgeDoc: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/knowledge-docs/${id}`, {
      method: 'DELETE',
    }),

  getSettings: () =>
    apiFetch<{ settings: SystemSettings }>('/api/settings').then(
      (r) => r.settings
    ),

  updateSettings: (payload: Partial<SystemSettings>) =>
    apiFetch<{ settings: SystemSettings }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }).then((r) => r.settings),

  resetSettings: () =>
    apiFetch<{ settings: SystemSettings }>('/api/settings/reset', {
      method: 'POST',
    }).then((r) => r.settings),
};

export function triggerFileDownload(
  filename: string,
  content: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function sessionToMarkdown(session: OrchestrationSession): string {
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push(`- **ID Sessione**: ${session.id}`);
  lines.push(`- **Modalità**: ${session.mode}`);
  lines.push(`- **Stato**: ${session.status}`);
  lines.push(`- **Data**: ${new Date(session.createdAt).toLocaleString('it-IT')}`);
  lines.push(`- **Token totali**: ${session.totalTokens}`);
  lines.push('');
  lines.push(`## Richiesta Utente`);
  lines.push(session.prompt);
  lines.push('');

  if (session.finalReport) {
    const r = session.finalReport;
    lines.push(`## 1. Sintesi Esecutiva`);
    lines.push(r.executiveSummary);
    lines.push('');
    lines.push(`## 2. Analisi degli Agenti`);
    r.agentAnalysesSummary.forEach((a) => {
      lines.push(
        `- **${a.agentName}** (Confidenza ${a.confidenceLevel}%): ${a.keyTakeaway}`
      );
    });
    lines.push('');
    lines.push(`## 3. Punti di Accordo`);
    r.pointsOfAgreement.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
    lines.push(`## 4. Punti di Disaccordo`);
    r.pointsOfDisagreement.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
    lines.push(`## 5. Rischi`);
    r.risks.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
    lines.push(`## 6. Opportunità`);
    r.opportunities.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
    lines.push(`## 7. Alternative`);
    r.alternatives.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
    lines.push(`## 8. Raccomandazione Finale`);
    lines.push(r.finalRecommendation);
    lines.push('');
    lines.push(`## 9. Piano Operativo`);
    r.operationalPlan.forEach((p) =>
      lines.push(
        `${p.step}. **${p.action}** — Responsabile: ${p.ownerAgent} | Priorità: ${p.priority} | Orizzonte: ${p.timeframe}`
      )
    );
    lines.push('');
  }

  if (session.userDecision) {
    lines.push(`## Decisione Finale dell'Utente`);
    lines.push(session.userDecision);
    lines.push('');
  }

  if (session.agentRuns?.length) {
    lines.push(`## Dettaglio Output Strutturati degli Agenti`);
    session.agentRuns.forEach((run) => {
      if (!run.output) return;
      const o = run.output;
      lines.push(
        `### ${o.agentName} (${o.agentId}) — Round ${run.round} · Confidenza ${o.confidenceLevel}%`
      );
      lines.push(`- **Obiettivo**: ${o.objective}`);
      lines.push(`- **Analisi**: ${o.analysis}`);
      if (o.evidence.length)
        lines.push(`- **Evidenze**: ${o.evidence.join('; ')}`);
      if (o.hypotheses.length)
        lines.push(`- **Ipotesi**: ${o.hypotheses.join('; ')}`);
      if (o.criticalIssues.length)
        lines.push(`- **Criticità**: ${o.criticalIssues.join('; ')}`);
      if (o.recommendations.length)
        lines.push(`- **Raccomandazioni**: ${o.recommendations.join('; ')}`);
      if (o.missingInfo.length)
        lines.push(`- **Info mancanti**: ${o.missingInfo.join('; ')}`);
      lines.push('');
    });
  }

  return lines.join('\n');
}
