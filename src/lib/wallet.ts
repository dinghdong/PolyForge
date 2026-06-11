/**
 * Real MetaMask ERC-7715 flow (Advanced Permissions).
 *
 * A2A twist vs. the stock 1Shot example: the permission's delegate (`to`)
 * is **Agent A**, not the relayer target. Agent A later redelegates a
 * narrower slice to the relayer via `parentPermissionContext` (server-side).
 * Requires MetaMask ≥ 13.23 (erc20-token-periodic in production builds).
 */
import { createWalletClient, custom, parseUnits } from 'viem';
import { erc7715ProviderActions } from '@metamask/smart-accounts-kit/actions';

const SEPOLIA_ID = 11155111;
const SEPOLIA_HEX = '0xaa36a7';

type Eip1193 = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

function getEthereum(): Eip1193 {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  if (!eth) throw new Error('No wallet found — install the MetaMask extension');
  return eth;
}

export async function connectWallet(): Promise<`0x${string}`> {
  const eth = getEthereum();
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as `0x${string}`[];
  if (!accounts?.[0]) throw new Error('wallet returned no account');
  return accounts[0];
}

export async function ensureSepolia(): Promise<void> {
  const eth = getEthereum();
  const chainId = (await eth.request({ method: 'eth_chainId' })) as string;
  if (chainId?.toLowerCase() === SEPOLIA_HEX) return;
  await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_HEX }] });
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
