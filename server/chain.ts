/**
 * Chain context + delegation builders for the PolyForge A2A topology.
 *
 *   headless (script-signed root, used for the autonomous demo loop):
 *     user SA ──FunctionCall{usdc,market}──► agentA ──narrowed──► relayer target
 *     copy-trade variant adds a hop: user ─► agentA ─► agentB ─► target
 *
 *   browser (real wallet, ERC-7715):
 *     user SA ──erc20-periodic grant (delegate = agentA)──► agentA ─► target
 *     market admin calls ride a second transactions[] entry from agentA's
 *     own root delegation (agentA was 7702-upgraded at deploy time).
 */
import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import {
  Implementation,
  ScopeType,
  createDelegation,
  getSmartAccountsEnvironment,
  signDelegation,
  toMetaMaskSmartAccount,
  type Delegation,
} from '@metamask/smart-accounts-kit';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  http,
  parseAbi,
  parseUnits,
  toFunctionSelector,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { bytesToHex } from 'viem/utils';
import { getCaps, toRelayerJson, type ChainCaps, type SendParams } from './relayer';

loadEnv({ path: '.env.local' });

export const CHAIN = sepolia;
export const CHAIN_ID = sepolia.id;
export const publicClient = createPublicClient({ chain: CHAIN, transport: http() });

export const MARKET_ABI = parseAbi([
  'function createMarket(string question, string outcomeA, string outcomeB, uint64 closesAt) returns (uint256)',
  'function recordBet(address bettor, uint64 marketId, uint8 outcome, uint128 amount, uint64 entryPriceE6) returns (uint256)',
  'function resolve(uint64 marketId, uint8 winner)',
  'function claim(uint256 betId)',
  'function markets(uint256) view returns (string question, string outcomeA, string outcomeB, uint64 closesAt, bool resolved, uint8 winner, uint128 poolA, uint128 poolB)',
  'function bets(uint256) view returns (address bettor, uint64 marketId, uint8 outcome, bool claimed, uint128 amount, uint64 entryPriceE6)',
  'function marketCount() view returns (uint256)',
  'function betCount() view returns (uint256)',
]);

const freshSalt = () => bytesToHex(Uint8Array.from(randomBytes(32))) as `0x${string}`;

export type ChainContext = Awaited<ReturnType<typeof initChainContext>>;

export async function initChainContext() {
  const required = ['SPIKE_USER_PK', 'SPIKE_AGENT_A_PK', 'SPIKE_AGENT_B_PK'] as const;
  for (const k of required) if (!process.env[k]) throw new Error(`${k} missing in .env.local`);

  const user = privateKeyToAccount(process.env.SPIKE_USER_PK as `0x${string}`);
  const agentA = privateKeyToAccount(process.env.SPIKE_AGENT_A_PK as `0x${string}`);
  const agentB = privateKeyToAccount(process.env.SPIKE_AGENT_B_PK as `0x${string}`);

  const environment = getSmartAccountsEnvironment(CHAIN_ID);
  const caps: ChainCaps = await getCaps(CHAIN_ID);
  const usdc = getAddress(caps.tokens.find((t) => t.symbol === 'USDC')!.address);
  const market = process.env.MARKET_ADDRESS ? getAddress(process.env.MARKET_ADDRESS) : undefined;

  const userSmartAccount = await toMetaMaskSmartAccount({
    // kit 1.6 typings lag viem 2.52's PublicClient generics; runtime-validated in spike/
    client: publicClient as never,
    implementation: Implementation.Stateless7702,
    address: user.address,
    signer: { account: user },
  });

  return { user, agentA, agentB, environment, caps, usdc, market, userSmartAccount };
}

const SELECTORS = {
  transfer: toFunctionSelector('transfer(address,uint256)'),
  recordBet: toFunctionSelector('recordBet(address,uint64,uint8,uint128)'),
  resolve: toFunctionSelector('resolve(uint64,uint8)'),
  claim: toFunctionSelector('claim(uint256)'),
  createMarket: toFunctionSelector('createMarket(string,string,string,uint64)'),
};

async function signAsAgent(
  ctx: ChainContext,
  delegation: Delegation,
  agentKeyEnv: 'SPIKE_AGENT_A_PK' | 'SPIKE_AGENT_B_PK',
): Promise<Delegation> {
  const { signature: _drop, ...unsigned } = delegation as Delegation & { signature?: unknown };
  const signature = await signDelegation({
    privateKey: process.env[agentKeyEnv] as `0x${string}`,
    delegation: unsigned as Omit<Delegation, 'signature'>,
    delegationManager: ctx.environment.DelegationManager,
    chainId: CHAIN_ID,
  });
  return { ...delegation, signature };
}

/**
 * Headless root: user SA delegates a USDC budget to agentA — transfers only,
 * capped. Mirrors the semantics of a browser ERC-7715 erc20-periodic grant
 * (the user's authority never extends beyond moving budgeted USDC).
 * Cached per server run (one signature), like a session the user granted once.
 */
let headlessRoot: Delegation | undefined;
export async function getHeadlessRoot(ctx: ChainContext): Promise<Delegation> {
  if (headlessRoot) return headlessRoot;
  if (!ctx.market) throw new Error('MARKET_ADDRESS not set — deploy the market first');
  const root = createDelegation({
    to: ctx.agentA.address,
    from: ctx.userSmartAccount.address,
    environment: ctx.environment,
    salt: freshSalt(),
    // budget ceiling, not target spend. The on-chain enforcer decrements this
    // CUMULATIVELY across redemptions (observed live: bet #2 rejected with
    // allowance-exceeded once fee+bet sums crossed the cap) and Sepolia
    // relayer fees swing 6-22 USDC with testnet gas — so one demo session of
    // 3-4 bets needs ~60.
    scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: ctx.usdc, maxAmount: parseUnits('60', 6) },
  });
  headlessRoot = { ...root, signature: await ctx.userSmartAccount.signDelegation({ delegation: root }) };
  return headlessRoot;
}

/**
 * Operator calls (recordBet / resolve) are backend ops paid by agentA's own
 * ETH as plain transactions — routing them through the relayer tripled the
 * bundle gas (700k vs 490k) and the testnet fee (22 vs ~6 USDC). The USER
 * money rail stays 100% relayer-redeemed and gasless.
 */
const operatorWallet = (ctx: ChainContext) =>
  createWalletClient({ chain: CHAIN, transport: http(), account: ctx.agentA });

export async function recordBetDirect(ctx: ChainContext, intent: BetIntent): Promise<`0x${string}`> {
  if (!ctx.market) throw new Error('MARKET_ADDRESS not set');
  const hash = await operatorWallet(ctx).writeContract({
    chain: CHAIN,
    account: ctx.agentA,
    address: ctx.market,
    abi: MARKET_ABI,
    functionName: 'recordBet',
    args: [intent.bettor, BigInt(intent.marketId), intent.outcome, intent.amountUsdc, intent.entryPriceE6],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** slug → on-chain mirror market id (created lazily on first bet). */
const mirrorIds = new Map<string, number>();

export async function ensureMirrorMarket(ctx: ChainContext, slug: string, question: string): Promise<number> {
  const cached = mirrorIds.get(slug);
  if (cached !== undefined) return cached;
  if (!ctx.market) throw new Error('MARKET_ADDRESS not set');
  const nextId = Number(
    await publicClient.readContract({ address: ctx.market, abi: MARKET_ABI, functionName: 'marketCount' }),
  );
  const hash = await operatorWallet(ctx).writeContract({
    chain: CHAIN,
    account: ctx.agentA,
    address: ctx.market,
    abi: MARKET_ABI,
    functionName: 'createMarket',
    args: [`${question} (mirrors Polymarket)`, 'Yes', 'No', BigInt(Math.floor(Date.now() / 1000) + 60 * 24 * 3600)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  mirrorIds.set(slug, nextId);
  return nextId;
}

export async function resolveDirect(ctx: ChainContext, marketId: number, winner: 0 | 1): Promise<`0x${string}`> {
  if (!ctx.market) throw new Error('MARKET_ADDRESS not set');
  const hash = await operatorWallet(ctx).writeContract({
    chain: CHAIN,
    account: ctx.agentA,
    address: ctx.market,
    abi: MARKET_ABI,
    functionName: 'resolve',
    args: [BigInt(marketId), winner],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Browser root: the decoded ERC-7715 permission context granted to agentA. */
let browserRoot: Delegation[] | undefined;
export function setBrowserRoot(decoded: Delegation[]) {
  browserRoot = decoded;
}
export function getBrowserRoot(): Delegation[] | undefined {
  return browserRoot;
}

/** The real wallet that granted the 7715 permission (root delegator) —
 *  in browser mode this is the bettor and the account whose USDC moves. */
export function getBrowserDelegator(): `0x${string}` | undefined {
  if (!browserRoot?.length) return undefined;
  return browserRoot[browserRoot.length - 1].delegator as `0x${string}`;
}

/** agentA redelegates a narrowed slice straight to the relayer target. */
async function redelegateToTarget(ctx: ChainContext, parent: Delegation, capUsdc: bigint): Promise<Delegation> {
  const leaf = createDelegation({
    to: ctx.caps.targetAddress,
    from: ctx.agentA.address,
    environment: ctx.environment,
    salt: freshSalt(),
    parentDelegation: parent,
    scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: ctx.usdc, maxAmount: capUsdc },
  });
  return signAsAgent(ctx, leaf, 'SPIKE_AGENT_A_PK');
}

/** Copy-trade 3-hop: agentA → agentB (narrower), agentB → target. */
async function redelegateViaFollower(ctx: ChainContext, parent: Delegation, capUsdc: bigint) {
  const mid = createDelegation({
    to: ctx.agentB.address,
    from: ctx.agentA.address,
    environment: ctx.environment,
    salt: freshSalt(),
    parentDelegation: parent,
    scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: ctx.usdc, maxAmount: capUsdc },
  });
  const midSigned = await signAsAgent(ctx, mid, 'SPIKE_AGENT_A_PK');
  const leaf = createDelegation({
    to: ctx.caps.targetAddress,
    from: ctx.agentB.address,
    environment: ctx.environment,
    salt: freshSalt(),
    parentDelegation: midSigned,
    scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: ctx.usdc, maxAmount: capUsdc },
  });
  const leafSigned = await signAsAgent(ctx, leaf, 'SPIKE_AGENT_B_PK');
  return { midSigned, leafSigned };
}

export type BetIntent = {
  marketId: number;
  outcome: 0 | 1;
  amountUsdc: bigint; // 6 decimals
  entryPriceE6: bigint; // share price at entry, micro-USDC (live Polymarket quote)
  bettor: `0x${string}`;
  viaFollower?: boolean; // 3-hop copy-trade rail
};

/**
 * Browser-mode bundle: root authority is the user's real ERC-7715 grant
 * (delegate = agentA, erc20-token-periodic → transfers only). agentA
 * redelegates via parentPermissionContext to the relayer target.
 *   tx[0] (user chain):  [fee→collector, bet→market]   — pure USDC transfers
 *   tx[1] (agentA chain): [recordBet(market)]          — agentA's own root
 * The relayer merges both entries into one redeemDelegations batch.
 */
export async function buildBrowserBetBundle(ctx: ChainContext, intent: BetIntent, feeAmount: bigint): Promise<SendParams> {
  if (!ctx.market) throw new Error('MARKET_ADDRESS not set');
  const grant = getBrowserRoot();
  if (!grant || grant.length === 0) throw new Error('no ERC-7715 permission context — sign in the Forge first');

  const cap = feeAmount + intent.amountUsdc;
  const leaf = createDelegation({
    to: ctx.caps.targetAddress,
    from: ctx.agentA.address,
    environment: ctx.environment,
    salt: freshSalt(),
    parentPermissionContext: grant,
    scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: ctx.usdc, maxAmount: cap },
  });
  const leafSigned = await signAsAgent(ctx, leaf, 'SPIKE_AGENT_A_PK');

  return {
    chainId: CHAIN_ID,
    transactions: [
      {
        permissionContext: [toRelayerJson(leafSigned), ...grant.map((d) => toRelayerJson(d))],
        executions: [
          {
            target: ctx.usdc,
            value: '0',
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [ctx.caps.feeCollector, feeAmount] }),
          },
          {
            target: ctx.usdc,
            value: '0',
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [ctx.market, intent.amountUsdc] }),
          },
        ],
      },
    ],
  };
}

/**
 * Relayer bundle for one bet — user budget chain only, pure USDC transfers
 * (Erc20TransferAmount caveats at every hop, spike-proven shape):
 *   [fee→feeCollector, bet→market]
 *
 * recordBet attribution happens afterwards via `recordBetDirect` (agentA's
 * own ETH): a non-transfer call under a transfer-amount enforcer reverts
 * with `invalid-execution-length`, and a second relayer entry for it tripled
 * the fee. permissionContext ordering is leaf-first.
 */
export async function buildBetBundle(ctx: ChainContext, intent: BetIntent, feeAmount: bigint): Promise<SendParams> {
  if (!ctx.market) throw new Error('MARKET_ADDRESS not set');
  const root = await getHeadlessRoot(ctx);
  const cap = feeAmount + intent.amountUsdc;

  let permissionContext: unknown[];
  if (intent.viaFollower) {
    const { midSigned, leafSigned } = await redelegateViaFollower(ctx, root, cap);
    permissionContext = [toRelayerJson(leafSigned), toRelayerJson(midSigned), toRelayerJson(root)];
  } else {
    const leaf = await redelegateToTarget(ctx, root, cap);
    permissionContext = [toRelayerJson(leaf), toRelayerJson(root)];
  }

  return {
    chainId: CHAIN_ID,
    transactions: [
      {
        permissionContext,
        executions: [
          {
            target: ctx.usdc,
            value: '0',
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [ctx.caps.feeCollector, feeAmount] }),
          },
          {
            target: ctx.usdc,
            value: '0',
            data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [ctx.market, intent.amountUsdc] }),
          },
        ],
      },
    ],
  };
}
