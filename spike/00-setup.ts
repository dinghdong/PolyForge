/**
 * Spike step 0 — generate test keys (once) and report funding status.
 *
 * Keys land in .env.local (gitignored). The user account is the only one
 * that ever needs funds (Sepolia USDC for relayer fees + bet amounts);
 * agents only sign, the relayer pays all gas.
 */
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit';
import { CHAIN_ID, getCaps, printBalances } from './lib';

const ENV_PATH = '.env.local';
const KEYS = ['SPIKE_USER_PK', 'SPIKE_AGENT_A_PK', 'SPIKE_AGENT_B_PK'] as const;

const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
const missing = KEYS.filter((k) => !existing.includes(`${k}=`) && !process.env[k]);

if (missing.length > 0) {
  const lines = missing.map((k) => `${k}=${generatePrivateKey()}`).join('\n');
  appendFileSync(ENV_PATH, `\n# spike test keys (testnet only — never reuse)\n${lines}\n`);
  console.log(`generated ${missing.length} key(s) → ${ENV_PATH}\n`);
}

// re-read after possible append
const { config } = await import('dotenv');
config({ path: ENV_PATH, override: true });

const accounts = {
  user: privateKeyToAccount(process.env.SPIKE_USER_PK as `0x${string}`),
  agentA: privateKeyToAccount(process.env.SPIKE_AGENT_A_PK as `0x${string}`),
  agentB: privateKeyToAccount(process.env.SPIKE_AGENT_B_PK as `0x${string}`),
};

const env = getSmartAccountsEnvironment(CHAIN_ID);
console.log('smart-accounts environment keys:', Object.keys(env));
console.log('implementations:', Object.keys((env as Record<string, any>).implementations ?? {}));

const caps = await getCaps();
const usdc = caps.tokens.find((t) => t.symbol === 'USDC')!;
console.log(`\nrelayer caps (Sepolia): target=${caps.targetAddress} feeCollector=${caps.feeCollector} USDC=${usdc.address}\n`);

console.log('balances:');
await printBalances('user  ', accounts.user.address, usdc.address);
await printBalances('agentA', accounts.agentA.address, usdc.address);
await printBalances('agentB', accounts.agentB.address, usdc.address);

console.log(`\nfunding (only the user account needs anything):
  Sepolia USDC → https://faucet.circle.com  (network: Ethereum Sepolia)
  address: ${accounts.user.address}`);
