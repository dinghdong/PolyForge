/**
 * 1Shot public relayer client — JSON-RPC, fee-converging estimate→send,
 * and Ed25519 webhook verification. Shapes follow the installed skill:
 * .claude/skills/public-relayer/ (SKILL.md + references).
 */
import { webcrypto } from 'node:crypto';
import { bytesToHex } from 'viem/utils';

export const RELAYER_URL = process.env.RELAYER_URL ?? 'https://relayer.1shotapi.dev/relayers';

type JsonRpc<T> =
  | { jsonrpc: '2.0'; id: number | string; result: T }
  | { jsonrpc: '2.0'; id: number | string; error: { code: number; message: string; data?: unknown } };

export async function rpc<T>(method: string, params: unknown, id = 1): Promise<T> {
  // transient network failures shouldn't kill a bet — retry fetch-level
  // errors (JSON-RPC errors are NOT retried; they're real answers)
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
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
    } catch (e) {
      const msg = (e as Error).message ?? '';
      const isNetwork = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket/i.test(msg);
      if (!isNetwork || attempt === 3) throw e;
      lastError = e as Error;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError ?? new Error('rpc failed');
}

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
  gasUsed?: Record<string, string>;
  requiredPaymentAmount?: string;
  context?: string;
  error?: string;
};

export type ChainCaps = {
  feeCollector: `0x${string}`;
  targetAddress: `0x${string}`;
  tokens: { address: `0x${string}`; symbol?: string; decimals: number | string }[];
};

let capsCache: ChainCaps | undefined;
export async function getCaps(chainId: number): Promise<ChainCaps> {
  if (capsCache) return capsCache;
  const caps = await rpc<Record<string, ChainCaps>>('relayer_getCapabilities', [chainId]);
  const c = caps[String(chainId)];
  if (!c) throw new Error(`relayer has no capabilities for chain ${chainId}`);
  capsCache = c;
  return c;
}

export type SendParams = {
  chainId: number;
  authorizationList?: unknown[];
  transactions: { permissionContext: unknown[]; executions: { target: string; value: string; data: string }[] }[];
};

/**
 * Fee-converging submit: estimate with a rebuilt bundle until the relayer's
 * requiredPaymentAmount is covered, then send with the locked price context.
 * `build(feeAmount)` must return freshly signed params (fresh salts).
 */
export async function estimateAndSend(
  build: (feeAmount: bigint) => Promise<SendParams>,
  startFee: bigint,
  opts: { destinationUrl?: string; memo?: string; maxRounds?: number } = {},
): Promise<{ taskId: string; feeAmount: bigint; estimate: Estimate7710Result }> {
  let feeAmount = startFee;
  let params = await build(feeAmount);
  let estimate: Estimate7710Result | undefined;
  for (let round = 1; round <= (opts.maxRounds ?? 4); round++) {
    estimate = await rpc<Estimate7710Result>('relayer_estimate7710Transaction', params);
    if (!estimate.success) {
      throw new Error(`estimate failed (round ${round}, fee=${feeAmount}): ${estimate.error}`);
    }
    const required = BigInt(estimate.requiredPaymentAmount!);
    console.log(`[relayer] estimate round ${round}: fee=${feeAmount} required=${required} gas=${JSON.stringify(estimate.gasUsed)}`);
    if (required <= feeAmount) break;
    feeAmount = required;
    params = await build(feeAmount);
    estimate = undefined;
  }
  if (!estimate) {
    estimate = await rpc<Estimate7710Result>('relayer_estimate7710Transaction', params);
    if (!estimate.success) throw new Error(`estimate failed (final): ${estimate.error}`);
  }
  const taskId = await rpc<string>('relayer_send7710Transaction', {
    ...params,
    context: estimate.context,
    ...(opts.destinationUrl ? { destinationUrl: opts.destinationUrl } : {}),
    ...(opts.memo ? { memo: opts.memo } : {}),
  });
  return { taskId, feeAmount, estimate };
}

export type TaskStatus = {
  id: string;
  status: number; // 100 pending, 110 submitted, 200 confirmed, 400 rejected, 500 reverted
  memo?: string;
  hash?: string;
  receipt?: { transactionHash?: string; blockNumber?: string };
  message?: string;
  data?: unknown;
};

export const getStatus = (taskId: string) => rpc<TaskStatus>('relayer_getStatus', { id: taskId, logs: false });

// ---------- webhook verification (Ed25519 over sorted-key canonical JSON) ----------

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v as object).sort();
  const body = keys
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
    .join(',');
  return `{${body}}`;
}

let jwksCache: Map<string, CryptoKey> | undefined;
let jwksFetchedAt = 0;

async function loadJwks(): Promise<Map<string, CryptoKey>> {
  if (jwksCache && Date.now() - jwksFetchedAt < 10 * 60_000) return jwksCache;
  const hosts = ['https://relayer.1shotapi.dev', 'https://relayer.1shotapi.com'];
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/.well-known/jwks.json`);
      if (!res.ok) continue;
      const { keys } = (await res.json()) as { keys: { kid: string; x: string; kty: string; crv: string }[] };
      const map = new Map<string, CryptoKey>();
      for (const k of keys) {
        if (k.kty !== 'OKP' || k.crv !== 'Ed25519') continue;
        map.set(
          k.kid,
          await webcrypto.subtle.importKey('raw', Uint8Array.from(Buffer.from(k.x, 'base64url')), { name: 'Ed25519' }, false, ['verify']),
        );
      }
      if (map.size > 0) {
        jwksCache = map;
        jwksFetchedAt = Date.now();
        return map;
      }
    } catch {
      /* try next host */
    }
  }
  throw new Error('could not load relayer JWKS');
}

export type WebhookBody = {
  apiVersion: number;
  type: 0 | 1 | 4; // 4=submitted, 0=confirmed, 1=reverted
  data: TaskStatus;
  timestamp: number;
  keyId: string;
  signature: string;
};

export async function verifyWebhook(body: WebhookBody): Promise<boolean> {
  try {
    const jwks = await loadJwks();
    const key = jwks.get(body.keyId);
    if (!key || typeof body.signature !== 'string') return false;
    const { signature, ...unsigned } = body;
    return await webcrypto.subtle.verify(
      'Ed25519',
      key,
      Uint8Array.from(Buffer.from(signature, 'base64')),
      new TextEncoder().encode(stableStringify(unsigned)),
    );
  } catch {
    return false;
  }
}
