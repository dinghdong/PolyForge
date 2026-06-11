/**
 * Spike step 1 — structural probe for H1/H2/H3 via relayer_estimate7710Transaction.
 *
 * estimate validates delegations + simulates gas WITHOUT submitting, so we can
 * verify the relayer accepts our shapes before any account is funded:
 *
 *   probe A (baseline, 1 hop):  user ──delegate──► relayer target
 *   probe B (A2A, 2 hops):      user ──delegate──► agentA ──redelegate──► relayer target
 *
 * Reading the verdict:
 *   - A and B both fail ONLY on USDC balance simulation → chain structure accepted (H1/H2 ✅ pending funds)
 *   - B fails with delegation/validation errors while A doesn't → redelegation problem (fallback ladder)
 *   - estimate accepts authorizationList → H3 structurally OK
 */
import { randomBytes } from 'node:crypto';
import {
  Implementation,
  ScopeType,
  createDelegation,
  getSmartAccountsEnvironment,
  signDelegation,
  toMetaMaskSmartAccount,
} from '@metamask/smart-accounts-kit';
import { encodeFunctionData, erc20Abi, getAddress, parseUnits } from 'viem';
import { bytesToHex } from 'viem/utils';
import {
  CHAIN_ID,
  publicClient,
  getCaps,
  requireAccounts,
  rpc,
  toRelayerJson,
  type Estimate7710Result,
} from './lib';

const accounts = requireAccounts();
const caps = await getCaps();
const usdc = caps.tokens.find((t) => t.symbol === 'USDC')!;
const usdcAddress = getAddress(usdc.address);
const environment = getSmartAccountsEnvironment(CHAIN_ID);

const freshSalt = () => bytesToHex(Uint8Array.from(randomBytes(32))) as `0x${string}`;

// ---- user smart account (EIP-7702 stateless delegator at the user EOA) ----
const userSmartAccount = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Stateless7702,
  address: accounts.user.address,
  signer: { account: accounts.user },
});

// ---- H3: EIP-7702 authorization (user EOA → stateless delegator impl) ----
const nonce = await publicClient.getTransactionCount({
  address: accounts.user.address,
  blockTag: 'pending',
});
const auth = await accounts.user.signAuthorization({
  chainId: CHAIN_ID,
  contractAddress: getAddress(environment.implementations.EIP7702StatelessDeleGatorImpl),
  nonce,
});
const authorizationList = [
  {
    address: (auth as { address?: `0x${string}` }).address ?? auth.contractAddress,
    chainId: auth.chainId,
    nonce: auth.nonce,
    r: auth.r,
    s: auth.s,
    yParity: auth.yParity ?? 0,
  },
];

// ---- executions: fee (0.01 USDC → feeCollector) + work (0.02 USDC → agentB) ----
const feeAmount = parseUnits('0.01', 6);
const workAmount = parseUnits('0.02', 6);
const executions = [
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
];

async function estimate(label: string, permissionContext: unknown[]): Promise<Estimate7710Result | { error: string }> {
  const params = {
    chainId: CHAIN_ID,
    authorizationList,
    transactions: [{ permissionContext, executions }],
  };
  try {
    const r = await rpc<Estimate7710Result>('relayer_estimate7710Transaction', params);
    console.log(`\n[${label}] success=${r.success}`);
    if (r.success) console.log(`  requiredPaymentAmount=${r.requiredPaymentAmount} gasUsed=${JSON.stringify(r.gasUsed)}`);
    else console.log(`  error: ${r.error}`);
    return r;
  } catch (e) {
    const msg = (e as Error).message;
    console.log(`\n[${label}] rpc error: ${msg}`);
    return { error: msg };
  }
}

// ---- probe A: single hop, user → relayer target ----
const singleHop = createDelegation({
  to: caps.targetAddress,
  from: userSmartAccount.address,
  environment,
  salt: freshSalt(),
  scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdcAddress, maxAmount: feeAmount + workAmount },
});
const singleHopSigned = { ...singleHop, signature: await userSmartAccount.signDelegation({ delegation: singleHop }) };

await estimate('probe A: 1-hop user→target', [toRelayerJson(singleHopSigned)]);

// ---- probe B: 2-hop chain, user → agentA → relayer target ----
const rootDelegation = createDelegation({
  to: accounts.agentA.address,
  from: userSmartAccount.address,
  environment,
  salt: freshSalt(),
  scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdcAddress, maxAmount: parseUnits('1', 6) },
});
const rootSigned = { ...rootDelegation, signature: await userSmartAccount.signDelegation({ delegation: rootDelegation }) };

const leafDelegation = createDelegation({
  to: caps.targetAddress,
  from: accounts.agentA.address,
  environment,
  salt: freshSalt(),
  parentDelegation: rootSigned,
  // narrower than the root's 1 USDC — the A2A "scoped slice"
  scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdcAddress, maxAmount: feeAmount + workAmount },
});
const { signature: _drop, ...leafUnsigned } = leafDelegation as Record<string, unknown> & { signature?: unknown };
const leafSignature = await signDelegation({
  privateKey: process.env.SPIKE_AGENT_A_PK as `0x${string}`,
  delegation: leafUnsigned as Parameters<typeof signDelegation>[0]['delegation'],
  delegationManager: environment.DelegationManager,
  chainId: CHAIN_ID,
});
const leafSigned = { ...leafDelegation, signature: leafSignature };

// delegation framework canonical order: leaf first, root last
const r1 = await estimate('probe B: 2-hop leaf-first [leaf, root]', [
  toRelayerJson(leafSigned),
  toRelayerJson(rootSigned),
]);

// if ordering is the problem, the reversed order should behave differently
if (!('success' in r1) || !r1.success) {
  await estimate('probe B-alt: 2-hop root-first [root, leaf]', [
    toRelayerJson(rootSigned),
    toRelayerJson(leafSigned),
  ]);
}

console.log(`\naddresses for reference:
  user   ${accounts.user.address}
  agentA ${accounts.agentA.address}
  agentB ${accounts.agentB.address}
  target ${caps.targetAddress}`);
