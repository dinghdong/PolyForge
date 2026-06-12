/**
 * In-memory state + SSE fan-out (D1: no database for the hackathon build).
 * Telemetry shape mirrors the frontend's TelemetryLog type.
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

export type AgentRuntimeConfig = {
  modelId: string;
  prompt: string;
  maxSpendPerMatch: number;
  maxDailyAllowance: number;
  expiryDate: string;
  copyTrade: boolean; // also mirror via 3-hop follower rail
};

const logs: TelemetryLog[] = [];
const positions: Position[] = [];
let agentConfig: AgentRuntimeConfig | undefined;
let agentActive = false;
let spentTodayUsdc = 0;
const spentPerMatch = new Map<string, number>();
let lastBoard: BoardSnapshot = { matches: [], futures: [] };

const sseClients = new Set<Response>();
let seq = 0;

export function sseSubscribe(res: Response) {
  sseClients.add(res);
  // replay recent history so a fresh console isn't empty
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

/** Max-Spend-Per-Match guardrail accounting (key = match event slug). */
export function matchSpent(key: string): number {
  return spentPerMatch.get(key) ?? 0;
}
export function addMatchSpent(key: string, usdc: number) {
  spentPerMatch.set(key, (spentPerMatch.get(key) ?? 0) + usdc);
}

export function upsertPosition(p: Position) {
  const i = positions.findIndex((x) => x.id === p.id);
  if (i >= 0) positions[i] = p;
  else positions.push(p);
  broadcast('state', snapshot());
}

export function getPositions() {
  return positions;
}

export function setAgentConfig(cfg: AgentRuntimeConfig) {
  agentConfig = cfg;
}
export function getAgentConfig() {
  return agentConfig;
}
export function setAgentActive(active: boolean) {
  agentActive = active;
  broadcast('state', snapshot());
}
export function isAgentActive() {
  return agentActive;
}
export function addSpent(usdc: number) {
  spentTodayUsdc += usdc;
}
export function budgetLeft(): number {
  return Math.max(0, (agentConfig?.maxDailyAllowance ?? 0) - spentTodayUsdc);
}

export function snapshot() {
  return {
    agentActive,
    agentConfig,
    spentTodayUsdc,
    budgetLeftUsdc: budgetLeft(),
    positions,
  };
}
