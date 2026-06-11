/**
 * Compile contracts/MockPredictionMarket.sol with solc-js (no Hardhat needed
 * for a single demo contract) and emit ABI + bytecode to server/abi/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import solc from 'solc';

const source = readFileSync('contracts/MockPredictionMarket.sol', 'utf8');

const input = {
  language: 'Solidity',
  sources: { 'MockPredictionMarket.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (output.errors ?? []).filter((e: { severity: string }) => e.severity === 'error');
if (errors.length > 0) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
for (const w of (output.errors ?? []).filter((e: { severity: string }) => e.severity !== 'error')) {
  console.warn(w.formattedMessage);
}

const contract = output.contracts['MockPredictionMarket.sol'].MockPredictionMarket;
mkdirSync('server/abi', { recursive: true });
writeFileSync(
  'server/abi/MockPredictionMarket.json',
  JSON.stringify({ abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` }, null, 2),
);
console.log(`compiled ✓  abi entries=${contract.abi.length}  bytecode=${contract.evm.bytecode.object.length / 2} bytes`);
