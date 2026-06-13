/**
 * Deploy AgentNFA to Sepolia and seed two starter agents so the Explore board
 * isn't empty on first load. Deployer/operator = agentA (only account with ETH).
 * Writes AGENT_NFA_ADDRESS to .env.local.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createWalletClient, formatEther, getAddress, http, keccak256, parseAbi, toHex } from 'viem';
import { CHAIN, publicClient, requireAccounts } from '../spike/lib';

const accounts = requireAccounts();
const eth = await publicClient.getBalance({ address: accounts.agentA.address });
console.log(`deployer (agentA) ${accounts.agentA.address}  ETH=${formatEther(eth)}`);
if (eth < 3_000_000_000_000_000n) {
  console.error('deployer needs ~0.003+ ETH on Sepolia (Google/MetaMask faucet)');
  process.exit(1);
}

const wallet = createWalletClient({ chain: CHAIN, transport: http(), account: accounts.agentA });
const { abi, bytecode } = JSON.parse(readFileSync('server/abi/AgentNFA.json', 'utf8'));

const deployHash = await wallet.deployContract({ chain: CHAIN, account: accounts.agentA, abi, bytecode });
console.log(`deploy tx ${deployHash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const nfa = getAddress(receipt.contractAddress!);
console.log(`AgentNFA @ ${nfa} (block ${receipt.blockNumber})`);

// seed two starter agents owned by agentA (the platform demo agents)
const mintAbi = parseAbi([
  'function mint(address to, string label, string model, bytes32 configHash) returns (uint256)',
  'function agentCount() view returns (uint256)',
]);
const seeds = [
  { label: 'World Cup Underdog Hunter', model: 'venice-llama3-70b', prompt: 'Statistics-driven underdog specialist; buys value on cheapened sides after repricings.' },
  { label: 'Momentum Reactor', model: 'deepseek-r1-70b', prompt: 'Rides momentum: continues the direction of sharp Polymarket repricings.' },
];
for (const s of seeds) {
  const hash = await wallet.writeContract({
    chain: CHAIN,
    account: accounts.agentA,
    address: nfa,
    abi: mintAbi,
    functionName: 'mint',
    args: [accounts.agentA.address, s.label, s.model, keccak256(toHex(`${s.model}|${s.prompt}`))],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`minted "${s.label}"`);
}
const count = await publicClient.readContract({ address: nfa, abi: mintAbi, functionName: 'agentCount' });
console.log(`agentCount = ${count}`);

const envPath = '.env.local';
const env = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const line = `AGENT_NFA_ADDRESS=${nfa}`;
writeFileSync(envPath, env.match(/^AGENT_NFA_ADDRESS=.*$/m) ? env.replace(/^AGENT_NFA_ADDRESS=.*$/gm, line) : `${env}\n${line}\n`);
console.log(`\n${line} → written to .env.local`);
console.log(`explorer: https://sepolia.etherscan.io/address/${nfa}`);
