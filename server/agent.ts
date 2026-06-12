/**
 * The agent loop: market repricing signal → Venice decision → guardrail
 * precheck → delegation bundle → relayer (gasless) → webhook/poll →
 * on-chain mirror position.
 */
import { formatUnits, parseUnits } from 'viem';
import {
  buildBetBundle,
  buildBrowserBetBundle,
  ensureMirrorMarket,
  getBrowserDelegator,
  getBrowserRoot,
  recordBetDirect,
  type ChainContext,
} from './chain';
import { estimateAndSend, getStatus } from './relayer';
import { decideBet } from './venice';
import type { MarketSignal } from './polymarket';
import {
  addMatchSpent,
  addSpent,
  budgetLeft,
  getAgentConfig,
  getPositions,
  isAgentActive,
  matchSpent,
  pushLog,
  upsertPosition,
  type Position,
} from './state';

let webhookUrl: string | undefined;
export function setWebhookUrl(url: string | undefined) {
  webhookUrl = url;
}

let inFlight = false;
let positionSeq = 0;
/** per-market cooldown so a jittery quote doesn't trigger rapid-fire bets */
const lastBetAt = new Map<string, number>();
const MARKET_COOLDOWN_MS = 90_000;

export async function onMarketSignal(ctx: ChainContext, signal: MarketSignal) {
  if (!isAgentActive()) return;
  const { market } = signal;
  if (inFlight) {
    pushLog('system', 'warning', `signal on "${market.question.slice(0, 50)}…" skipped — previous bundle still in flight`);
    return;
  }
  const last = lastBetAt.get(market.slug) ?? 0;
  if (Date.now() - last < MARKET_COOLDOWN_MS) return;
  const cfg = getAgentConfig();
  if (!cfg) return;

  inFlight = true;
  try {
    // Max Spend Per Match: cumulative across all outcomes of one match
    const matchKey = market.matchSlug ?? `futures:${market.slug}`;
    const matchUsed = matchSpent(matchKey);
    const matchLeftUsdc = cfg.maxSpendPerMatch - matchUsed;
    if (matchLeftUsdc <= 0) {
      pushLog(
        'guardrail',
        'warning',
        `BLOCKED: per-match cap reached for "${market.matchTitle ?? market.label}" — already $${matchUsed.toFixed(2)} / cap $${cfg.maxSpendPerMatch} (no re-entry this match)`,
      );
      return;
    }

    // 1) brain — analyse this market's repricing
    const left = Math.min(budgetLeft(), matchLeftUsdc);
    const decision = await decideBet(cfg, market, left);
    pushLog(
      'venice',
      decision.action === 'bet' ? 'success' : 'info',
      `[${decision.engine}${decision.model ? `:${decision.model}` : ''}] "${market.question.slice(0, 60)}" → ${decision.action.toUpperCase()} ` +
        `${decision.action === 'bet' ? `${decision.outcome === 0 ? 'YES' : 'NO'} $${decision.amountUsdc} ` : ''}(conf ${decision.confidence.toFixed(2)}) ${decision.rationale}`,
    );
    if (decision.action !== 'bet') return;

    // 2) guardrail precheck (mirror of the on-chain caveats)
    if (decision.amountUsdc > matchLeftUsdc || decision.amountUsdc > budgetLeft()) {
      pushLog(
        'guardrail',
        'error',
        `BLOCKED: $${decision.amountUsdc} exceeds match budget left $${matchLeftUsdc.toFixed(2)} (cap $${cfg.maxSpendPerMatch}) or daily left $${budgetLeft().toFixed(2)}`,
      );
      return;
    }
    if (new Date(cfg.expiryDate).getTime() < Date.now()) {
      pushLog('guardrail', 'error', 'BLOCKED: permission expired');
      return;
    }
    pushLog(
      'guardrail',
      'success',
      `ERC-7715 limit check OK — $${decision.amountUsdc} (match: ${matchUsed.toFixed(2)}+${decision.amountUsdc} ≤ ${cfg.maxSpendPerMatch}; daily left ${budgetLeft().toFixed(2)}; expires ${cfg.expiryDate})`,
    );

    // 3) execute (star rail; optionally mirrored by the 3-hop follower rail)
    lastBetAt.set(market.slug, Date.now());
    const rails: ('star' | 'follower')[] = cfg.copyTrade ? ['star', 'follower'] : ['star'];
    for (const rail of rails) {
      await executeBet(ctx, signal, rail, decision.outcome, decision.amountUsdc);
    }
    addMatchSpent(matchKey, decision.amountUsdc * rails.length);
  } catch (e) {
    pushLog('system', 'error', `agent loop error: ${(e as Error).message}`);
  } finally {
    inFlight = false;
  }
}

async function executeBet(ctx: ChainContext, signal: MarketSignal, rail: 'star' | 'follower', outcome: 0 | 1, amountUsdc: number) {
  const { market } = signal;
  const amount = parseUnits(String(amountUsdc), 6);
  const bettor = getBrowserDelegator() ?? ctx.userSmartAccount.address;
  const entryOdds = outcome === 0 ? market.yesPrice : market.noPrice;
  const entryPriceE6 = BigInt(Math.min(990_000, Math.max(10_000, Math.round(entryOdds * 1e6))));

  const position: Position = {
    id: `pos-${++positionSeq}`,
    marketId: -1, // assigned after the mirror market exists
    outcomeIndex: outcome,
    bettor,
    marketName: market.question,
    polymarketUrl: market.polymarketUrl,
    selectedOutcome: outcome === 0 ? 'YES' : 'NO',
    betAmountUsdc: amountUsdc,
    entryOdds,
    currentValueUsdc: amountUsdc,
    status: 'PENDING',
    rail,
  };
  upsertPosition(position);

  try {
    // mirror market on Sepolia (lazy, operator-funded)
    const marketId = await ensureMirrorMarket(ctx, market.slug, market.question);
    position.marketId = marketId;
    pushLog('contract', 'info', `mirror market #${marketId} ready for "${market.question.slice(0, 50)}…"`);

    const chainLabel = getBrowserRoot()
      ? 'ERC-7715 grant → AgentA → target (browser mode)'
      : rail === 'star'
        ? 'user → AgentA → target (2-hop)'
        : 'user → AgentA → AgentB → target (3-hop)';
    pushLog('relayer', 'info', `building ${chainLabel} bundle — ${amountUsdc} USDC on ${outcome === 0 ? 'YES' : 'NO'} @ $${entryOdds.toFixed(3)}`);

    const intent = { marketId, outcome, amountUsdc: amount, entryPriceE6, bettor, viaFollower: rail === 'follower' } as const;
    const { taskId, feeAmount } = await estimateAndSend(
      (fee) => (getBrowserRoot() ? buildBrowserBetBundle(ctx, intent, fee) : buildBetBundle(ctx, intent, fee)),
      parseUnits('0.01', 6),
      { destinationUrl: webhookUrl ? `${webhookUrl}/api/relayer-webhook` : undefined, memo: position.id },
    );
    position.taskId = taskId;
    pushLog('relayer', 'success', `task ${taskId.slice(0, 18)}… submitted (fee ${formatUnits(feeAmount, 6)} USDC, gas: relayer-sponsored)`);

    if (!webhookUrl) void pollUntilTerminal(ctx, taskId, position);
    addSpent(amountUsdc);
  } catch (e) {
    position.status = 'FAILED';
    upsertPosition(position);
    pushLog('relayer', 'error', `bundle rejected: ${(e as Error).message}`);
  }
}

async function pollUntilTerminal(ctx: ChainContext, taskId: string, position: Position) {
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const st = await getStatus(taskId);
      if (st.status === 200) {
        await applyConfirmation(ctx, position, st.receipt?.transactionHash);
        return;
      }
      if (st.status >= 400) {
        position.status = 'FAILED';
        upsertPosition(position);
        pushLog('contract', 'error', `task ${taskId.slice(0, 18)}… failed (status ${st.status})`);
        return;
      }
    } catch {
      /* transient */
    }
  }
}

export async function applyConfirmation(ctx: ChainContext, position: Position, txHash?: string) {
  if (position.status === 'OPEN') return; // webhook + poll can race; idempotent
  position.status = 'OPEN';
  position.txHash = txHash;
  upsertPosition(position);
  pushLog(
    'contract',
    'success',
    `budget transfer confirmed${txHash ? ` — https://sepolia.etherscan.io/tx/${txHash}` : ''} (user native gas cost: 0)`,
  );
  try {
    const recordTx = await recordBetDirect(ctx, {
      marketId: position.marketId,
      outcome: position.outcomeIndex,
      amountUsdc: parseUnits(String(position.betAmountUsdc), 6),
      entryPriceE6: BigInt(Math.min(990_000, Math.max(10_000, Math.round(position.entryOdds * 1e6)))),
      bettor: (position.bettor as `0x${string}`) ?? ctx.userSmartAccount.address,
    });
    position.recordTxHash = recordTx;
    upsertPosition(position);
    pushLog('contract', 'success', `position recorded on mirror market #${position.marketId} — https://sepolia.etherscan.io/tx/${recordTx}`);
  } catch (e) {
    pushLog('contract', 'error', `recordBet failed: ${(e as Error).message}`);
  }
}

export function findPositionByMemo(memo?: string): Position | undefined {
  if (!memo) return undefined;
  return getPositions().find((p) => p.id === memo);
}
