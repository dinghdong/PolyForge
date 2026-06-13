/**
 * Real MetaMask ERC-7715 flow (Advanced Permissions).
 *
 * A2A twist vs. the stock 1Shot example: the permission's delegate (`to`)
 * is **Agent A**, not the relayer target. Agent A later redelegates a
 * narrower slice to the relayer via `parentPermissionContext` (server-side).
 * Requires MetaMask ≥ 13.23 (erc20-token-periodic in production builds).
 */
import { createWalletClient, createPublicClient, custom, parseAbi, parseUnits, keccak256, toHex } from 'viem';
import { sepolia } from 'viem/chains';
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions';

const SEPOLIA_ID = 11155111;
const SEPOLIA_HEX = '0xaa36a7';

type Eip1193 = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  isMetaMask?: boolean;
  providers?: Eip1193[];
};

function getEthereum(): Eip1193 {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  if (!eth) throw new Error('No wallet found — install the MetaMask extension (and reload the page)');
  // multiple wallet extensions can stack under window.ethereum.providers —
  // ERC-7715 needs the real MetaMask provider
  const candidates = eth.providers ?? [eth];
  return candidates.find((p) => p.isMetaMask) ?? eth;
}

export async function connectWallet(): Promise<`0x${string}`> {
  const eth = getEthereum();
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as `0x${string}`[];
  if (!accounts?.[0]) throw new Error('wallet returned no account');
  return accounts[0];
}

/** Already-connected silent check (no popup) — restores state after reload. */
export async function getConnectedAccount(): Promise<`0x${string}` | null> {
  try {
    const eth = getEthereum();
    const accounts = (await eth.request({ method: 'eth_accounts' })) as `0x${string}`[];
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Force the MetaMask account picker even when already connected. */
export async function switchAccount(): Promise<`0x${string}`> {
  const eth = getEthereum();
  await eth.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as `0x${string}`[];
  if (!accounts?.[0]) throw new Error('wallet returned no account');
  return accounts[0];
}

/** Track account switches made inside the MetaMask UI. Returns unsubscribe. */
export function onAccountsChanged(cb: (address: `0x${string}` | null) => void): () => void {
  try {
    const eth = getEthereum() as Eip1193 & {
      on?: (event: string, handler: (accounts: `0x${string}`[]) => void) => void;
      removeListener?: (event: string, handler: (accounts: `0x${string}`[]) => void) => void;
    };
    if (!eth.on) return () => {};
    const handler = (accounts: `0x${string}`[]) => cb(accounts?.[0] ?? null);
    eth.on('accountsChanged', handler);
    return () => eth.removeListener?.('accountsChanged', handler);
  } catch {
    return () => {};
  }
}

export async function ensureSepolia(): Promise<void> {
  const eth = getEthereum();
  const chainId = (await eth.request({ method: 'eth_chainId' })) as string;
  if (chainId?.toLowerCase() === SEPOLIA_HEX) return;
  await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_HEX }] });
}

const AGENT_NFA_MINT_ABI = parseAbi([
  'function mint(address to, string label, string model, bytes32 configHash, bool copyable) returns (uint256)',
  'function agentCount() view returns (uint256)',
]);

/** configHash must match the server's configHashFor(model, prompt). */
export function configHashFor(model: string, prompt: string): `0x${string}` {
  return keccak256(toHex(`${model}|${prompt}`));
}

/**
 * User-signed mint: the connected wallet sends the AgentNFA.mint tx, pays gas,
 * and owns the resulting NFA (to = the user). Returns the new tokenId.
 */
export async function mintAgentNFA(p: {
  nfaAddress: `0x${string}`;
  label: string;
  model: string;
  prompt: string;
  copyable: boolean;
}): Promise<{ txHash: `0x${string}`; tokenId: number }> {
  const eth = getEthereum();
  const account = await connectWallet();
  await ensureSepolia();
  const wallet = createWalletClient({ account, chain: sepolia, transport: custom(eth) });
  const pub = createPublicClient({ chain: sepolia, transport: custom(eth) });

  const txHash = await wallet.writeContract({
    address: p.nfaAddress,
    abi: AGENT_NFA_MINT_ABI,
    functionName: 'mint',
    args: [account, p.label, p.model, configHashFor(p.model, p.prompt), p.copyable],
  });
  await pub.waitForTransactionReceipt({ hash: txHash });
  // tokenIds are sequential; the one we just minted is the latest count
  const tokenId = Number(await pub.readContract({ address: p.nfaAddress, abi: AGENT_NFA_MINT_ABI, functionName: 'agentCount' }));
  return { txHash, tokenId };
}

export type GrantParams = {
  agentA: `0x${string}`; // the delegate — PolyForge star agent
  usdc: `0x${string}`;
  dailyBudgetUsdc: number;
  expiryDate: string; // YYYY-MM-DD
  justification: string;
};

/** Returns the raw permission context (hex) to hand to the server. */
export async function requestAgentPermission(p: GrantParams): Promise<string> {
  const eth = getEthereum();
  const wallet = createWalletClient({ transport: custom(eth) }).extend(erc7715ProviderActions());

  try {
    const granted = await wallet.requestExecutionPermissions([
      {
        chainId: SEPOLIA_ID,
        to: p.agentA,
        permission: {
          type: 'erc20-token-periodic',
          data: {
            tokenAddress: p.usdc,
            periodAmount: parseUnits(String(p.dailyBudgetUsdc), 6),
            periodDuration: 86400,
            justification: p.justification,
          },
          isAdjustmentAllowed: true,
        },
        expiry: Math.floor(new Date(`${p.expiryDate}T23:59:59Z`).getTime() / 1000),
      },
    ]);
    const context = (granted as { context?: string }[])[0]?.context;
    if (!context) throw new Error('wallet returned no permission context');
    return context;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/does not exist|not (?:available|supported)|method not found/i.test(msg)) {
      throw new Error(
        'This wallet does not support ERC-7715 Advanced Permissions. Use MetaMask ≥ 13.23, or run Headless Demo mode.',
      );
    }
    throw e;
  }
}
