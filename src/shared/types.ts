export type DivisionId = 'A' | 'B' | 'C';

export type OrchestrationMode =
  | 'quick'
  | 'full'
  | 'council16'
  | 'debate'
  | 'decision'
  | 'six_hats'
  | 'single_test';

export type AgentExecutionStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'error'
  | 'skipped';

export type SessionStatus =
  | 'pending'
  | 'running'
  | 'verifying'
  | 'synthesizing'
  | 'completed'
  | 'failed';

export type ThinkingLevelSetting = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

export type ResponseStylePreference = 'sintetico' | 'bilanciato' | 'dettagliato';

export type GeminiModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-argon'
  | 'gemini-4-carbon';

export interface HatVisualMeta {
  colorName: string;
  hex: string;
  accentBgClass: string;
  accentTextClass: string;
  topLineClass: string;
  perspectiveLabel: string;
}

export interface AgentDefinition {
  id: string;
  number: number;
  name: string;
  shortRole: string;
  division: DivisionId;
  divisionName: string;
  iconName: string;
  description: string;
  objective: string;
  competencies: string[];
  authorizedTools: string[];
  forbiddenActions: string[];
  systemPrompt: string;
  defaultModel: GeminiModelId;
  hatMeta?: HatVisualMeta;
}

export interface InterAgentRequestItem {
  targetAgentId: string;
  question: string;
  reason: string;
}

export interface ProposedSensitiveAction {
  required: boolean;
  actionType: 'payment' | 'bank_transfer' | 'data_deletion' | 'external_communication' | 'system_modification' | 'none';
  description: string;
  impact: string;
}

export interface AgentStructuredOutput {
  agentId: string;
  agentName: string;
  objective: string;
  analysis: string;
  relevantInfo: string[];
  evidence: string[];
  hypotheses: string[];
  criticalIssues: string[];
  recommendations: string[];
  confidenceLevel: number;
  missingInfo: string[];
  interAgentRequests?: InterAgentRequestItem[];
  proposedSensitiveAction?: ProposedSensitiveAction;
}

export interface FinalReport {
  executiveSummary: string;
  agentAnalysesSummary: Array<{
    agentId: string;
    agentName: string;
    keyTakeaway: string;
    confidenceLevel: number;
  }>;
  pointsOfAgreement: string[];
  pointsOfDisagreement: string[];
  risks: string[];
  opportunities: string[];
  alternatives: string[];
  finalRecommendation: string;
  operationalPlan: Array<{
    step: number;
    action: string;
    ownerAgent: string;
    priority: 'Alta' | 'Media' | 'Bassa';
    timeframe: string;
  }>;
  uncertainties?: string[];
  userOwnsDecisionNote?: string;
}

export interface AgentRunRecord {
  id: string;
  sessionId: string;
  agentId: string;
  round: number;
  status: AgentExecutionStatus;
  modelUsed: string;
  tokensUsed: number;
  durationMs: number;
  retryCount: number;
  output: AgentStructuredOutput | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface AgentMessageRecord {
  id: string;
  sessionId: string;
  senderId: string;
  receiverId: string;
  messageType: 'task_assignment' | 'inter_agent_query' | 'inter_agent_reply' | 'verification_challenge' | 'followup_request' | 'synthesis_input';
  content: string;
  round: number;
  createdAt: string;
}

export interface ApprovalRequestRecord {
  id: string;
  sessionId: string;
  agentId: string;
  actionType: string;
  description: string;
  impact: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedAt: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  eventType: string;
  actor: string;
  target: string;
  details: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
}

export interface KnowledgeDocRecord {
  id: string;
  title: string;
  content: string;
  tags: string;
  createdAt: string;
}

export interface OrchestrationSession {
  id: string;
  title: string;
  prompt: string;
  contextDocIds: string[];
  mode: OrchestrationMode;
  status: SessionStatus;
  selectedAgents: string[];
  finalReport: FinalReport | null;
  userDecision: string | null;
  totalTokens: number;
  durationMs: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  agentRuns?: AgentRunRecord[];
  messages?: AgentMessageRecord[];
  approvals?: ApprovalRequestRecord[];
}

export interface SystemSettings {
  provider: 'gemini' | 'multi_provider_ready';
  defaultModel: GeminiModelId;
  agentModels: Record<string, GeminiModelId>;
  thinkingLevel: ThinkingLevelSetting;
  maxActiveAgents: number;
  maxIterations: number;
  agentTimeoutMs: number;
  maxRetries: number;
  tokenLimitPerSession: number;
  responseStyle: ResponseStylePreference;
  executionMode: 'auto' | 'parallel_priority' | 'sequential_strict';
  theme: 'dark' | 'light';
}

export interface HealthStatus {
  status: 'ok';
  apiKeyConfigured: boolean;
  provider: string;
  databaseReady: boolean;
  agentsCount: number;
  pendingApprovalsCount: number;
}
