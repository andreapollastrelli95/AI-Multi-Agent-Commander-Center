import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_SETTINGS } from '../shared/agentsCatalog.ts';
import type {
  AgentExecutionStatus,
  AgentMessageRecord,
  AgentRunRecord,
  AgentStructuredOutput,
  ApprovalRequestRecord,
  AuditLogRecord,
  FinalReport,
  KnowledgeDocRecord,
  OrchestrationMode,
  OrchestrationSession,
  SessionStatus,
  SystemSettings,
} from '../shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'command_center.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    context_doc_ids_json TEXT NOT NULL DEFAULT '[]',
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    selected_agents_json TEXT NOT NULL DEFAULT '[]',
    final_report_json TEXT,
    user_decision TEXT,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    round INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL,
    model_used TEXT NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    output_json TEXT,
    error_message TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    message_type TEXT NOT NULL,
    content TEXT NOT NULL,
    round INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS approval_requests (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    impact TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    decided_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    target TEXT NOT NULL,
    details TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS knowledge_docs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
`);

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Initialize default settings if absent
const existingSettingsRow = db
  .prepare('SELECT value_json FROM settings WHERE key = ?')
  .get('system') as { value_json: string } | undefined;

if (!existingSettingsRow) {
  db.prepare(
    'INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)'
  ).run('system', JSON.stringify(DEFAULT_SETTINGS), nowIso());
}

export function getSettings(): SystemSettings {
  const row = db
    .prepare('SELECT value_json FROM settings WHERE key = ?')
    .get('system') as { value_json: string } | undefined;

  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(row.value_json) as Partial<SystemSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      agentModels: {
        ...DEFAULT_SETTINGS.agentModels,
        ...(parsed.agentModels ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSettings(partial: Partial<SystemSettings>): SystemSettings {
  const current = getSettings();
  const merged: SystemSettings = {
    ...current,
    ...partial,
    agentModels: {
      ...current.agentModels,
      ...(partial.agentModels ?? {}),
    },
  };
  db.prepare(
    'INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)'
  ).run('system', JSON.stringify(merged), nowIso());

  addAuditLog({
    eventType: 'SETTINGS_UPDATED',
    actor: 'Utente',
    target: 'Sistema',
    details: `Aggiornate impostazioni: modello=${merged.defaultModel}, maxAgenti=${merged.maxActiveAgents}, thinking=${merged.thinkingLevel}`,
    severity: 'info',
  });
  return merged;
}

export function resetSettings(): SystemSettings {
  db.prepare(
    'INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)'
  ).run('system', JSON.stringify(DEFAULT_SETTINGS), nowIso());
  addAuditLog({
    eventType: 'SETTINGS_RESET',
    actor: 'Utente',
    target: 'Sistema',
    details: 'Ripristinate impostazioni predefinite di fabbrica.',
    severity: 'warning',
  });
  return { ...DEFAULT_SETTINGS };
}

export function addAuditLog(entry: {
  eventType: string;
  actor: string;
  target: string;
  details: string;
  severity?: 'info' | 'warning' | 'critical';
}): AuditLogRecord {
  const record: AuditLogRecord = {
    id: makeId('aud'),
    eventType: entry.eventType,
    actor: entry.actor,
    target: entry.target,
    details: entry.details,
    severity: entry.severity ?? 'info',
    createdAt: nowIso(),
  };
  db.prepare(
    `INSERT INTO audit_logs (id, event_type, actor, target, details, severity, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.eventType,
    record.actor,
    record.target,
    record.details,
    record.severity,
    record.createdAt
  );
  return record;
}

export function listAuditLogs(limit = 150): AuditLogRecord[] {
  const rows = db
    .prepare(
      `SELECT id, event_type, actor, target, details, severity, created_at
       FROM audit_logs ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as Array<{
    id: string;
    event_type: string;
    actor: string;
    target: string;
    details: string;
    severity: 'info' | 'warning' | 'critical';
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    eventType: r.event_type,
    actor: r.actor,
    target: r.target,
    details: r.details,
    severity: r.severity,
    createdAt: r.created_at,
  }));
}

export function createSession(input: {
  id?: string;
  title: string;
  prompt: string;
  contextDocIds: string[];
  mode: OrchestrationMode;
  selectedAgents: string[];
}): OrchestrationSession {
  const session: OrchestrationSession = {
    id: input.id ?? makeId('sess'),
    title: input.title,
    prompt: input.prompt,
    contextDocIds: input.contextDocIds,
    mode: input.mode,
    status: 'running',
    selectedAgents: input.selectedAgents,
    finalReport: null,
    userDecision: null,
    totalTokens: 0,
    durationMs: 0,
    errorMessage: null,
    createdAt: nowIso(),
    completedAt: null,
  };

  db.prepare(
    `INSERT INTO sessions (
      id, title, prompt, context_doc_ids_json, mode, status, selected_agents_json,
      final_report_json, user_decision, total_tokens, duration_ms, error_message, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    session.id,
    session.title,
    session.prompt,
    JSON.stringify(session.contextDocIds),
    session.mode,
    session.status,
    JSON.stringify(session.selectedAgents),
    null,
    null,
    0,
    0,
    null,
    session.createdAt,
    null
  );

  return session;
}

export function updateSession(
  sessionId: string,
  patch: Partial<{
    status: SessionStatus;
    selectedAgents: string[];
    finalReport: FinalReport | null;
    userDecision: string | null;
    totalTokens: number;
    durationMs: number;
    errorMessage: string | null;
    completedAt: string | null;
  }>
): void {
  const existing = getSessionById(sessionId);
  if (!existing) return;

  const status = patch.status ?? existing.status;
  const selectedAgents = patch.selectedAgents ?? existing.selectedAgents;
  const finalReport =
    patch.finalReport !== undefined ? patch.finalReport : existing.finalReport;
  const userDecision =
    patch.userDecision !== undefined ? patch.userDecision : existing.userDecision;
  const totalTokens = patch.totalTokens ?? existing.totalTokens;
  const durationMs = patch.durationMs ?? existing.durationMs;
  const errorMessage =
    patch.errorMessage !== undefined ? patch.errorMessage : existing.errorMessage;
  const completedAt =
    patch.completedAt !== undefined ? patch.completedAt : existing.completedAt;

  db.prepare(
    `UPDATE sessions SET
      status = ?,
      selected_agents_json = ?,
      final_report_json = ?,
      user_decision = ?,
      total_tokens = ?,
      duration_ms = ?,
      error_message = ?,
      completed_at = ?
     WHERE id = ?`
  ).run(
    status,
    JSON.stringify(selectedAgents),
    finalReport ? JSON.stringify(finalReport) : null,
    userDecision,
    totalTokens,
    durationMs,
    errorMessage,
    completedAt,
    sessionId
  );
}

interface RawSessionRow {
  id: string;
  title: string;
  prompt: string;
  context_doc_ids_json: string;
  mode: OrchestrationMode;
  status: SessionStatus;
  selected_agents_json: string;
  final_report_json: string | null;
  user_decision: string | null;
  total_tokens: number;
  duration_ms: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

function mapSessionRow(r: RawSessionRow): OrchestrationSession {
  return {
    id: r.id,
    title: r.title,
    prompt: r.prompt,
    contextDocIds: JSON.parse(r.context_doc_ids_json || '[]') as string[],
    mode: r.mode,
    status: r.status,
    selectedAgents: JSON.parse(r.selected_agents_json || '[]') as string[],
    finalReport: r.final_report_json
      ? (JSON.parse(r.final_report_json) as FinalReport)
      : null,
    userDecision: r.user_decision,
    totalTokens: r.total_tokens,
    durationMs: r.duration_ms,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

export function listSessions(limit = 100): OrchestrationSession[] {
  const rows = db
    .prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?')
    .all(limit) as unknown as RawSessionRow[];
  return rows.map(mapSessionRow);
}

export function getSessionById(sessionId: string): OrchestrationSession | null {
  const row = db
    .prepare('SELECT * FROM sessions WHERE id = ?')
    .get(sessionId) as unknown as RawSessionRow | undefined;
  if (!row) return null;

  const session = mapSessionRow(row);
  session.agentRuns = listAgentRunsBySession(sessionId);
  session.messages = listMessagesBySession(sessionId);
  session.approvals = listApprovalsBySession(sessionId);
  return session;
}

export function deleteSession(sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  addAuditLog({
    eventType: 'SESSION_DELETED',
    actor: 'Utente',
    target: sessionId,
    details: `Sessione ${sessionId} eliminata manualmente.`,
    severity: 'warning',
  });
}

export function clearAllSessions(): void {
  db.prepare('DELETE FROM sessions').run();
  addAuditLog({
    eventType: 'HISTORY_CLEARED',
    actor: 'Utente',
    target: 'Storico Sessioni',
    details: 'Tutto lo storico delle sessioni è stato cancellato.',
    severity: 'critical',
  });
}

export function upsertAgentRun(run: {
  id?: string;
  sessionId: string;
  agentId: string;
  round: number;
  status: AgentExecutionStatus;
  modelUsed: string;
  tokensUsed?: number;
  durationMs?: number;
  retryCount?: number;
  output?: AgentStructuredOutput | null;
  errorMessage?: string | null;
  startedAt?: string;
  completedAt?: string | null;
}): AgentRunRecord {
  const id = run.id ?? makeId(`run_${run.agentId}`);
  const existing = db
    .prepare('SELECT * FROM agent_runs WHERE id = ?')
    .get(id) as
    | {
        started_at: string;
        tokens_used: number;
        duration_ms: number;
        retry_count: number;
        output_json: string | null;
        error_message: string | null;
        completed_at: string | null;
      }
    | undefined;

  const startedAt = run.startedAt ?? existing?.started_at ?? nowIso();
  const tokensUsed = run.tokensUsed ?? existing?.tokens_used ?? 0;
  const durationMs = run.durationMs ?? existing?.duration_ms ?? 0;
  const retryCount = run.retryCount ?? existing?.retry_count ?? 0;
  const outputJson =
    run.output !== undefined
      ? run.output
        ? JSON.stringify(run.output)
        : null
      : existing?.output_json ?? null;
  const errorMessage =
    run.errorMessage !== undefined
      ? run.errorMessage
      : existing?.error_message ?? null;
  const completedAt =
    run.completedAt !== undefined
      ? run.completedAt
      : existing?.completed_at ?? null;

  db.prepare(
    `INSERT OR REPLACE INTO agent_runs (
      id, session_id, agent_id, round, status, model_used, tokens_used,
      duration_ms, retry_count, output_json, error_message, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    run.sessionId,
    run.agentId,
    run.round,
    run.status,
    run.modelUsed,
    tokensUsed,
    durationMs,
    retryCount,
    outputJson,
    errorMessage,
    startedAt,
    completedAt
  );

  return {
    id,
    sessionId: run.sessionId,
    agentId: run.agentId,
    round: run.round,
    status: run.status,
    modelUsed: run.modelUsed,
    tokensUsed,
    durationMs,
    retryCount,
    output: outputJson ? (JSON.parse(outputJson) as AgentStructuredOutput) : null,
    errorMessage,
    startedAt,
    completedAt,
  };
}

export function listAgentRunsBySession(sessionId: string): AgentRunRecord[] {
  const rows = db
    .prepare(
      'SELECT * FROM agent_runs WHERE session_id = ? ORDER BY round ASC, started_at ASC'
    )
    .all(sessionId) as Array<{
    id: string;
    session_id: string;
    agent_id: string;
    round: number;
    status: AgentExecutionStatus;
    model_used: string;
    tokens_used: number;
    duration_ms: number;
    retry_count: number;
    output_json: string | null;
    error_message: string | null;
    started_at: string;
    completed_at: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    agentId: r.agent_id,
    round: r.round,
    status: r.status,
    modelUsed: r.model_used,
    tokensUsed: r.tokens_used,
    durationMs: r.duration_ms,
    retryCount: r.retry_count,
    output: r.output_json
      ? (JSON.parse(r.output_json) as AgentStructuredOutput)
      : null,
    errorMessage: r.error_message,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  }));
}

export function addAgentMessage(msg: {
  sessionId: string;
  senderId: string;
  receiverId: string;
  messageType: AgentMessageRecord['messageType'];
  content: string;
  round: number;
}): AgentMessageRecord {
  const record: AgentMessageRecord = {
    id: makeId('msg'),
    sessionId: msg.sessionId,
    senderId: msg.senderId,
    receiverId: msg.receiverId,
    messageType: msg.messageType,
    content: msg.content,
    round: msg.round,
    createdAt: nowIso(),
  };

  db.prepare(
    `INSERT INTO agent_messages (id, session_id, sender_id, receiver_id, message_type, content, round, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.sessionId,
    record.senderId,
    record.receiverId,
    record.messageType,
    record.content,
    record.round,
    record.createdAt
  );
  return record;
}

export function listMessagesBySession(sessionId: string): AgentMessageRecord[] {
  const rows = db
    .prepare(
      'SELECT * FROM agent_messages WHERE session_id = ? ORDER BY created_at ASC'
    )
    .all(sessionId) as Array<{
    id: string;
    session_id: string;
    sender_id: string;
    receiver_id: string;
    message_type: AgentMessageRecord['messageType'];
    content: string;
    round: number;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    senderId: r.sender_id,
    receiverId: r.receiver_id,
    messageType: r.message_type,
    content: r.content,
    round: r.round,
    createdAt: r.created_at,
  }));
}

export function createApprovalRequest(input: {
  sessionId: string;
  agentId: string;
  actionType: string;
  description: string;
  impact: string;
}): ApprovalRequestRecord {
  const record: ApprovalRequestRecord = {
    id: makeId('apr'),
    sessionId: input.sessionId,
    agentId: input.agentId,
    actionType: input.actionType,
    description: input.description,
    impact: input.impact,
    status: 'pending',
    decidedAt: null,
    createdAt: nowIso(),
  };

  db.prepare(
    `INSERT INTO approval_requests (id, session_id, agent_id, action_type, description, impact, status, decided_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.sessionId,
    record.agentId,
    record.actionType,
    record.description,
    record.impact,
    record.status,
    null,
    record.createdAt
  );

  addAuditLog({
    eventType: 'APPROVAL_REQUIRED',
    actor: input.agentId,
    target: input.actionType,
    details: `Operazione critica intercettata e bloccata in attesa di conferma umana: ${input.description}`,
    severity: 'warning',
  });

  return record;
}

export function listApprovalRequests(): ApprovalRequestRecord[] {
  const rows = db
    .prepare('SELECT * FROM approval_requests ORDER BY created_at DESC')
    .all() as Array<{
    id: string;
    session_id: string;
    agent_id: string;
    action_type: string;
    description: string;
    impact: string;
    status: 'pending' | 'approved' | 'rejected';
    decided_at: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    agentId: r.agent_id,
    actionType: r.action_type,
    description: r.description,
    impact: r.impact,
    status: r.status,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
  }));
}

export function listApprovalsBySession(
  sessionId: string
): ApprovalRequestRecord[] {
  const rows = db
    .prepare(
      'SELECT * FROM approval_requests WHERE session_id = ? ORDER BY created_at DESC'
    )
    .all(sessionId) as Array<{
    id: string;
    session_id: string;
    agent_id: string;
    action_type: string;
    description: string;
    impact: string;
    status: 'pending' | 'approved' | 'rejected';
    decided_at: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    agentId: r.agent_id,
    actionType: r.action_type,
    description: r.description,
    impact: r.impact,
    status: r.status,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
  }));
}

export function resolveApprovalRequest(
  id: string,
  decision: 'approved' | 'rejected'
): ApprovalRequestRecord | null {
  const decidedAt = nowIso();
  db.prepare(
    'UPDATE approval_requests SET status = ?, decided_at = ? WHERE id = ?'
  ).run(decision, decidedAt, id);

  const row = db
    .prepare('SELECT * FROM approval_requests WHERE id = ?')
    .get(id) as
    | {
        id: string;
        session_id: string;
        agent_id: string;
        action_type: string;
        description: string;
        impact: string;
        status: 'pending' | 'approved' | 'rejected';
        decided_at: string | null;
        created_at: string;
      }
    | undefined;

  if (!row) return null;

  addAuditLog({
    eventType:
      decision === 'approved' ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
    actor: 'Utente',
    target: row.action_type,
    details: `Richiesta ${id} (${row.description}) -> ${decision === 'approved' ? 'APPROVATA' : 'RIFIUTATA'}.`,
    severity: decision === 'approved' ? 'warning' : 'info',
  });

  return {
    id: row.id,
    sessionId: row.session_id,
    agentId: row.agent_id,
    actionType: row.action_type,
    description: row.description,
    impact: row.impact,
    status: row.status,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

export function countPendingApprovals(): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM approval_requests WHERE status = 'pending'"
    )
    .get() as { cnt: number };
  return row.cnt;
}

export function listKnowledgeDocs(): KnowledgeDocRecord[] {
  const rows = db
    .prepare('SELECT * FROM knowledge_docs ORDER BY created_at DESC')
    .all() as Array<{
    id: string;
    title: string;
    content: string;
    tags: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    tags: r.tags,
    createdAt: r.created_at,
  }));
}

export function getKnowledgeDocsByIds(ids: string[]): KnowledgeDocRecord[] {
  if (!ids.length) return [];
  const all = listKnowledgeDocs();
  return all.filter((d) => ids.includes(d.id));
}

export function createKnowledgeDoc(input: {
  title: string;
  content: string;
  tags: string;
}): KnowledgeDocRecord {
  const doc: KnowledgeDocRecord = {
    id: makeId('doc'),
    title: input.title.trim(),
    content: input.content.trim(),
    tags: input.tags.trim(),
    createdAt: nowIso(),
  };

  db.prepare(
    'INSERT INTO knowledge_docs (id, title, content, tags, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(doc.id, doc.title, doc.content, doc.tags, doc.createdAt);

  addAuditLog({
    eventType: 'KNOWLEDGE_DOC_ADDED',
    actor: 'Utente',
    target: doc.title,
    details: `Documento archiviato nella Knowledge Base (${doc.content.length} caratteri).`,
    severity: 'info',
  });

  return doc;
}

export function deleteKnowledgeDoc(id: string): void {
  db.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(id);
  addAuditLog({
    eventType: 'KNOWLEDGE_DOC_DELETED',
    actor: 'Utente',
    target: id,
    details: `Documento ${id} rimosso dalla Knowledge Base.`,
    severity: 'warning',
  });
}

export function exportFullDatabaseBackup() {
  return {
    exportedAt: nowIso(),
    settings: getSettings(),
    sessions: listSessions(500).map((s) => ({
      ...s,
      agentRuns: listAgentRunsBySession(s.id),
      messages: listMessagesBySession(s.id),
      approvals: listApprovalsBySession(s.id),
    })),
    knowledgeDocs: listKnowledgeDocs(),
    approvals: listApprovalRequests(),
    auditLogs: listAuditLogs(500),
  };
}
