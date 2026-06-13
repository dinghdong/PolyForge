/**
 * Spike 3 — pull the REAL enforcer revert the relayer swallowed (data: 0x0).
 *
 * Reproduces the redelegation chain with script keys and calls
 * DelegationManager.redeemDelegations via eth_call (read-only, free): a
 * revert returns its reason, which we decode. Two chains:
 *
 *   CONTROL: Erc20TransferAmount root → agentA → target   (proven headless pattern)
 *   TEST:    Erc20PeriodTransfer  root → agentA → target  (mimics the MetaMask 7715 grant)
 *
 * If CONTROL succeeds and TEST reverts, we've isolated the periodic-permission
 * redemption AND captured the exact enforcer error — without the relayer.
 */
import { randomBytes } from 'node:crypto';
import {
  Implementation,
  ScopeType,
  ExecutionMode,
  createDelegation,
  createExecution,
  getSmartAccountsEnvironment,
  signDelegation,
  toMetaMaskSmartAccount,
  type Delegation,
} from '@metamask/smart-accounts-kit';
import { encodeDelegations, encodeExecutionCalldatas, decodeRevertReason } from '@metamask/smart-accounts-kit/utils';
import { encodeFunctionData, erc20Abi, getAddress, parseAbi, parseUnits, toFunctionSelector } from 'viem';
import { bytesToHex } from 'viem/utils';
import { CHAIN_ID, publicClient, requireAccounts, getCaps } from './lib';

const accounts = requireAccounts();
const caps = await getCaps();
const usdc = getAddress(caps.tokens.find((t) => t.symbol === 'USDC')!.address);
const env = getSmartAccountsEnvironment(CHAIN_ID);
const freshSalt = () => bytesToHex(Uint8Array.from(randomBytes(32))) as `0x${string}`;

const userSA = await toMetaMaskSmartAccount({
  client: publicClient as never,
  implementation: Implementation.Stateless7702,
  address: accounts.user.address,
  signer: { account: accounts.user },
});

const DM_ABI = parseAbi([
  'function redeemDelegations(bytes[] _permissionContexts, bytes32[] _modes, bytes[] _executionCallDatas)',
]);

const workAmount = parseUnits('0.02', 6);
const feeAmount = parseUnits('0.5', 6); // stand-in for the relayer fee transfer
const mkTransfer = (to: `0x${string}`, amt: bigint) =>
  createExecution({ target: usdc, value: 0n, callData: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amt] }) });
const singleExec = [mkTransfer(accounts.agentB.address, workAmount)];
const batchExec = [mkTransfer(caps.feeCollector, feeAmount), mkTransfer(accounts.agentB.address, workAmount)]; // fee + bet, like the relayer

const TRANSFER_SEL = toFunctionSelector('transfer(address,uint256)');

type ExecStrategy = 'single' | 'batch' | 'multiSingle';

async function testChain(
  label: string,
  rootScope: NonNullable<Parameters<typeof createDelegation>[0]['scope']>,
  execMode: ExecStrategy = 'single',
  leafFnCall = false,
) {
  const batch = execMode === 'batch';
  const root = createDelegation({ to: accounts.agentA.address, from: userSA.address, environment: env, salt: freshSalt(), scope: rootScope });
  const rootSigned: Delegation = { ...root, signature: await userSA.signDelegation({ delegation: root }) };

  // leaf cap must cover everything this chain will transfer
  const leafMax = execMode === 'single' ? workAmount : feeAmount + workAmount;
  const leaf = leafFnCall
    ? createDelegation({ to: caps.targetAddress, from: accounts.agentA.address, environment: env, salt: freshSalt(), parentDelegation: rootSigned, scope: { type: ScopeType.FunctionCall, targets: [usdc], selectors: [TRANSFER_SEL] } })
    : createDelegation({ to: caps.targetAddress, from: accounts.agentA.address, environment: env, salt: freshSalt(), parentDelegation: rootSigned, scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdc, maxAmount: leafMax } });
  const { signature: _drop, ...leafUnsigned } = leaf as Delegation & { signature?: unknown };
  const leafSig = await signDelegation({
    privateKey: process.env.SPIKE_AGENT_A_PK as `0x${string}`,
    delegation: leafUnsigned as Omit<Delegation, 'signature'>,
    delegationManager: env.DelegationManager,
    chainId: CHAIN_ID,
  });
  const leafSigned: Delegation = { ...leaf, signature: leafSig };

  const chainEncoded = encodeDelegations([leafSigned, rootSigned]); // leaf-first
  let permissionContexts: `0x${string}`[];
  let modes: ExecutionMode[];
  let executionCallDatas: `0x${string}`[];
  if (execMode === 'batch') {
    // one redemption, both transfers as a BatchDefault execution
    permissionContexts = [chainEncoded];
    modes = [ExecutionMode.BatchDefault];
    executionCallDatas = encodeExecutionCalldatas([batchExec]);
  } else if (execMode === 'multiSingle') {
    // redeem the SAME chain twice, each a SingleDefault execution (relayer's likely path)
    permissionContexts = [chainEncoded, chainEncoded];
    modes = [ExecutionMode.SingleDefault, ExecutionMode.SingleDefault];
    executionCallDatas = encodeExecutionCalldatas([[batchExec[0]], [batchExec[1]]]);
  } else {
    permissionContexts = [chainEncoded];
    modes = [ExecutionMode.SingleDefault];
    executionCallDatas = encodeExecutionCalldatas([singleExec]);
  }

  const data = encodeFunctionData({ abi: DM_ABI, functionName: 'redeemDelegations', args: [permissionContexts, modes, executionCallDatas] });

  try {
    await publicClient.call({ account: caps.targetAddress, to: env.DelegationManager, data });
    console.log(`\n[${label}]\n  ✅ eth_call SUCCESS — chain redeems cleanly`);
  } catch (e) {
    const decoded = decodeRevertReason(e);
    const short = (e as Error).message?.split('\n')[0] ?? String(e);
    console.log(`\n[${label}]\n  ❌ REVERT: ${decoded?.errorName ?? '(no errorName)'} — ${decoded?.message ?? short}`);
  }
}

console.log(`user SA ${userSA.address} | agentA ${accounts.agentA.address} | target ${caps.targetAddress}`);

const transferRoot = { type: ScopeType.Erc20TransferAmount, tokenAddress: usdc, maxAmount: parseUnits('5', 6) } as const;

await testChain('CONTROL — TransferAmount root, single', transferRoot, 'single');

const periodicScope = {
  type: ScopeType.Erc20PeriodTransfer,
  tokenAddress: usdc,
  periodAmount: parseUnits('5', 6),
  periodDuration: 86400,
  startDate: Math.floor(Date.now() / 1000) - 60,
} as const;

// resolve the contradiction with CORRECT leaf cap (= total transferred)
await testChain('TransferAmount root, MULTI-SINGLE, TransferAmount leaf  [= headless]', transferRoot, 'multiSingle');
await testChain('Periodic root, MULTI-SINGLE, TransferAmount leaf      [≈ browser]', periodicScope, 'multiSingle');
await testChain('Periodic root, MULTI-SINGLE, FunctionCall leaf        [candidate FIX]', periodicScope, 'multiSingle', true);
await testChain('TransferAmount root, BATCH, TransferAmount leaf       [if relayer batches]', transferRoot, 'batch');
