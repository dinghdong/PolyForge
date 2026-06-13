/**
 * In-memory state + SSE fan-out (D1: no database for the hackathon build).
 *
 * Multi-mandate runtime: many Mandates run concurrently. A Mandate binds a
 * user's guardrails + execution to an Agent (brain, an AgentNFA). Each has its
 * own budget accounting; market signals fan out to every active mandate.
 */
import type { Response } from 'express';
import type { BoardSnapshot } from './polymarket';

export type TelemetrySource = 'venice' | 'guardrail' | 'relayer' | 'contract' | 'system';
export type TelemetryType = 'info' | 'success' | 'warning' | 'error';

export type TelemetryLog = {
  id: string;
  timestamp: string;
  source: TelemetrySource;
  message: string;
  type: TelemetryType;
};

export type Position = {
  id: string;
  betId?: number;
  marketId: number;
  outcomeIndex: 0 | 1;
  mandateId?: string; // which running mandate opened this position
  agentId?: number; // which AgentNFA brain
  agentLabel?: string;
  bettor?: string;
  marketName: string;
  polymarketUrl?: string;
  selectedOutcome: 'YES' | 'NO';
  betAmountUsdc: number;
  entryOdds: number;
  currentValueUsdc: number;
  status: 'PENDING' | 'OPEN' | 'WON' | 'LOST' | 'FAILED';
  taskId?: string;
  txHash?: string;
  recordTxHash?: string;
  rail: 'star' | 'follower';
};

export type MandateConfig = {
  agentId?: number; // AgentNFA tokenId this mandate runs (undefined = ad-hoc brain)
  agentLabel?: string;
  modelId: string;
  prompt: string;
  maxSpendPerMatch: number;
  maxDailyAllowance: number;
  expiryDate: string;
  copyTrade: boolean; // also mirror via 3-hop follower rail
};

export type Mandate = MandateConfig & {
  id: string;
  mode: 'headless' | 'browser';
  active: boolean;
  spentToday: number;
  spentPerMatch: Map<string, number>;
  createdAt: number;
};

const logs: TelemetryLog[] = [];
const positions: Position[] = [];
const mandates = new Map<string, Mandate>();
let mandateSeq = 0;
let lastBoard: BoardSnapshot = { matches: [], futures: [] };

const sseClients = new Set<Response>();
let seq = 0;

export function sseSubscribe(res: Response) {
  sseClients.add(res);
  for (const log of logs.slice(-40)) {
    res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
  }
  if (lastBoard.matches.length > 0 || lastBoard.futures.length > 0) {
    res.write(`event: markets\ndata: ${JSON.stringify(lastBoard)}\n\n`);
  }
  res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
}

export function sseUnsubscribe(res: Response) {
  sseClients.delete(res);
}

function broadcast(event: string, data: unknown) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(frame);
}

export function pushLog(source: TelemetrySource, type: TelemetryType, message: string): TelemetryLog {
  const log: TelemetryLog = {
    id: `log-${++seq}`,
    timestamp: new Date().toISOString(),
    source,
    message,
    type,
  };
  logs.push(log);
  if (logs.length > 500) logs.shift();
  broadcast('log', log);
  // eslint-disable-next-line no-console
  console.log(`[${source}] ${message}`);
  return log;
}

export function pushBoard(board: BoardSnapshot) {
  lastBoard = board;
  broadcast('markets', board);
}

// ---------- Mandates ----------

export function createMandate(cfg: MandateConfig, mode: 'headless' | 'browser'): Mandate {
  const m: Mandate = {
    ...cfg,
    id: `m-${++mandateSeq}`,
    mode,
    active: true,
    spentToday: 0,
    spentPerMatch: new Map(),
    createdAt: Date.now(),
  };
  mandates.set(m.id, m);
  broadcast('state', snapshot());
  return m;
}

export function getMandate(id: string): Mandate | undefined {
  return mandates.get(id);
}

export function getActiveMandates(): Mandate[] {
  return [...mandates.values()].filter((m) => m.active);
}

export function getAllMandates(): Mandate[] {
  return [...mandates.values()];
}

export function stopMandate(id: string): boolean {
  const m = mandates.get(id);
  if (!m) return false;
  m.active = false;
  broadcast('state', snapshot());
  return true;
}

export function stopAllMandates() {
  for (const m of mandates.values()) m.active = false;
  broadcast('state', snapshot());
}

// per-mandate budget accounting
export function mandateBudgetLeft(m: Mandate): number {
  return Math.max(0, m.maxDailyAllowance - m.spentToday);
}
export function mandateMatchSpent(m: Mandate, key: string): number {
  return m.spentPerMatch.get(key) ?? 0;
}
export function addMandateSpent(m: Mandate, key: string, usdc: number) {
  m.spentToday += usdc;
  m.spentPerMatch.set(key, (m.spentPerMatch.get(key) ?? 0) + usdc);
  broadcast('state', snapshot());
}

// ---------- Positions ----------

export function upsertPosition(p: Position) {
  const i = positions.findIndex((x) => x.id === p.id);
  if (i >= 0) positions[i] = p;
  else positions.push(p);
  broadcast('state', snapshot());
}

export function getPositions() {
  return positions;
}

// ---------- Snapshot (serializable; Maps omitted) ----------

function mandateView(m: Mandate) {
  const pos = positions.filter((p) => p.mandateId === m.id);
  return {
    id: m.id,
    agentId: m.agentId,
    agentLabel: m.agentLabel,
    modelId: m.modelId,
    mode: m.mode,
    active: m.active,
    maxSpendPerMatch: m.maxSpendPerMatch,
    maxDailyAllowance: m.maxDailyAllowance,
    expiryDate: m.expiryDate,
    copyTrade: m.copyTrade,
    spentToday: m.spentToday,
    budgetLeftUsdc: mandateBudgetLeft(m),
    createdAt: m.createdAt,
    positions: pos.length,
    openPositions: pos.filter((p) => p.status === 'OPEN' || p.status === 'PENDING').length,
  };
}

export function snapshot() {
  const active = getActiveMandates();
  return {
    mandates: getAllMandates().map(mandateView),
    activeCount: active.length,
    agentActive: active.length > 0,
    budgetLeftUsdc: active.reduce((s, m) => s + mandateBudgetLeft(m), 0),
    spentTodayUsdc: getAllMandates().reduce((s, m) => s + m.spentToday, 0),
    positions,
  };
}
