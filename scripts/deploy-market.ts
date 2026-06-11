/**
 * Deploy MockPredictionMarket to Sepolia + one-time agentA EIP-7702 self-upgrade.
 *
 * Deployer = agentA key (SPIKE_AGENT_A_PK). This is the only step in the whole
 * stack that needs native ETH — everything user-facing rides the 1Shot relayer.
 * Operators: user smart account (headless rail) + agentA (browser-mode admin).
 *
 * Writes MARKET_ADDRESS to .env.local on success.
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { createWalletClient, formatEther, getAddress, http, parseAbi } from 'viem';
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit';
import { CHAIN, CHAIN_ID, publicClient, requireAccounts, getCaps } from '../spike/lib';

const accounts = requireAccounts();
const caps = await getCaps();
const usdc = getAddress(caps.tokens.find((t) => t.symbol === 'USDC')!.address);

const eth = await publicClient.getBalance({ address: accounts.agentA.address });
console.log(`deployer (agentA) ${accounts.agentA.address}  ETH=${formatEther(eth)}`);
if (eth < 5_000_000_000_000_000n) {
  console.error(`
deployer needs ~0.005+ ETH on Sepolia. Free faucets (login required):
  - https://cloud.google.com/application/web3/faucet/ethereum/sepolia  (0.05/day, Google login)
  - https://docs.metamask.io/developer-tools/faucet/                   (MetaMask/Infura login)
send to: ${accounts.agentA.address}`);
  process.exit(1);
}

const wallet = createWalletClient({ chain: CHAIN, transport: http(), account: accounts.agentA });
const { abi, bytecode } = JSON.parse(readFileSync('server/abi/MockPredictionMarket.json', 'utf8'));

// 1) deploy, operators = [user smart account, agentA]
const deployHash = await wallet.deployContract({
  chain: CHAIN,
  account: accounts.agentA,
  abi,
  bytecode,
  args: [usdc, [accounts.user.address, accounts.agentA.address]],
});
console.log(`deploy tx ${deployHash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const market = getAddress(receipt.contractAddress!);
console.log(`MockPredictionMarket @ ${market} (block ${receipt.blockNumber})`);

// 2) one-time agentA EIP-7702 self-upgrade (browser-mode admin rail rides the
//    relayer later; self-upgrade here while we have ETH in hand)
const environment = getSmartAccountsEnvironment(CHAIN_ID);
const impl = getAddress(environment.implementations.EIP7702StatelessDeleGatorImpl);
const code = await publicClient.getCode({ address: accounts.agentA.address });
if (!code || !code.startsWith('0xef0100')) {
  const auth = await wallet.signAuthorization({ account: accounts.agentA, contractAddress: impl, executor: 'self' });
  const upHash = await wallet.sendTransaction({
    chain: CHAIN,
    account: accounts.agentA,
    to: accounts.agentA.address,
    value: 0n,
    authorizationList: [auth],
  });
  await publicClient.waitForTransactionReceipt({ hash: upHash });
  console.log(`agentA upgraded via EIP-7702 (tx ${upHash})`);
} else {
  console.log('agentA already upgraded');
}

// 3) seed market #0 — 2026 World Cup group stage
const marketAbi = parseAbi([
  'function createMarket(string question, string outcomeA, string outcomeB, uint64 closesAt) returns (uint256)',
  'function marketCount() view returns (uint256)',
]);
const closesAt = BigInt(Math.floor(Date.now() / 1000) + 5 * 24 * 3600);
const seedHash = await wallet.writeContract({
  chain: CHAIN,
  account: accounts.agentA,
  address: market,
  abi: marketAbi,
  functionName: 'createMarket',
  args: ['World Cup 2026 Group C: Brazil vs Germany — who wins?', 'Brazil', 'Germany', closesAt],
});
await publicClient.waitForTransactionReceipt({ hash: seedHash });
const count = await publicClient.readContract({ address: market, abi: marketAbi, functionName: 'marketCount' });
console.log(`seeded market #0 (markets=${count})`);

appendFileSync('.env.local', `\nMARKET_ADDRESS=${market}\n`);
console.log(`\nMARKET_ADDRESS=${market} → appended to .env.local`);
console.log(`explorer: https://sepolia.etherscan.io/address/${market}`);
