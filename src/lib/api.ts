/**
 * Server API client + SSE telemetry hook. The vite dev server proxies
 * /api → localhost:8788 (see vite.config.ts).
 */
import { useEffect, useRef, useState } from 'react';
import type { TelemetryLog } from '../types';

export type ServerMatch = {
  kind: 'kickoff' | 'tick' | 'chance' | 'goal' | 'odds-shift' | 'fulltime';
  minute: number;
  teamHome: string;
  teamAway: string;
  scoreHome: number;
  scoreAway: number;
  description: string;
  odds: { home: number; away: number };
  oddsSource?: string;
};

export type ServerPosition = {
  id: string;
  marketName: string;
  selectedOutcome: 'YES' | 'NO';
  betAmountUsdc: number;
  entryOdds: number;
  currentValueUsdc: number;
  status: 'PENDING' | 'OPEN' | 'WON' | 'LOST' | 'FAILED';
  txHash?: string;
  rail: 'star' | 'follower';
};

export type ServerState = {
  agentActive: boolean;
  agentConfig?: unknown;
  spentTodayUsdc: number;
  budgetLeftUsdc: number;
  positions: ServerPosition[];
  market?: string | null;
  usdc?: string;
  agentA?: string;
  user?: string;
  balanceUsdc?: number | null;
};

async function post<T = { ok: boolean }>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export const api = {
  saveAgentConfig: (cfg: {
    modelId: string;
    prompt: string;
    maxSpendPerMatch: number;
    maxDailyAllowance: number;
    expiryDate: string;
    copyTrade?: boolean;
  }) => post('/api/agents', cfg),
  activateHeadless: () => post('/api/agents/activate', { mode: 'headless' }),
  activateBrowser: (permissionContext: string) => post('/api/agents/activate', { mode: 'browser', permissionContext }),
  deactivate: () => post('/api/agents/deactivate'),
  simEvent: (type: 'goal-home' | 'goal-away') => post('/api/sim/event', { type }),
  getState: async (): Promise<ServerState> => {
    const res = await fetch('/api/state');
    return (await res.json()) as ServerState;
  },
};

/** Live telemetry over SSE with auto-reconnect. */
export function useTelemetry() {
  const [logs, setLogs] = useState<TelemetryLog[]>([]);
  const [match, setMatch] = useState<ServerMatch | null>(null);
  const [state, setState] = useState<ServerState | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const es = new EventSource('/api/telemetry');
      esRef.current = es;
      es.onopen = () => setConnected(true);
      es.addEventListener('log', (e) => {
        const log = JSON.parse((e as MessageEvent).data) as TelemetryLog;
        setLogs((prev) => {
          if (prev.some((p) => p.id === log.id)) return prev;
          const next = [...prev, log];
          return next.length > 200 ? next.slice(-200) : next;
        });
      });
      es.addEventListener('match', (e) => setMatch(JSON.parse((e as MessageEvent).data) as ServerMatch));
      es.addEventListener('state', (e) => setState(JSON.parse((e as MessageEvent).data) as ServerState));
      es.onerror = () => {
        setConnected(false);
        es.close();
        if (!stopped) setTimeout(connect, 2500);
      };
    };

    connect();
    void api.getState().then(setState).catch(() => {});
    return () => {
      stopped = true;
      esRef.current?.close();
    };
  }, []);

  return { logs, match, state, connected };
}
