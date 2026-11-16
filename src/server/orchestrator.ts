import { EventEmitter } from 'node:events';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  AGENTS_BY_ID,
  AGENTS_CATALOG,
} from '../shared/agentsCatalog.ts';
import type {
  AgentDefinition,
  AgentMessageRecord,
  AgentRunRecord,
  AgentStructuredOutput,
  FinalReport,
  GeminiModelId,
  KnowledgeDocRecord,
  OrchestrationMode,
  OrchestrationSession,
  SystemSettings,
  ThinkingLevelSetting,
} from '../shared/types.ts';
import {
  addAgentMessage,
  addAuditLog,
  createApprovalRequest,
  createSession,
  getKnowledgeDocsByIds,
  getSessionById,
  getSettings,
  updateSession,
  upsertAgentRun,
} from './db.ts';

export interface StreamEventPayload {
  type:
    | 'session_updated'
    | 'agent_run_updated'
    | 'agent_message'
    | 'approval_required'
    | 'session_completed'
    | 'session_failed';
  sessionId: string;
  data: unknown;
  timestamp: string;
}

const sessionBus = new EventEmitter();
sessionBus.setMaxListeners(100);

export function subscribeToSessionEvents(
  sessionId: string,
  listener: (event: StreamEventPayload) => void
): () => void {
  const channel = `session:${sessionId}`;
  sessionBus.on(channel, listener);
  return () => {
    sessionBus.off(channel, listener);
  };
}

function emitSessionEvent(
  sessionId: string,
  type: StreamEventPayload['type'],
  data: unknown
): void {
  const payload: StreamEventPayload = {
    type,
    sessionId,
    data,
    timestamp: new Date().toISOString(),
  };
  sessionBus.emit(`session:${sessionId}`, payload);
}

export function isApiKeyConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 0 && key !== 'MY_GEMINI_API_KEY');
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'Chiave API Gemini non configurata sul server. Configura GEMINI_API_KEY nel pannello Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function resolveThinkingLevel(
  model: GeminiModelId,
  requested: ThinkingLevelSetting
): ThinkingLevel | undefined {
  if (model === 'gemini-3.1-flash-lite') {
    if (requested === 'LOW') return ThinkingLevel.LOW;
    return ThinkingLevel.MINIMAL;
  }
  if (requested === 'XHIGH') {
    return model === 'gemini-4-hydrogen'
      ? ThinkingLevel.XHIGH
      : ThinkingLevel.HIGH;
  }
  if (requested === 'HIGH') return ThinkingLevel.HIGH;
  if (requested === 'MEDIUM') return ThinkingLevel.MEDIUM;
  return ThinkingLevel.LOW;
}

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw.includes('API_KEY_INVALID') ||
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('403') ||
    raw.includes('400')
  ) {
    if (raw.toLowerCase().includes('api key') || raw.includes('403')) {
      return 'Errore autenticazione Gemini API: verifica che GEMINI_API_KEY sia valida e attiva in Settings > Secrets.';
    }
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return 'Quota Gemini API temporaneamente esaurita (429). Riduci il numero di agenti paralleli in Impostazioni o seleziona una chiave API abilitata alla fatturazione in Settings > Secrets.';
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return 'Modello Gemini non trovato (404). Verifica in Impostazioni che sia selezionato un modello valido (es. gemini-4-hydrogen).';
  }
  return raw;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  const safeLimit = Math.max(1, limit);
  let cursor = 0;

  async function next(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx], idx);
    }
  }

  const workers = Array.from(
    { length: Math.min(safeLimit, items.length) },
    () => next()
  );
  await Promise.all(workers);
}

const AGENT_OUTPUT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    objective: {
      type: Type.STRING,
      description: 'Obiettivo specifico affrontato dall agente per questa richiesta.',
    },
    analysis: {
      type: Type.STRING,
      description: 'Analisi principale dettagliata e coerente con il ruolo dell agente.',
    },
    relevantInfo: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Informazioni rilevanti individuate.',
    },
    evidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Fatti o evidenze verificabili presenti nella richiesta o nei documenti.',
    },
    hypotheses: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Ipotesi o assunzioni esplicite distinte dai fatti.',
    },
    criticalIssues: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Criticità, rischi, anomalie o punti deboli individuati.',
    },
    recommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Raccomandazioni operative concrete.',
    },
    confidenceLevel: {
      type: Type.INTEGER,
      description: 'Livello di confidenza da 0 a 100.',
    },
    missingInfo: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Informazioni mancanti necessarie per una valutazione più accurata.',
    },
    interAgentRequests: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          targetAgentId: {
            type: Type.STRING,
            description: 'ID valido di un altro agente a cui chiedere un chiarimento.',
          },
          question: {
            type: Type.STRING,
            description: 'Domanda specifica rivolta all altro agente.',
          },
          reason: {
            type: Type.STRING,
            description: 'Motivo per cui l informazione serve.',
          },
        },
      },
      description: 'Eventuali richieste ad altri agenti (max 1-2, solo se strettamente necessarie).',
    },
    proposedSensitiveAction: {
      type: Type.OBJECT,
      properties: {
        required: {
          type: Type.BOOLEAN,
          description: 'True solo se la richiesta chiede pagamenti, bonifici, cancellazione dati o invii esterni.',
        },
        actionType: {
          type: Type.STRING,
          description: 'Uno tra: payment, bank_transfer, data_deletion, external_communication, system_modification, none.',
        },
        description: {
          type: Type.STRING,
          description: 'Descrizione dell azione sensibile richiesta.',
        },
        impact: {
          type: Type.STRING,
          description: 'Impatto potenziale se eseguita.',
        },
      },
    },
  },
  required: [
    'objective',
    'analysis',
    'relevantInfo',
    'evidence',
    'hypotheses',
    'criticalIssues',
    'recommendations',
    'confidenceLevel',
    'missingInfo',
  ],
};

function styleInstruction(style: SystemSettings['responseStyle']): string {
  if (style === 'sintetico') {
    return 'Mantieni le risposte essenziali, incisive e compatte (max 2-3 frasi per analisi, punti elenco brevi).';
  }
  if (style === 'dettagliato') {
    return 'Fornisci un analisi approfondita, esaustiva, con esempi concreti, passaggi operativi e motivazioni dettagliate.';
  }
  return 'Mantieni un equilibrio professionale tra profondità analitica e chiarezza espositiva.';
}

function formatDocsContext(docs: KnowledgeDocRecord[]): string {
  if (!docs.length) return 'Nessun documento personale allegato.';
  return docs
    .map(
      (d, idx) =>
        `[DOCUMENTO ${idx + 1}: "${d.title}" | Tag: ${d.tags || 'nessuno'}]\n${d.content.slice(0, 6000)}`
    )
    .join('\n\n---\n\n');
}

async function callSingleAgent(params: {
  sessionId: string;
  agent: AgentDefinition;
  userPrompt: string;
  taskDirective: string;
  sharedContextSummary: string;
  docsContext: string;
  round: number;
  settings: SystemSettings;
  onTokenCheck?: (tokensAdded: number) => boolean;
}): Promise<AgentRunRecord> {
  const {
    sessionId,
    agent,
    userPrompt,
    taskDirective,
    sharedContextSummary,
    docsContext,
    round,
    settings,
    onTokenCheck,
  } = params;

  const modelUsed =
    settings.agentModels[agent.id] || settings.defaultModel || agent.defaultModel;
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  let runRecord = upsertAgentRun({
    sessionId,
    agentId: agent.id,
    round,
    status: 'running',
    modelUsed,
    startedAt,
  });
  emitSessionEvent(sessionId, 'agent_run_updated', runRecord);

  const ai = createGeminiClient();
  const thinkingLevel = resolveThinkingLevel(modelUsed, settings.thinkingLevel);

  const validPeerIds = AGENTS_CATALOG.filter((a) => a.id !== agent.id)
    .map((a) => `${a.id} (${a.name})`)
    .join(', ');

  const fullPrompt = `
RICHIESTA UTENTE:
${userPrompt}

DIRETTIVA ASSEGNATA DALL'ORCHESTRATORE (Round ${round}):
${taskDirective}

DOCUMENTI / KNOWLEDGE BASE ALLEGATI:
${docsContext}

CONTESTO CONDIVISO E OUTPUT PRECEDENTI:
${sharedContextSummary || 'Nessun output precedente ancora disponibile (esecuzione indipendente).'}

AGENTI DISPONIBILI PER EVENTUALI RICHIESTE INTER-AGENTE (usa solo gli ID esatti):
${validPeerIds}

STILE DI RISPOSTA RICHIESTO:
${styleInstruction(settings.responseStyle)}

Restituisci esclusivamente un oggetto JSON valido conforme allo schema richiesto.
`;

  let lastError: unknown = null;
  const maxAttempts = Math.max(1, settings.maxRetries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const apiPromise = ai.models.generateContent({
        model: modelUsed,
        contents: fullPrompt,
        config: {
          systemInstruction: agent.systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: AGENT_OUTPUT_SCHEMA,
          ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Timeout di ${Math.round(settings.agentTimeoutMs / 1000)}s superato per ${agent.name}.`
            )
          );
        }, settings.agentTimeoutMs);
      });

      const response = await Promise.race([apiPromise, timeoutPromise]);
      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as Partial<AgentStructuredOutput>;

      const structured: AgentStructuredOutput = {
        agentId: agent.id,
        agentName: agent.name,
        objective: parsed.objective || agent.objective,
        analysis: parsed.analysis || 'Analisi non disponibile.',
        relevantInfo: Array.isArray(parsed.relevantInfo) ? parsed.relevantInfo : [],
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
        hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [],
        criticalIssues: Array.isArray(parsed.criticalIssues)
          ? parsed.criticalIssues
          : [],
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
          : [],
        confidenceLevel:
          typeof parsed.confidenceLevel === 'number'
            ? Math.max(0, Math.min(100, Math.round(parsed.confidenceLevel)))
            : 70,
        missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
        interAgentRequests: Array.isArray(parsed.interAgentRequests)
          ? parsed.interAgentRequests.filter(
              (r) => r && r.targetAgentId && AGENTS_BY_ID[r.targetAgentId]
            )
          : [],
        proposedSensitiveAction: parsed.proposedSensitiveAction,
      };

      const usage = response.usageMetadata;
      const tokensUsed =
        (usage?.totalTokenCount ?? 0) ||
        Math.round((fullPrompt.length + rawText.length) / 4);

      if (onTokenCheck && !onTokenCheck(tokensUsed)) {
        throw new Error(
          `Limite token di sessione (${settings.tokenLimitPerSession}) raggiunto.`
        );
      }

      if (structured.proposedSensitiveAction?.required) {
        const approval = createApprovalRequest({
          sessionId,
          agentId: agent.id,
          actionType:
            structured.proposedSensitiveAction.actionType || 'external_action',
          description:
            structured.proposedSensitiveAction.description ||
            'Operazione esterna o critica rilevata nella richiesta.',
          impact:
            structured.proposedSensitiveAction.impact ||
            'Richiede conferma esplicita prima di qualsiasi esecuzione.',
        });
        emitSessionEvent(sessionId, 'approval_required', approval);
      }

      const durationMs = Date.now() - startMs;
      runRecord = upsertAgentRun({
        id: runRecord.id,
        sessionId,
        agentId: agent.id,
        round,
        status: 'completed',
        modelUsed,
        tokensUsed,
        durationMs,
        retryCount: attempt - 1,
        output: structured,
        errorMessage: null,
        startedAt,
        completedAt: new Date().toISOString(),
      });
      emitSessionEvent(sessionId, 'agent_run_updated', runRecord);

      addAuditLog({
        eventType: 'AGENT_EXECUTED',
        actor: agent.name,
        target: sessionId,
        details: `Round ${round} completato con ${modelUsed} in ${durationMs}ms (${tokensUsed} token, confidenza ${structured.confidenceLevel}%).`,
        severity: 'info',
      });

      return runRecord;
    } catch (err) {
      lastError = err;
      const formatted = formatGeminiError(err);
      if (
        formatted.includes('Chiave API') ||
        formatted.includes('autenticazione') ||
        formatted.includes('Limite token')
      ) {
        break;
      }
      if (attempt < maxAttempts) {
        await sleep(800 * attempt);
      }
    }
  }

  const errorMessage = formatGeminiError(lastError);
  const durationMs = Date.now() - startMs;
  runRecord = upsertAgentRun({
    id: runRecord.id,
    sessionId,
    agentId: agent.id,
    round,
    status: 'error',
    modelUsed,
    tokensUsed: 0,
    durationMs,
    retryCount: maxAttempts - 1,
    output: null,
    errorMessage,
    startedAt,
    completedAt: new Date().toISOString(),
  });
  emitSessionEvent(sessionId, 'agent_run_updated', runRecord);

  addAuditLog({
    eventType: 'AGENT_ERROR',
    actor: agent.name,
    target: sessionId,
    details: errorMessage,
    severity: 'critical',
  });

  return runRecord;
}

async function routeAgentsWithOrchestrator(params: {
  prompt: string;
  mode: OrchestrationMode;
  docsContext: string;
  settings: SystemSettings;
}): Promise<{
  title: string;
  selectedAgentIds: string[];
  taskAssignments: Record<string, string>;
  orchestratorNotes: string;
  tokensUsed: number;
}> {
  const { prompt, mode, docsContext, settings } = params;

  if (mode === 'council16') {
    const allIds = AGENTS_CATALOG.map((a) => a.id);
    return {
      title: prompt.slice(0, 72),
      selectedAgentIds: allIds,
      taskAssignments: Object.fromEntries(
        AGENTS_CATALOG.map((a) => [
          a.id,
          `Fornisci una valutazione indipendente completa secondo il tuo ruolo di ${a.name} (${a.shortRole}).`,
        ])
      ),
      orchestratorNotes:
        'Convocazione plenaria del Consiglio dei 16 Agenti con successivo audit del Verification Agent.',
      tokensUsed: 0,
    };
  }

  if (mode === 'six_hats') {
    const hatIds = [
      'white-hat',
      'red-hat',
      'black-hat',
      'yellow-hat',
      'green-hat',
      'blue-hat',
    ];
    return {
      title: `Sei Cappelli: ${prompt.slice(0, 60)}`,
      selectedAgentIds: hatIds,
      taskAssignments: Object.fromEntries(
        hatIds.map((id) => [
          id,
          `Analizza il problema esclusivamente attraverso la lente del ${AGENTS_BY_ID[id].name}.`,
        ])
      ),
      orchestratorNotes:
        'Sessione strutturata secondo il metodo dei Sei Cappelli per Pensare di Edward de Bono.',
      tokensUsed: 0,
    };
  }

  const ai = createGeminiClient();
  const catalogSummary = AGENTS_CATALOG.map(
    (a) => `- ${a.id}: ${a.name} [${a.divisionName}] — ${a.description}`
  ).join('\n');

  const modeGuidelines: Record<string, string> = {
    quick:
      'Seleziona esattamente 2 o 3 agenti più pertinenti per dare una risposta rapida ma solida.',
    full:
      'Seleziona da 5 a 7 agenti necessari tra le divisioni, includendo sempre verification-agent e strategy-agent.',
    debate:
      'Seleziona 4 o 5 agenti con prospettive naturalmente contrastanti (es. black-hat, yellow-hat, green-hat, strategy-agent, verification-agent o financial-planner) per generare un vero dibattito critico.',
    decision:
      'Seleziona almeno 2-3 specialisti pertinenti (Divisione A/B) più tutti i 6 cappelli (white-hat, red-hat, black-hat, yellow-hat, green-hat, blue-hat) e verification-agent.',
  };

  const routingPrompt = `
Sei l'AI CHIEF ORCHESTRATOR dell'AI Multi-Agent Command Center.
Analizza la richiesta dell'utente e pianifica l'attivazione degli agenti per la modalità "${mode}".
Regola per questa modalità: ${modeGuidelines[mode] || modeGuidelines.full}

CATALOGO COMPLETO DEI 16 AGENTI:
${catalogSummary}

RICHIESTA UTENTE:
${prompt}

DOCUMENTI ALLEGATI:
${docsContext.slice(0, 1500)}
`;

  const response = await ai.models.generateContent({
    model: settings.defaultModel,
    contents: routingPrompt,
    config: {
      systemInstruction:
        "Sei l'AI Chief Orchestrator. Seleziona solo ID di agenti esistenti e definisci compiti specifici per ciascuno in italiano.",
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Titolo breve e chiaro della sessione (max 65 caratteri).',
          },
          selectedAgentIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Lista di ID validi degli agenti selezionati.',
          },
          assignments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                agentId: { type: Type.STRING },
                task: { type: Type.STRING },
              },
            },
          },
          orchestratorNotes: {
            type: Type.STRING,
            description: 'Spiegazione sintetica del piano di coordinamento.',
          },
        },
        required: ['title', 'selectedAgentIds', 'assignments', 'orchestratorNotes'],
      },
      thinkingConfig: {
        thinkingLevel: resolveThinkingLevel(settings.defaultModel, 'LOW'),
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    title?: string;
    selectedAgentIds?: string[];
    assignments?: Array<{ agentId: string; task: string }>;
    orchestratorNotes?: string;
  };

  let validIds = (parsed.selectedAgentIds ?? []).filter((id) => AGENTS_BY_ID[id]);

  if (mode === 'decision') {
    const requiredDecisionIds = [
      'white-hat',
      'red-hat',
      'black-hat',
      'yellow-hat',
      'green-hat',
      'blue-hat',
      'verification-agent',
    ];
    for (const reqId of requiredDecisionIds) {
      if (!validIds.includes(reqId)) validIds.push(reqId);
    }
  } else if (mode === 'full') {
    if (!validIds.includes('verification-agent')) validIds.push('verification-agent');
    if (!validIds.includes('strategy-agent')) validIds.push('strategy-agent');
  }

  if (validIds.length === 0) {
    validIds = ['research-agent', 'analysis-agent', 'strategy-agent'];
  }

  const assignmentMap: Record<string, string> = {};
  for (const item of parsed.assignments ?? []) {
    if (AGENTS_BY_ID[item.agentId]) {
      assignmentMap[item.agentId] = item.task;
    }
  }
  for (const id of validIds) {
    if (!assignmentMap[id]) {
      assignmentMap[id] = `Analizza il problema applicando le competenze di ${AGENTS_BY_ID[id].name}.`;
    }
  }

  return {
    title: parsed.title || prompt.slice(0, 68),
    selectedAgentIds: validIds,
    taskAssignments: assignmentMap,
    orchestratorNotes:
      parsed.orchestratorNotes ||
      'Piano di orchestrazione generato automaticamente dal Chief Orchestrator.',
    tokensUsed: response.usageMetadata?.totalTokenCount ?? 0,
  };
}

async function synthesizeFinalReport(params: {
  prompt: string;
  mode: OrchestrationMode;
  runs: AgentRunRecord[];
  messages: AgentMessageRecord[];
  settings: SystemSettings;
}): Promise<{ report: FinalReport; tokensUsed: number }> {
  const { prompt, mode, runs, messages, settings } = params;
  const ai = createGeminiClient();

  const completedRuns = runs.filter((r) => r.status === 'completed' && r.output);
  const runsSummary = completedRuns
    .map((r) => {
      const o = r.output!;
      return `
### ${o.agentName} (${r.agentId}) [Round ${r.round} · Confidenza: ${o.confidenceLevel}%]
- Obiettivo: ${o.objective}
- Analisi: ${o.analysis}
- Evidenze: ${o.evidence.join(' | ') || 'nessuna'}
- Ipotesi: ${o.hypotheses.join(' | ') || 'nessuna'}
- Criticità: ${o.criticalIssues.join(' | ') || 'nessuna'}
- Raccomandazioni: ${o.recommendations.join(' | ') || 'nessuna'}
- Info mancanti: ${o.missingInfo.join(' | ') || 'nessuna'}
`;
    })
    .join('\n');

  const messagesSummary = messages
    .slice(-20)
    .map((m) => `[${m.senderId} -> ${m.receiverId} (${m.messageType})]: ${m.content}`)
    .join('\n');

  const modeExtraRule =
    mode === 'debate'
      ? 'MODALITÀ DEBATE: Non creare un falso consenso! Evidenzia chiaramente dove gli agenti concordano e dove restano in disaccordo.'
      : mode === 'decision'
        ? 'MODALITÀ DECISION: Evidenzia ciò che rimane incerto e specifica chiaramente che la decisione definitiva appartiene sempre all utente.'
        : 'Produci una sintesi esecutiva rigorosa integrando le prospettive senza nascondere rischi o lacune.';

  const synthesisPrompt = `
Sei l'AI CHIEF ORCHESTRATOR. Devi compilare il REPORT FINALE A 9 SEZIONI raccogliendo tutti i risultati degli agenti.

RICHIESTA ORIGINALE:
${prompt}

MODALITÀ OPERATIVA: ${mode}
${modeExtraRule}

ANALISI RACCOLTE DAGLI AGENTI:
${runsSummary}

SCAMBI INTER-AGENTE REGISTRATI:
${messagesSummary || 'Nessuno scambio extra registrato.'}

STILE: ${styleInstruction(settings.responseStyle)}
`;

  const response = await ai.models.generateContent({
    model: settings.defaultModel,
    contents: synthesisPrompt,
    config: {
      systemInstruction:
        "Sei l'AI Chief Orchestrator. Produci il report finale unificato in italiano secondo lo schema JSON a 9 sezioni.",
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: { type: Type.STRING },
          agentAnalysesSummary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                agentId: { type: Type.STRING },
                agentName: { type: Type.STRING },
                keyTakeaway: { type: Type.STRING },
                confidenceLevel: { type: Type.INTEGER },
              },
            },
          },
          pointsOfAgreement: { type: Type.ARRAY, items: { type: Type.STRING } },
          pointsOfDisagreement: { type: Type.ARRAY, items: { type: Type.STRING } },
          risks: { type: Type.ARRAY, items: { type: Type.STRING } },
          opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
          alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
          finalRecommendation: { type: Type.STRING },
          operationalPlan: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                step: { type: Type.INTEGER },
                action: { type: Type.STRING },
                ownerAgent: { type: Type.STRING },
                priority: { type: Type.STRING },
                timeframe: { type: Type.STRING },
              },
            },
          },
          uncertainties: { type: Type.ARRAY, items: { type: Type.STRING } },
          userOwnsDecisionNote: { type: Type.STRING },
        },
        required: [
          'executiveSummary',
          'agentAnalysesSummary',
          'pointsOfAgreement',
          'pointsOfDisagreement',
          'risks',
          'opportunities',
          'alternatives',
          'finalRecommendation',
          'operationalPlan',
        ],
      },
      thinkingConfig: {
        thinkingLevel: resolveThinkingLevel(
          settings.defaultModel,
          settings.thinkingLevel
        ),
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<FinalReport>;
  const report: FinalReport = {
    executiveSummary:
      parsed.executiveSummary || 'Sintesi esecutiva non generata.',
    agentAnalysesSummary: Array.isArray(parsed.agentAnalysesSummary)
      ? parsed.agentAnalysesSummary
      : completedRuns.map((r) => ({
          agentId: r.agentId,
          agentName: r.output!.agentName,
          keyTakeaway: r.output!.analysis.slice(0, 180),
          confidenceLevel: r.output!.confidenceLevel,
        })),
    pointsOfAgreement: Array.isArray(parsed.pointsOfAgreement)
      ? parsed.pointsOfAgreement
      : [],
    pointsOfDisagreement: Array.isArray(parsed.pointsOfDisagreement)
      ? parsed.pointsOfDisagreement
      : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
    alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
    finalRecommendation:
      parsed.finalRecommendation || 'Valutare i prossimi passi operativi.',
    operationalPlan: Array.isArray(parsed.operationalPlan)
      ? parsed.operationalPlan.map((p, idx) => ({
          step: p.step ?? idx + 1,
          action: p.action || '',
          ownerAgent: p.ownerAgent || 'Chief Orchestrator',
          priority:
            p.priority === 'Alta' || p.priority === 'Bassa'
              ? p.priority
              : 'Media',
          timeframe: p.timeframe || 'Breve termine',
        }))
      : [],
    uncertainties: Array.isArray(parsed.uncertainties)
      ? parsed.uncertainties
      : [],
    userOwnsDecisionNote:
      parsed.userOwnsDecisionNote ||
      (mode === 'decision'
        ? 'La decisione definitiva appartiene sempre all’utente.'
        : undefined),
  };

  return {
    report,
    tokensUsed: response.usageMetadata?.totalTokenCount ?? 0,
  };
}

function buildSharedContextText(runs: AgentRunRecord[]): string {
  return runs
    .filter((r) => r.status === 'completed' && r.output)
    .map((r) => {
      const o = r.output!;
      return `[${o.agentName} (${r.agentId}) - Round ${r.round} | Confidenza ${o.confidenceLevel}%]: ${o.analysis}\nCriticità: ${o.criticalIssues.join('; ') || 'nessuna'}\nRaccomandazioni: ${o.recommendations.join('; ') || 'nessuna'}`;
    })
    .join('\n\n');
}

export async function startOrchestrationSession(input: {
  prompt: string;
  mode: OrchestrationMode;
  contextDocIds?: string[];
}): Promise<OrchestrationSession> {
  const settings = getSettings();
  const docs = getKnowledgeDocsByIds(input.contextDocIds ?? []);
  const docsContext = formatDocsContext(docs);

  const session = createSession({
    title: input.prompt.trim().slice(0, 72) || 'Nuova Analisi Multi-Agente',
    prompt: input.prompt.trim(),
    contextDocIds: input.contextDocIds ?? [],
    mode: input.mode,
    selectedAgents: [],
  });

  addAuditLog({
    eventType: 'SESSION_STARTED',
    actor: 'Utente',
    target: session.id,
    details: `Avviata sessione in modalità ${input.mode}: "${session.title}"`,
    severity: 'info',
  });

  // Run pipeline asynchronously in background while streaming SSE events
  void executeOrchestrationPipeline(session.id, input.prompt.trim(), input.mode, docsContext, settings);

  return session;
}

async function executeOrchestrationPipeline(
  sessionId: string,
  prompt: string,
  mode: OrchestrationMode,
  docsContext: string,
  settings: SystemSettings
): Promise<void> {
  const pipelineStart = Date.now();
  let totalTokens = 0;
  const collectedRuns: AgentRunRecord[] = [];
  const collectedMessages: AgentMessageRecord[] = [];

  const trackTokens = (added: number): boolean => {
    totalTokens += added;
    return totalTokens <= settings.tokenLimitPerSession;
  };

  const recordMsg = (
    senderId: string,
    receiverId: string,
    messageType: AgentMessageRecord['messageType'],
    content: string,
    round: number
  ) => {
    const msg = addAgentMessage({
      sessionId,
      senderId,
      receiverId,
      messageType,
      content,
      round,
    });
    collectedMessages.push(msg);
    emitSessionEvent(sessionId, 'agent_message', msg);
    return msg;
  };

  try {
    // 1. Routing & Task Assignment
    const routing = await routeAgentsWithOrchestrator({
      prompt,
      mode,
      docsContext,
      settings,
    });
    trackTokens(routing.tokensUsed);

    updateSession(sessionId, {
      selectedAgents: routing.selectedAgentIds,
      status: 'running',
    });
    emitSessionEvent(sessionId, 'session_updated', getSessionById(sessionId));

    recordMsg(
      'chief-orchestrator',
      'all-selected',
      'task_assignment',
      routing.orchestratorNotes,
      1
    );

    // Pre-queue selected agents so Council of 16 shows queued/active states cleanly
    const concurrency =
      settings.executionMode === 'sequential_strict'
        ? 1
        : Math.max(1, settings.maxActiveAgents);

    // Separate specialists that run in Phase 1 vs Coordinator/Verifier in Phase 2
    let phase1Ids = [...routing.selectedAgentIds];
    let runBlueHatAfter = false;
    let runVerificationAfter = false;

    if (mode === 'six_hats' || mode === 'decision') {
      if (phase1Ids.includes('blue-hat')) {
        phase1Ids = phase1Ids.filter((id) => id !== 'blue-hat');
        runBlueHatAfter = true;
      }
    }
    if (
      mode === 'council16' ||
      mode === 'full' ||
      mode === 'decision'
    ) {
      if (phase1Ids.includes('verification-agent')) {
        phase1Ids = phase1Ids.filter((id) => id !== 'verification-agent');
        runVerificationAfter = true;
      }
    }

    // Emit queued placeholders for UI visibility
    const allOrderedForQueue = [
      ...phase1Ids,
      ...(runBlueHatAfter ? ['blue-hat'] : []),
      ...(runVerificationAfter ? ['verification-agent'] : []),
    ];
    for (const id of allOrderedForQueue) {
      const agent = AGENTS_BY_ID[id];
      if (!agent) continue;
      const queuedRun = upsertAgentRun({
        sessionId,
        agentId: id,
        round: 1,
        status: 'queued',
        modelUsed: settings.agentModels[id] || settings.defaultModel,
      });
      emitSessionEvent(sessionId, 'agent_run_updated', queuedRun);
    }

    // Dispatch individual task assignment messages
    for (const id of phase1Ids) {
      recordMsg(
        'chief-orchestrator',
        id,
        'task_assignment',
        routing.taskAssignments[id] || 'Esegui analisi specialistica.',
        1
      );
    }

    // 2. Execute Phase 1 agents in parallel (bounded by concurrency)
    await runWithConcurrency(phase1Ids, concurrency, async (agentId) => {
      const agent = AGENTS_BY_ID[agentId];
      if (!agent) return;
      const run = await callSingleAgent({
        sessionId,
        agent,
        userPrompt: prompt,
        taskDirective:
          routing.taskAssignments[agentId] ||
          `Analizza la richiesta secondo il tuo ruolo di ${agent.name}.`,
        sharedContextSummary: '',
        docsContext,
        round: 1,
        settings,
        onTokenCheck: trackTokens,
      });
      collectedRuns.push(run);
    });

    // 3. Controlled Inter-Agent Requests (if mode allows and within maxIterations)
    if (
      (mode === 'full' || mode === 'decision') &&
      settings.maxIterations > 1
    ) {
      const pendingQueries: Array<{
        fromId: string;
        targetId: string;
        question: string;
      }> = [];
      for (const r of collectedRuns) {
        if (r.output?.interAgentRequests?.length) {
          for (const req of r.output.interAgentRequests.slice(0, 1)) {
            if (AGENTS_BY_ID[req.targetAgentId] && pendingQueries.length < 3) {
              pendingQueries.push({
                fromId: r.agentId,
                targetId: req.targetAgentId,
                question: req.question,
              });
            }
          }
        }
      }

      if (pendingQueries.length > 0) {
        const sharedSnap = buildSharedContextText(collectedRuns);
        await runWithConcurrency(pendingQueries, concurrency, async (q) => {
          recordMsg(q.fromId, q.targetId, 'inter_agent_query', q.question, 2);
          const targetAgent = AGENTS_BY_ID[q.targetId];
          const replyRun = await callSingleAgent({
            sessionId,
            agent: targetAgent,
            userPrompt: prompt,
            taskDirective: `Rispondi alla richiesta specifica ricevuta da ${AGENTS_BY_ID[q.fromId]?.name || q.fromId}: "${q.question}"`,
            sharedContextSummary: sharedSnap,
            docsContext,
            round: 2,
            settings,
            onTokenCheck: trackTokens,
          });
          collectedRuns.push(replyRun);
          if (replyRun.output) {
            recordMsg(
              q.targetId,
              q.fromId,
              'inter_agent_reply',
              replyRun.output.analysis.slice(0, 320),
              2
            );
          }
        });
      }
    }

    // 4. Debate Mode Round 2 (Cross-Examination, NO false consensus)
    if (mode === 'debate') {
      const sharedRound1 = buildSharedContextText(collectedRuns);
      await runWithConcurrency(phase1Ids, concurrency, async (agentId) => {
        const agent = AGENTS_BY_ID[agentId];
        if (!agent) return;
        recordMsg(
          'chief-orchestrator',
          agentId,
          'verification_challenge',
          'Round 2 Dibattito: contesta le debolezze altrui, difendi le tue tesi ed evidenzia accordi/disaccordi reali.',
          2
        );
        const debateRun = await callSingleAgent({
          sessionId,
          agent,
          userPrompt: prompt,
          taskDirective:
            'ROUND 2 DEBATE MODE: Esamina le posizioni degli altri agenti nel Contesto Condiviso. Contesta esplicitamente ipotesi deboli o conclusioni opposte, segnala dove sei d accordo e dove resti in disaccordo. Non creare un falso consenso.',
          sharedContextSummary: sharedRound1,
          docsContext,
          round: 2,
          settings,
          onTokenCheck: trackTokens,
        });
        collectedRuns.push(debateRun);
      });
    }

    // 5. Blue Hat synthesis (Six Hats / Decision Mode)
    if (runBlueHatAfter) {
      const hatsSnapshot = buildSharedContextText(collectedRuns);
      recordMsg(
        'chief-orchestrator',
        'blue-hat',
        'synthesis_input',
        'Coordina e sintetizza le prospettive dei Cappelli Bianco, Rosso, Nero, Giallo e Verde.',
        2
      );
      const blueRun = await callSingleAgent({
        sessionId,
        agent: AGENTS_BY_ID['blue-hat'],
        userPrompt: prompt,
        taskDirective:
          'Raccogli i risultati dei cinque cappelli precedenti nel Contesto Condiviso, evidenzia punti di convergenza, disaccordi e prepara la sintesi metodologica dei Sei Cappelli.',
        sharedContextSummary: hatsSnapshot,
        docsContext,
        round: 2,
        settings,
        onTokenCheck: trackTokens,
      });
      collectedRuns.push(blueRun);
    }

    // 6. Verification Agent Audit (Full, Council 16, Decision)
    if (runVerificationAfter) {
      updateSession(sessionId, { status: 'verifying' });
      emitSessionEvent(sessionId, 'session_updated', getSessionById(sessionId));

      const fullSnapshot = buildSharedContextText(collectedRuns);
      recordMsg(
        'chief-orchestrator',
        'verification-agent',
        'verification_challenge',
        'Esegui audit rigoroso delle risposte raccolte individuando contraddizioni, rischi e info non supportate.',
        2
      );

      const verRun = await callSingleAgent({
        sessionId,
        agent: AGENTS_BY_ID['verification-agent'],
        userPrompt: prompt,
        taskDirective:
          'AUDIT GLOBALE: Controlla tutte le risposte degli altri agenti nel Contesto Condiviso. Individua contraddizioni, affermazioni non supportate e rischi. Se serve un chiarimento critico, usa interAgentRequests indicando l ID esatto dell agente.',
        sharedContextSummary: fullSnapshot,
        docsContext,
        round: 2,
        settings,
        onTokenCheck: trackTokens,
      });
      collectedRuns.push(verRun);

      // Council of 16 targeted follow-up requests if Verification Agent flagged peers
      if (
        mode === 'council16' &&
        settings.maxIterations >= 2 &&
        verRun.output?.interAgentRequests?.length
      ) {
        const followups = verRun.output.interAgentRequests.slice(0, 2);
        await runWithConcurrency(followups, concurrency, async (req) => {
          const targetAgent = AGENTS_BY_ID[req.targetAgentId];
          if (!targetAgent) return;
          recordMsg(
            'verification-agent',
            req.targetAgentId,
            'followup_request',
            `Richiesta approfondimento: ${req.question} (Motivo: ${req.reason})`,
            3
          );
          const fRun = await callSingleAgent({
            sessionId,
            agent: targetAgent,
            userPrompt: prompt,
            taskDirective: `APPROFONDIMENTO RICHIESTO DAL VERIFICATION AGENT: "${req.question}". Correggi o integra la tua valutazione precedente.`,
            sharedContextSummary: fullSnapshot,
            docsContext,
            round: 3,
            settings,
            onTokenCheck: trackTokens,
          });
          collectedRuns.push(fRun);
        });
      }
    }

    // 7. Chief Orchestrator Final Synthesis (9-Section Report)
    updateSession(sessionId, { status: 'synthesizing' });
    emitSessionEvent(sessionId, 'session_updated', getSessionById(sessionId));

    const synthesis = await synthesizeFinalReport({
      prompt,
      mode,
      runs: collectedRuns,
      messages: collectedMessages,
      settings,
    });
    trackTokens(synthesis.tokensUsed);

    const durationMs = Date.now() - pipelineStart;
    updateSession(sessionId, {
      status: 'completed',
      finalReport: synthesis.report,
      totalTokens,
      durationMs,
      completedAt: new Date().toISOString(),
    });

    const completedSession = getSessionById(sessionId);
    emitSessionEvent(sessionId, 'session_completed', completedSession);

    addAuditLog({
      eventType: 'SESSION_COMPLETED',
      actor: 'AI Chief Orchestrator',
      target: sessionId,
      details: `Sessione ${mode} completata in ${Math.round(durationMs / 1000)}s con ${collectedRuns.length} esecuzioni agente e ${totalTokens} token totali.`,
      severity: 'info',
    });
  } catch (err) {
    const errorMessage = formatGeminiError(err);
    const durationMs = Date.now() - pipelineStart;
    updateSession(sessionId, {
      status: 'failed',
      errorMessage,
      totalTokens,
      durationMs,
      completedAt: new Date().toISOString(),
    });
    const failedSession = getSessionById(sessionId);
    emitSessionEvent(sessionId, 'session_failed', {
      errorMessage,
      session: failedSession,
    });

    addAuditLog({
      eventType: 'SESSION_FAILED',
      actor: 'AI Chief Orchestrator',
      target: sessionId,
      details: errorMessage,
      severity: 'critical',
    });
  }
}

export async function runSingleAgentTest(input: {
  agentId: string;
  prompt: string;
  contextDocIds?: string[];
}): Promise<{ session: OrchestrationSession; run: AgentRunRecord }> {
  const agent = AGENTS_BY_ID[input.agentId];
  if (!agent) {
    throw new Error(`Agente "${input.agentId}" non trovato.`);
  }
  const settings = getSettings();
  const docs = getKnowledgeDocsByIds(input.contextDocIds ?? []);
  const docsContext = formatDocsContext(docs);

  const session = createSession({
    title: `Test ${agent.name}: ${input.prompt.slice(0, 50)}`,
    prompt: input.prompt,
    contextDocIds: input.contextDocIds ?? [],
    mode: 'single_test',
    selectedAgents: [agent.id],
  });

  const startMs = Date.now();
  const run = await callSingleAgent({
    sessionId: session.id,
    agent,
    userPrompt: input.prompt,
    taskDirective: `Test operativo individuale su richiesta diretta dell'utente.`,
    sharedContextSummary: '',
    docsContext,
    round: 1,
    settings,
  });

  const durationMs = Date.now() - startMs;
  if (run.status === 'error') {
    updateSession(session.id, {
      status: 'failed',
      errorMessage: run.errorMessage,
      totalTokens: run.tokensUsed,
      durationMs,
      completedAt: new Date().toISOString(),
    });
  } else {
    updateSession(session.id, {
      status: 'completed',
      totalTokens: run.tokensUsed,
      durationMs,
      completedAt: new Date().toISOString(),
    });
  }

  return {
    session: getSessionById(session.id)!,
    run,
  };
}
