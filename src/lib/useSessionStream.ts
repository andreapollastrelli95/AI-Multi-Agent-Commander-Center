import { useEffect, useState } from 'react';
import { api } from './api';
import type {
  AgentMessageRecord,
  AgentRunRecord,
  ApprovalRequestRecord,
  OrchestrationSession,
} from '../shared/types';

export function useSessionStream(
  sessionId: string | null,
  onFinished?: () => void
) {
  const [session, setSession] = useState<OrchestrationSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }

    let closed = false;
    setLoading(true);
    setStreamError(null);

    // Fetch current snapshot first for immediate render
    api
      .getSession(sessionId)
      .then((s) => {
        if (!closed) {
          setSession(s);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!closed) {
          setStreamError(
            err instanceof Error ? err.message : 'Errore caricamento sessione.'
          );
          setLoading(false);
        }
      });

    const es = new EventSource(`/api/sessions/${sessionId}/stream`);

    es.addEventListener('snapshot', (e) => {
      if (closed) return;
      const snap = JSON.parse((e as MessageEvent).data) as OrchestrationSession;
      setSession(snap);
      setLoading(false);
    });

    es.addEventListener('session_updated', (e) => {
      if (closed) return;
      const updated = JSON.parse((e as MessageEvent).data) as OrchestrationSession;
      setSession(updated);
    });

    es.addEventListener('agent_run_updated', (e) => {
      if (closed) return;
      const run = JSON.parse((e as MessageEvent).data) as AgentRunRecord;
      setSession((prev) => {
        if (!prev) return prev;
        const existingRuns = prev.agentRuns ?? [];
        const idx = existingRuns.findIndex((r) => r.id === run.id);
        const nextRuns =
          idx >= 0
            ? existingRuns.map((r, i) => (i === idx ? run : r))
            : [...existingRuns, run];
        return { ...prev, agentRuns: nextRuns };
      });
    });

    es.addEventListener('agent_message', (e) => {
      if (closed) return;
      const msg = JSON.parse((e as MessageEvent).data) as AgentMessageRecord;
      setSession((prev) => {
        if (!prev) return prev;
        const existingMsgs = prev.messages ?? [];
        if (existingMsgs.some((m) => m.id === msg.id)) return prev;
        return { ...prev, messages: [...existingMsgs, msg] };
      });
    });

    es.addEventListener('approval_required', (e) => {
      if (closed) return;
      const apr = JSON.parse((e as MessageEvent).data) as ApprovalRequestRecord;
      setSession((prev) => {
        if (!prev) return prev;
        const existing = prev.approvals ?? [];
        if (existing.some((a) => a.id === apr.id)) return prev;
        return { ...prev, approvals: [apr, ...existing] };
      });
    });

    es.addEventListener('session_completed', (e) => {
      if (closed) return;
      const completed = JSON.parse(
        (e as MessageEvent).data
      ) as OrchestrationSession;
      setSession(completed);
      es.close();
      onFinished?.();
    });

    es.addEventListener('session_failed', (e) => {
      if (closed) return;
      const payload = JSON.parse((e as MessageEvent).data) as {
        errorMessage?: string;
        session?: OrchestrationSession;
      };
      if (payload.session) setSession(payload.session);
      if (payload.errorMessage) setStreamError(payload.errorMessage);
      es.close();
      onFinished?.();
    });

    es.onerror = () => {
      if (closed) return;
      // Only close on fatal error if session is already terminal
      setSession((prev) => {
        if (prev && (prev.status === 'completed' || prev.status === 'failed')) {
          es.close();
        }
        return prev;
      });
    };

    return () => {
      closed = true;
      es.close();
    };
  }, [sessionId]);

  return { session, setSession, loading, streamError };
}
