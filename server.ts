import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_CATALOG } from './src/shared/agentsCatalog.ts';
import type { OrchestrationMode, SystemSettings } from './src/shared/types.ts';
import {
  addAuditLog,
  clearAllSessions,
  countPendingApprovals,
  createKnowledgeDoc,
  deleteKnowledgeDoc,
  deleteSession,
  exportFullDatabaseBackup,
  getSessionById,
  getSettings,
  listApprovalRequests,
  listAuditLogs,
  listKnowledgeDocs,
  listSessions,
  resetSettings,
  resolveApprovalRequest,
  updateSession,
  updateSettings,
} from './src/server/db.ts';
import {
  isApiKeyConfigured,
  runSingleAgentTest,
  startOrchestrationSession,
  subscribeToSessionEvents,
} from './src/server/orchestrator.ts';

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '2mb' }));

  // =========================================================================
  // API ROUTES
  // =========================================================================

  app.get('/api/health', (_req, res) => {
    const settings = getSettings();
    res.json({
      status: 'ok',
      apiKeyConfigured: isApiKeyConfigured(),
      provider: settings.provider,
      databaseReady: true,
      agentsCount: AGENTS_CATALOG.length,
      pendingApprovalsCount: countPendingApprovals(),
    });
  });

  app.get('/api/agents', (_req, res) => {
    res.json({ agents: AGENTS_CATALOG });
  });

  app.post('/api/agents/:id/test', async (req, res) => {
    try {
      const agentId = req.params.id;
      const { prompt, contextDocIds } = req.body as {
        prompt?: string;
        contextDocIds?: string[];
      };

      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'Inserisci un prompt per testare l’agente.' });
        return;
      }

      const result = await runSingleAgentTest({
        agentId,
        prompt: prompt.trim(),
        contextDocIds: Array.isArray(contextDocIds) ? contextDocIds : [],
      });

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore nel test agente.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/sessions', async (req, res) => {
    try {
      const { prompt, mode, contextDocIds } = req.body as {
        prompt?: string;
        mode?: OrchestrationMode;
        contextDocIds?: string[];
      };

      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'Inserisci una richiesta valida.' });
        return;
      }

      const validModes: OrchestrationMode[] = [
        'quick',
        'full',
        'council16',
        'debate',
        'decision',
        'six_hats',
      ];
      const safeMode: OrchestrationMode = validModes.includes(mode as OrchestrationMode)
        ? (mode as OrchestrationMode)
        : 'full';

      const session = await startOrchestrationSession({
        prompt: prompt.trim(),
        mode: safeMode,
        contextDocIds: Array.isArray(contextDocIds) ? contextDocIds : [],
      });

      res.status(201).json({ session });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Errore avvio sessione.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/sessions', (_req, res) => {
    const sessions = listSessions(150);
    res.json({ sessions });
  });

  app.get('/api/sessions/:id', (req, res) => {
    const session = getSessionById(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Sessione non trovata.' });
      return;
    }
    res.json({ session });
  });

  app.get('/api/sessions/:id/stream', (req, res) => {
    const sessionId = req.params.id;
    const current = getSessionById(sessionId);
    if (!current) {
      res.status(404).json({ error: 'Sessione non trovata.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (eventName: string, data: unknown) => {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send initial snapshot immediately
    sendEvent('snapshot', current);

    if (current.status === 'completed' || current.status === 'failed') {
      res.end();
      return;
    }

    const unsubscribe = subscribeToSessionEvents(sessionId, (payload) => {
      sendEvent(payload.type, payload.data);
      if (
        payload.type === 'session_completed' ||
        payload.type === 'session_failed'
      ) {
        setTimeout(() => {
          unsubscribe();
          res.end();
        }, 150);
      }
    });

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  app.patch('/api/sessions/:id/decision', (req, res) => {
    const session = getSessionById(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Sessione non trovata.' });
      return;
    }
    const { decision } = req.body as { decision?: string };
    if (!decision || !decision.trim()) {
      res.status(400).json({ error: 'Inserisci la decisione finale.' });
      return;
    }

    updateSession(session.id, { userDecision: decision.trim() });
    addAuditLog({
      eventType: 'USER_DECISION_RECORDED',
      actor: 'Utente',
      target: session.id,
      details: `Decisione definitiva registrata dall'utente: "${decision.trim().slice(0, 120)}"`,
      severity: 'info',
    });

    res.json({ session: getSessionById(session.id) });
  });

  app.delete('/api/sessions/:id', (req, res) => {
    deleteSession(req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/sessions', (_req, res) => {
    clearAllSessions();
    res.json({ ok: true });
  });

  // Approvals & Audit
  app.get('/api/approvals', (_req, res) => {
    res.json({ approvals: listApprovalRequests() });
  });

  app.post('/api/approvals/:id/resolve', (req, res) => {
    const { decision } = req.body as { decision?: 'approved' | 'rejected' };
    if (decision !== 'approved' && decision !== 'rejected') {
      res.status(400).json({ error: 'Decisione non valida.' });
      return;
    }
    const updated = resolveApprovalRequest(req.params.id, decision);
    if (!updated) {
      res.status(404).json({ error: 'Richiesta non trovata.' });
      return;
    }
    res.json({ approval: updated });
  });

  app.get('/api/audit-logs', (_req, res) => {
    res.json({ logs: listAuditLogs(200) });
  });

  // Knowledge Base
  app.get('/api/knowledge-docs', (_req, res) => {
    res.json({ docs: listKnowledgeDocs() });
  });

  app.post('/api/knowledge-docs', (req, res) => {
    const { title, content, tags } = req.body as {
      title?: string;
      content?: string;
      tags?: string;
    };
    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: 'Titolo e contenuto sono obbligatori.' });
      return;
    }
    const doc = createKnowledgeDoc({
      title: title.trim(),
      content: content.trim(),
      tags: (tags || '').trim(),
    });
    res.status(201).json({ doc });
  });

  app.delete('/api/knowledge-docs/:id', (req, res) => {
    deleteKnowledgeDoc(req.params.id);
    res.json({ ok: true });
  });

  // Settings & Backup
  app.get('/api/settings', (_req, res) => {
    res.json({ settings: getSettings() });
  });

  app.put('/api/settings', (req, res) => {
    const payload = req.body as Partial<SystemSettings>;
    const updated = updateSettings(payload);
    res.json({ settings: updated });
  });

  app.post('/api/settings/reset', (_req, res) => {
    const reset = resetSettings();
    res.json({ settings: reset });
  });

  app.get('/api/export/backup', (_req, res) => {
    const backup = exportFullDatabaseBackup();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="command-center-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.send(JSON.stringify(backup, null, 2));
  });

  // =========================================================================
  // VITE / STATIC SERVING
  // =========================================================================

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build frontend non trovata. Esegui npm run build.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(
      `AI Multi-Agent Command Center attivo su http://0.0.0.0:${port}`
    );
  });
}

startServer().catch((err) => {
  console.error('Errore avvio server:', err);
  process.exit(1);
});
