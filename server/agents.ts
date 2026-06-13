/**
 * Agent registry — the "brain" layer, decoupled from Mandates.
 *
 * An Agent is a reusable AI template minted as an AgentNFA (ERC-721) with an
 * on-chain DID. Mandates (ERC-7715 grants, see state.ts) reference an agentId
 * and run its brain. This module reads the on-chain registry and mints new
 * agents (operator-funded, owned by the creator address).
 */
import { getAddress, parseAbi, keccak256, toHex } from 'viem';
import { CHAIN, CHAIN_ID, publicClient, type ChainContext } from './chain';

export const AGENT_NFA_ABI = parseAbi([
  'function mint(address to, string label, string model, bytes32 configHash, bool copyable) returns (uint256)',
  'function agentCount() view returns (uint256)',
  'function agents(uint256) view returns (address creator, string label, string model, bytes32 configHash, uint64 createdAt, bool copyable)',
  'function ownerOf(uint256) view returns (address)',
  'function did(uint256) view returns (string)',
]);

export type AgentBrain = {
  tokenId: number;
  label: string;
  model: string;
  prompt: string; // off-chain (configHash commits to it); held in memory by creator session
  owner: `0x${string}`;
  configHash: `0x${string}`;
  did: string;
  createdAt: number;
  copyable: boolean; // true = public (anyone can run/copy); false = private (owner only)
};

const nfaAddress = (): `0x${string}` => {
  const a = process.env.AGENT_NFA_ADDRESS;
  if (!a) throw new Error('AGENT_NFA_ADDRESS not set — run npm run deploy:nfa');
  return getAddress(a);
};

/** retry transient RPC/proxy hiccups ("HTTP request failed") on chain reads */
async function readRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastError;
}

/** prompts are off-chain; remember them per tokenId as agents are minted/seen */
const promptByToken = new Map<number, string>();
export function rememberPrompt(tokenId: number, prompt: string) {
  if (prompt) promptByToken.set(tokenId, prompt);
}

export function configHashFor(model: string, prompt: string): `0x${string}` {
  return keccak256(toHex(`${model}|${prompt}`));
}

export async function readAgents(): Promise<AgentBrain[]> {
  const addr = nfaAddress();
  const count = Number(await readRetry(() => publicClient.readContract({ address: addr, abi: AGENT_NFA_ABI, functionName: 'agentCount' })));
  const out: AgentBrain[] = [];
  for (let tokenId = 1; tokenId <= count; tokenId++) {
    const [a, did] = await Promise.all([
      readRetry(() => publicClient.readContract({ address: addr, abi: AGENT_NFA_ABI, functionName: 'agents', args: [BigInt(tokenId)] })) as Promise<
        readonly [`0x${string}`, string, string, `0x${string}`, bigint, boolean]
      >,
      readRetry(() => publicClient.readContract({ address: addr, abi: AGENT_NFA_ABI, functionName: 'did', args: [BigInt(tokenId)] })) as Promise<string>,
    ]);
    out.push({
      tokenId,
      owner: a[0],
      label: a[1],
      model: a[2],
      prompt: promptByToken.get(tokenId) ?? defaultPromptFor(a[1]),
      configHash: a[3],
      did,
      createdAt: Number(a[4]),
      copyable: a[5],
    });
  }
  return out;
}

export async function getAgent(tokenId: number): Promise<AgentBrain | undefined> {
  return (await readAgents()).find((a) => a.tokenId === tokenId);
}

/** Mint a new agent (brain) to `creator`. Operator (agentA) pays gas. */
export async function mintAgent(
  ctx: ChainContext,
  creator: `0x${string}`,
  label: string,
  model: string,
  prompt: string,
  copyable: boolean,
): Promise<{ tokenId: number; txHash: `0x${string}` }> {
  const { createWalletClient, http } = await import('viem');
  const { SEPOLIA_RPC } = await import('./chain');
  const wallet = createWalletClient({ chain: CHAIN, transport: http(SEPOLIA_RPC), account: ctx.agentA });
  const addr = nfaAddress();
  const txHash = await wallet.writeContract({
    chain: CHAIN,
    account: ctx.agentA,
    address: addr,
    abi: AGENT_NFA_ABI,
    functionName: 'mint',
    args: [creator, label, model, configHashFor(model, prompt), copyable],
  });
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  const tokenId = Number(await publicClient.readContract({ address: addr, abi: AGENT_NFA_ABI, functionName: 'agentCount' }));
  rememberPrompt(tokenId, prompt);
  return { tokenId, txHash };
}

// seed prompts so the two starter NFAs read sensibly before anyone re-supplies them
function defaultPromptFor(label: string): string {
  if (/underdog/i.test(label)) return 'Statistics-driven underdog specialist; buys value on cheapened sides after repricings.';
  if (/momentum/i.test(label)) return 'Rides momentum: continues the direction of sharp Polymarket repricings.';
  return 'Prediction-market analyst reacting to Polymarket repricings within strict on-chain caveats.';
}

export { CHAIN_ID };
