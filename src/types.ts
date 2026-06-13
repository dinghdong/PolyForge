/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ModelId = 'venice-llama3-70b' | 'deepseek-r1-70b' | 'hermes3-llama8b';
export type RelayerMode = '1shot' | 'standard';
export type StyleId = 'brutalist';

export interface AgentConfig {
  agentId?: number; // AgentNFA tokenId this mandate runs (undefined = ad-hoc brain)
  agentLabel?: string;
  modelId: ModelId;
  prompt: string;
  knowledgeFileName: string;
  knowledgeRowCount: number;
  knowledgeSizeKb: number;
  targetContract: string;
  maxSpendPerMatch: number;
  maxDailyAllowance: number;
  expiryDate: string;
  onlyBuy: boolean;
  restrictSell: boolean;
  forbidWithdrawal: boolean;
  relayerMode: RelayerMode;
  gasAbstraction: boolean;
}

export interface SimulationStats {
  balanceUsdc: number;
  totalBetsPlaced: number;
  totalVolumeUsdc: number;
  pnlUsdc: number;
  agentStatus: 'idle' | 'authorizing' | 'active' | 'paused';
}

export interface MatchState {
  minute: number;
  teamHome: string;
  teamAway: string;
  scoreHome: number;
  scoreAway: number;
  ballPosition: number; // 10 to 90 representing positions from home goal to away goal
  phase: 'pre' | 'live' | 'halftime' | 'fulltime';
  lastActionDescription: string;
}

export interface TelemetryLog {
  id: string;
  timestamp: string;
  source: 'venice' | 'guardrail' | 'relayer' | 'contract' | 'system';
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface ActivePosition {
  id: string;
  marketName: string;
  selectedOutcome: 'YES' | 'NO';
  betAmountUsdc: number;
  entryOdds: number;
  currentValueUsdc: number;
  status: 'OPEN' | 'WON' | 'LOST';
}
