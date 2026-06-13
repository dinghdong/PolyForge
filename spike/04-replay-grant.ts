/**
 * Spike 4 — replay the REAL MetaMask 7715 grant offline to find the exact
 * revert. Loads spike/last-grant.json (persisted by setBrowserRoot on browser
 * activation), rebuilds the agentA leaf redelegation exactly like
 * buildBrowserBetBundle, and eth_calls DelegationManager.redeemDelegations in
 * both execution strategies (multi-single = how the relayer ran headless;
 * batch = the other candidate). Decodes whatever reverts.
 *
 * Prereq: activate browser mode once (MetaMask grant) so last-grant.json exists.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  ScopeType,
  ExecutionMode,
  createDelegation,
  createExecution,
  signDelegation,
  getSmartAccountsEnvironment,
  type Delegation,
} from '@metamask/smart-accounts-kit';
import { encodeDelegations, encodeExecutionCalldatas, decodeRevertReason } from '@metamask/smart-accounts-kit/utils';
import { encodeFunctionData, erc20Abi, getAddress, parseAbi, parseUnits, toFunctionSelector } from 'viem';
import { bytesToHex } from 'viem/utils';
import { CHAIN_ID, publicClient, requireAccounts, getCaps } from './lib';

if (!existsSync('spike/last-grant.json')) {
  console.error('spike/last-grant.json missing — activate browser mode once (MetaMask 7715 grant) first');
  process.exit(1);
}
const grant = JSON.parse(readFileSync('spike/last-grant.json', 'utf8')) as Delegation[];
console.log(`loaded grant: ${grant.length} delegation(s), root caveats=${grant[grant.length - 1]?.caveats?.length}, delegate(leaf)=${grant[0]?.delegate}`);

const accounts = requireAccounts();
const caps = await getCaps();
const usdc = getAddress(caps.tokens.find((t) => t.symbol === 'USDC')!.address);
const env = getSmartAccountsEnvironment(CHAIN_ID);
const freshSalt = () => bytesToHex(Uint8Array.from(randomBytes(32))) as `0x${string}`;
const TRANSFER_SEL = toFunctionSelector('transfer(address,uint256)');
const DM_ABI = parseAbi(['function redeemDelegations(bytes[] _permissionContexts, bytes32[] _modes, bytes[] _executionCallDatas)']);

const feeAmount = parseUnits('0.5', 6);
const workAmount = parseUnits('0.02', 6);
const bettor = getAddress(grant[grant.length - 1].delegator); // the real wallet that granted
const execs = [
  createExecution({ target: usdc, value: 0n, callData: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [caps.feeCollector, feeAmount] }) }),
  createExecution({ target: usdc, value: 0n, callData: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [bettor === usdc ? accounts.agentB.address : accounts.agentB.address, workAmount] }) }),
];

async function replay(label: string, leafFnCall: boolean, mode: 'multiSingle' | 'batch') {
  const cap = feeAmount + workAmount;
  const leaf = leafFnCall
    ? createDelegation({ to: caps.targetAddress, from: accounts.agentA.address, environment: env, salt: freshSalt(), parentPermissionContext: grant, scope: { type: ScopeType.FunctionCall, targets: [usdc], selectors: [TRANSFER_SEL] } })
    : createDelegation({ to: caps.targetAddress, from: accounts.agentA.address, environment: env, salt: freshSalt(), parentPermissionContext: grant, scope: { type: ScopeType.Erc20TransferAmount, tokenAddress: usdc, maxAmount: cap } });
  const { signature: _d, ...leafUnsigned } = leaf as Delegation & { signature?: unknown };
  const leafSig = await signDelegation({
    privateKey: process.env.SPIKE_AGENT_A_PK as `0x${string}`,
    delegation: leafUnsigned as Omit<Delegation, 'signature'>,
    delegationManager: env.DelegationManager,
    chainId: CHAIN_ID,
  });
  const chain = encodeDelegations([{ ...leaf, signature: leafSig }, ...grant]); // leaf-first

  let permissionContexts: `0x${string}`[];
  let modes: ExecutionMode[];
  let executionCallDatas: `0x${string}`[];
  if (mode === 'batch') {
    permissionContexts = [chain];
    modes = [ExecutionMode.BatchDefault];
    executionCallDatas = encodeExecutionCalldatas([execs]);
  } else {
    permissionContexts = [chain, chain];
    modes = [ExecutionMode.SingleDefault, ExecutionMode.SingleDefault];
    executionCallDatas = encodeExecutionCalldatas([[execs[0]], [execs[1]]]);
  }
  const data = encodeFunctionData({ abi: DM_ABI, functionName: 'redeemDelegations', args: [permissionContexts, modes, executionCallDatas] });
  try {
    await publicClient.call({ account: caps.targetAddress, to: env.DelegationManager, data });
    console.log(`\n[${label}]\n  ✅ SUCCESS`);
  } catch (e) {
    const decoded = decodeRevertReason(e);
    console.log(`\n[${label}]\n  ❌ ${decoded?.errorName ?? '(no name)'} — ${decoded?.message ?? (e as Error).message?.split('\n')[0]}`);
  }
}

console.log(`bettor(grantor)=${bettor} | agentA=${accounts.agentA.address} | target=${caps.targetAddress}`);
await replay('REAL grant · multi-single · TransferAmount leaf (current browser code)', false, 'multiSingle');
await replay('REAL grant · multi-single · FunctionCall leaf', true, 'multiSingle');
await replay('REAL grant · batch · TransferAmount leaf', false, 'batch');
await replay('REAL grant · batch · FunctionCall leaf', true, 'batch');
