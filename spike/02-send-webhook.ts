/**
 * Spike step 2 — funded end-to-end run: closes H1/H2/H3 on-chain and validates H4.
 *
 * Prereq: user account holds Sepolia USDC (Circle faucet).
 *
 * What it does:
 *   1. starts a local webhook receiver (express :8787) with full Ed25519
 *      verification per the relayer spec (JWKS, sorted-key canonical JSON)
 *   2. opens a cloudflared quick tunnel to expose it
 *   3. rebuilds the 2-hop chain user → agentA → relayer target (fresh salts)
 *   4. estimate-first fee loop, then relayer_send7710Transaction with
 *      authorizationList (EIP-7702 upgrade) + destinationUrl + memo
 *   5. waits for webhook type 4 (submitted) and type 0/1 (terminal),
 *      polls relayer_getStatus as fallback, then prints the verdict table
 */
import { randomBytes, webcrypto } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import express from 'express';
import {
  Implementation,
  ScopeType,
  createDelegation,
  getSmartAccountsEnvironment,
  signDelegation,
  toMetaMaskSmartAccount,
} from '@metamask/smart-accounts-kit';
import { encodeFunctionData, erc20Abi, formatUnits, getAddress, parseUnits } from 'viem';
import { bytesToHex } from 'viem/utils';
import {
  CHAIN_ID,
  publicClient,
  getCaps,
  requireAccounts,
  rpc,
  toRelayerJson,
  printBalances,
  type Estimate7710Result,
} from './lib';

const WEBHOOK_PORT = 8787;
const MEMO = `polyforge-spike-${Date.now()}`;

// ---------- canonical JSON (sorted keys, no whitespace) ----------
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

const b64ToBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'));
const b64urlToBytes = (s: string) => Uint8Array.from(Buffer.from(s, 'base64url'));

// ---------- JWKS ----------
async function loadJwks(): Promise<Map<string, CryptoKey>> {
  const hosts = ['https://relayer.1shotapi.dev', 'https://relayer.1shotapi.com'];
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/.well-known/jwks.json`);
      if (!res.ok) continue;
      const { keys } = (await res.json()) as { keys: { kid: string; x: string; kty: string; crv: string }[] };
      const map = new Map<string, CryptoKey>();
      for (const k of keys) {
        if (k.kty !== 'OKP' || k.crv !== 'Ed25519') continue;
        const key = await webcrypto.subtle.importKey('raw', b64urlToBytes(k.x), { name: 'Ed25519' }, false, ['verify']);
        map.set(k.kid, key);
      }
      if (map.size > 0) {
        console.log(`jwks: ${map.size} key(s) from ${host}`);
        return map;
      }
    } catch {
      /* try next host */
    }
  }
  throw new Error('could not load JWKS from either relayer host');
}

// ---------- webhook receiver ----------
type WebhookEvent = { type: number; verified: boolean; status?: number; hash?: string; memo?: string };
const received: WebhookEvent[] = [];
let terminal: WebhookEvent | undefined;

async function startWebhookServer(jwks: Map<string, CryptoKey>) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.post('/relayer-webhook', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const { signature, ...unsigned } = body;
    let verified = false;
    try {
      const key = jwks.get(String(body.keyId));
      if (key && typeof signature === 'string') {
        verified = await webcrypto.subtle.verify(
          'Ed25519',
          key,
          b64ToBytes(signature),
          new TextEncoder().encode(stableStringify(unsigned)),
        );
      }
    } catch {
      verified = false;
    }
    const data = (body.data ?? {}) as Record<string, unknown>;
    const evt: WebhookEvent = {
      type: Number(body.type),
      verified,
      status: data.status as number | undefined,
      hash: data.hash as string | undefined,
      memo: data.memo as string | undefined,
    };
    received.push(evt);
    console.log(`  ⮕ webhook type=${evt.type} status=${evt.status} verified=${verified} hash=${evt.hash ?? '-'} memo=${evt.memo ?? '-'}`);
    if (!verified) {
      res.sendStatus(401);
      return;
    }
    if (evt.type === 0 || evt.type === 1) terminal = evt;
    res.sendStatus(200);
  });
  await new Promise<void>((resolve) => app.listen(WEBHOOK_PORT, resolve));
  console.log(`webhook receiver on :${WEBHOOK_PORT}`);
}

// ---------- cloudflared quick tunnel ----------
async function startTunnel(): Promise<{ url: string; proc: ChildProcess }> {
  const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${WEBHOOK_PORT}`, '--no-autoupdate']);
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cloudflared tunnel timed out (20s)')), 20_000);
    const scan = (chunk: Buffer) => {
      const m = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    };
    proc.stderr.on('data', scan);
    proc.stdout.on('data', scan);
    proc.on('exit', (code) => reject(new Error(`cloudflared exited early (${code})`)));
  });
  console.log(`tunnel: ${url}`);
  return { url, proc };
}

// ---------- main ----------
const accounts = requireAccounts();
const caps = await getCaps();
const usdc = caps.tokens.find((t) => t.symbol === 'USDC')!;
const usdcAddress = getAddress(usdc.address);
const environment = getSmartAccountsEnvironment(CHAIN_ID);
const freshSalt = () => bytesToHex(Uint8Array.from(randomBytes(32))) as `0x${string}`;

console.log('balances before:');
const before = await printBalances('user  ', accounts.user.address, usdcAddress);
await printBalances('agentB', accounts.agentB.address, usdcAddress);
if (before.usdc === 0n) {
  console.error('\nuser has 0 USDC — claim from https://faucet.circle.com first (Ethereum Sepolia)');
  process.exit(1);
}

const jwks = await loadJwks();
await startWebhookServer(jwks);
const tunnel = await startTunnel();

const userSmartAccount = await toMetaMaskSmartAccount({
  client: publicClient as never, // kit 1.6 typings lag viem 2.52 generics
  implementation: Implementation.Stateless7702,
  address: accounts.user.address,
  signer: { account: accounts.user },
});

// EIP-7702 authorization — this send doubles as the upgrade tx (H3)
const alreadyUpgraded = (await publicClient.getCode({ address: accounts.user.address })) !== undefined;
const nonce = await publicClient.getTransactionCount({ address: accounts.user.address, blockTag: 'pending' });
const auth = await accounts.user.signAuthorization({
  chainId: CHAIN_ID,
  contractAddress: getAddress(environment.implementations.EIP7702StatelessDeleGatorImpl),
  nonce,
});
const authorizationList = [
  {
    address: auth.address,
    chainId: auth.chainId,
    nonce: auth.nonce,
    r: auth.r,
    s: auth.s,
    yParity: auth.yParity ?? 0,
  },
];

const workAmount = parseUnits('0.02', 6);

async function buildBundle(feeAmount: bigint) {
  const root = createDelegation({
    to: accounts.agentA.address,
    from: userSmartAccount.address,
    environment,
    salt: freshSalt(),
    // root budget must cover relayer fee + work; testnet fees are steep (~6 USDC
    // for 7702 upgrade + 2-hop redeem), so give the root ample headroom
    scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdcAddress, maxAmount: parseUnits('15', 6) },
  });
  const rootSigned = { ...root, signature: await userSmartAccount.signDelegation({ delegation: root }) };

  const leaf = createDelegation({
    to: caps.targetAddress,
    from: accounts.agentA.address,
    environment,
    salt: freshSalt(),
    parentDelegation: rootSigned,
    scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdcAddress, maxAmount: feeAmount + workAmount },
  });
  const { signature: _s, ...leafUnsigned } = leaf as Record<string, unknown> & { signature?: unknown };
  const leafSigned = {
    ...leaf,
    signature: await signDelegation({
      privateKey: process.env.SPIKE_AGENT_A_PK as `0x${string}`,
      delegation: leafUnsigned as Parameters<typeof signDelegation>[0]['delegation'],
      delegationManager: environment.DelegationManager,
      chainId: CHAIN_ID,
    }),
  };

  return {
    chainId: CHAIN_ID,
    authorizationList,
    transactions: [
      {
        permissionContext: [toRelayerJson(leafSigned), toRelayerJson(rootSigned)],
        executions: [
          {
            target: usdcAddress,
            value: '0',
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [caps.feeCollector, feeAmount] }),
          },
          {
            target: usdcAddress,
            value: '0',
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [accounts.agentB.address, workAmount] }),
          },
        ],
      },
    ],
  };
}

// estimate-first loop — converge on the relayer's required fee (it can drift
// between estimates as gas prices move), re-signing the bundle each round
let feeAmount = parseUnits('0.01', 6);
let params = await buildBundle(feeAmount);
let estimate: Estimate7710Result | undefined;
for (let attempt = 1; attempt <= 4; attempt++) {
  estimate = await rpc<Estimate7710Result>('relayer_estimate7710Transaction', params);
  if (!estimate.success) throw new Error(`estimate failed (attempt ${attempt}): ${estimate.error}`);
  const required = BigInt(estimate.requiredPaymentAmount!);
  if (required <= feeAmount) break;
  console.log(`fee adjusted ${formatUnits(feeAmount, 6)} → ${formatUnits(required, 6)} USDC, re-signing (attempt ${attempt})`);
  feeAmount = required;
  params = await buildBundle(feeAmount);
}
if (!estimate?.success) throw new Error('fee estimation did not converge in 4 attempts');
console.log(`estimate ok: fee=${formatUnits(BigInt(estimate.requiredPaymentAmount!), 6)} USDC gasUsed=${JSON.stringify(estimate.gasUsed)}`);

const taskId = await rpc<string>('relayer_send7710Transaction', {
  ...params,
  context: estimate.context,
  destinationUrl: `${tunnel.url}/relayer-webhook`,
  memo: MEMO,
});
console.log(`\nsubmitted task ${taskId} (memo=${MEMO}) — waiting for webhooks…`);

// wait for terminal webhook, polling as fallback
const deadline = Date.now() + 180_000;
let lastPolled = 0;
while (!terminal && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 2_000));
  if (Date.now() - lastPolled > 10_000) {
    lastPolled = Date.now();
    try {
      const st = await rpc<{ status: number; hash?: string }>('relayer_getStatus', { id: taskId, logs: false });
      console.log(`  (poll) status=${st.status} hash=${st.hash ?? '-'}`);
      if (st.status >= 200) break;
    } catch (e) {
      console.log(`  (poll) ${(e as Error).message}`);
    }
  }
}

// ---------- verdicts ----------
const code = await publicClient.getCode({ address: accounts.user.address });
const upgraded = !!code && code.startsWith('0xef0100');
console.log('\nbalances after:');
await printBalances('user  ', accounts.user.address, usdcAddress);
await printBalances('agentB', accounts.agentB.address, usdcAddress);

const submittedEvt = received.find((e) => e.type === 4);
const confirmedEvt = received.find((e) => e.type === 0);
const failedEvt = received.find((e) => e.type === 1);
const txHash = confirmedEvt?.hash ?? submittedEvt?.hash;

console.log(`
================ SPIKE VERDICT ================
H1 2-hop chain redeemed on-chain : ${confirmedEvt ? '✅' : failedEvt ? '❌ (reverted)' : '⏳ no terminal event'}
H2 EOA redelegation accepted     : ${confirmedEvt ? '✅' : '⏳'}
H3 EIP-7702 upgrade via relayer  : ${upgraded ? '✅ code=' + code!.slice(0, 26) + '…' : alreadyUpgraded ? '✅ (pre-existing)' : '❌ no code at user address'}
H4 webhooks received + verified  : ${received.length > 0 ? `${received.filter((e) => e.verified).length}/${received.length} verified ${confirmedEvt || failedEvt ? '✅' : '(partial)'}` : '❌ none received'}
tx: ${txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : 'n/a'}
===============================================`);

tunnel.proc.kill();
process.exit(confirmedEvt ? 0 : 1);
