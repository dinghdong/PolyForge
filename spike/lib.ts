/**
 * Shared spike utilities — mirrors the 1Shot public-relayer skill's
 * reference helpers (.claude/skills/public-relayer/references/examples.md).
 */
import 'dotenv/config';
import { config } from 'dotenv';
import { createPublicClient, http, erc20Abi, formatUnits, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { bytesToHex } from 'viem/utils';

config({ path: '.env.local' });

export const RELAYER_URL = 'https://relayer.1shotapi.dev/relayers';
export const CHAIN = sepolia;
export const CHAIN_ID = sepolia.id; // 11155111

export const publicClient = createPublicClient({ chain: CHAIN, transport: http() });

type JsonRpc<T> =
  | { jsonrpc: '2.0'; id: number | string; result: T }
  | { jsonrpc: '2.0'; id: number | string; error: { code: number; message: string; data?: unknown } };

export async function rpc<T>(method: string, params: unknown, id = 1): Promise<T> {
  const res = await fetch(RELAYER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const json = (await res.json()) as JsonRpc<T>;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  if ('error' in json) {
    throw new Error(`[${json.error.code}] ${json.error.message} ${JSON.stringify(json.error.data ?? '')}`);
  }
  return json.result;
}

/** Convert delegation bigints / Uint8Arrays into JSON-safe shapes. */
export function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return `0x${value.toString(16)}`;
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (Array.isArray(value)) return value.map(toRelayerJson);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toRelayerJson(v);
    return out;
  }
  return value;
}

export type Estimate7710Result = {
  success: boolean;
  paymentTokenAddress?: `0x${string}`;
  paymentChain?: number;
  gasUsed?: Record<string, string>;
  requiredPaymentAmount?: string;
  context?: string;
  contextByChainId?: Record<string, string>;
  error?: string;
};

export type ChainCaps = {
  feeCollector: `0x${string}`;
  targetAddress: `0x${string}`;
  tokens: { address: `0x${string}`; symbol?: string; decimals: number | string }[];
};

export async function getCaps(): Promise<ChainCaps> {
  const caps = await rpc<Record<string, ChainCaps>>('relayer_getCapabilities', [CHAIN_ID]);
  const c = caps[String(CHAIN_ID)];
  if (!c) throw new Error(`relayer has no capabilities for chain ${CHAIN_ID}`);
  return c;
}

export function requireAccounts() {
  const keys = ['SPIKE_USER_PK', 'SPIKE_AGENT_A_PK', 'SPIKE_AGENT_B_PK'] as const;
  for (const k of keys) {
    if (!process.env[k]) throw new Error(`${k} missing — run: npx tsx spike/00-setup.ts`);
  }
  return {
    user: privateKeyToAccount(process.env.SPIKE_USER_PK as `0x${string}`),
    agentA: privateKeyToAccount(process.env.SPIKE_AGENT_A_PK as `0x${string}`),
    agentB: privateKeyToAccount(process.env.SPIKE_AGENT_B_PK as `0x${string}`),
  };
}

export async function printBalances(label: string, address: `0x${string}`, usdcAddress: `0x${string}`) {
  const [eth, usdc] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    }),
  ]);
  console.log(`  ${label}  ${address}  ETH=${formatEther(eth)}  USDC=${formatUnits(usdc, 6)}`);
  return { eth, usdc };
}
