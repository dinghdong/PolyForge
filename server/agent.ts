/**
 * The agent loop: match event → Venice decision → guardrail precheck →
 * delegation bundle → relayer (gasless) → webhook/poll → position update.
 */
import { formatUnits, parseUnits } from 'viem';
import {
  buildBetBundle,
  buildBrowserBetBundle,
  getBrowserDelegator,
  getBrowserRoot,
  recordBetDirect,
  type ChainContext,
} from './chain';
import { estimateAndSend, getStatus } from './relayer';
import { decideBet } from './venice';
import type { MatchEvent } from './simulator';
import {
  addSpent,
  budgetLeft,
  getAgentConfig,
  getPositions,
  isAgentActive,
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

export async function onMatchEvent(ctx: ChainContext, event: MatchEvent) {
  if (!isAgentActive()) return;
  if (event.kind !== 'goal' && event.kind !== 'odds-shift') return;
  if (inFlight) {
    pushLog('system', 'warning', 'signal skipped — previous bundle still in flight');
    return;
  }
  const cfg = getAgentConfig();
  if (!cfg) return;

  inFlight = true;
  try {
    // 1) brain
    const left = budgetLeft();
    const decision = await decideBet(cfg, event, left);
    pushLog(
      'venice',
      decision.action === 'bet' ? 'success' : 'info',
      `[${decision.engine}${decision.model ? `:${decision.model}` : ''}] ${decision.action.toUpperCase()} ` +
        `(conf ${decision.confidence.toFixed(2)}) ${decision.rationale}`,
    );
    if (decision.action !== 'bet') return;

    // 2) guardrail precheck (mirror of the on-chain caveats)
    if (decision.amountUsdc > cfg.maxSpendPerMatch || decision.amountUsdc > left) {
      pushLog('guardrail', 'error', `BLOCKED: ${decision.amountUsdc} USDC exceeds per-match cap ${cfg.maxSpendPerMatch} or daily budget left ${left}`);
      return;
    }
    if (new Date(cfg.expiryDate).getTime() < Date.now()) {
      pushLog('guardrail', 'error', 'BLOCKED: permission expired');
      return;
    }
    pushLog('guardrail', 'success', `ERC-7715 limit check OK — ${decision.amountUsdc} USDC ≤ caps (per-match ${cfg.maxSpendPerMatch}, daily left ${left.toFixed(2)})`);

    // 3) execute (star rail; optionally mirrored by the 3-hop follower rail)
    const rails: ('star' | 'follower')[] = cfg.copyTrade ? ['star', 'follower'] : ['star'];
    for (const rail of rails) {
      await executeBet(ctx, event, rail, decision.outcome as 0 | 1, decision.amountUsdc);
    }
  } catch (e) {
    pushLog('system', 'error', `agent loop error: ${(e as Error).message}`);
  } finally {
    inFlight = false;
  }
}

async function executeBet(ctx: ChainContext, event: MatchEvent, rail: 'star' | 'follower', outcome: 0 | 1, amountUsdc: number) {
  const amount = parseUnits(String(amountUsdc), 6);
  // in browser mode the bettor (and the wallet whose USDC moves) is the
  // real account that granted the 7715 permission
  const bettor = getBrowserDelegator() ?? ctx.userSmartAccount.address;
  const position: Position = {
    id: `pos-${++positionSeq}`,
    marketId: 0,
    outcomeIndex: outcome,
    bettor,
    marketName: `${event.teamHome} vs ${event.teamAway}`,
    selectedOutcome: outcome === 0 ? 'YES' : 'NO',
    betAmountUsdc: amountUsdc,
    entryOdds: outcome === 0 ? event.odds.home : event.odds.away,
    currentValueUsdc: amountUsdc,
    status: 'PENDING',
    rail,
  };
  upsertPosition(position);

  const browserMode = Boolean(getBrowserRoot());
  const chainLabel = browserMode
    ? 'ERC-7715 grant → AgentA → target (browser mode)'
    : rail === 'star'
      ? 'user → AgentA → target (2-hop)'
      : 'user → AgentA → AgentB → target (3-hop)';
  pushLog('relayer', 'info', `building ${chainLabel} redelegation bundle — bet ${amountUsdc} USDC on outcome ${outcome}`);

  try {
    const intent = { marketId: 0, outcome, amountUsdc: amount, bettor, viaFollower: rail === 'follower' } as const;
    const { taskId, feeAmount } = await estimateAndSend(
      (fee) => (browserMode ? buildBrowserBetBundle(ctx, intent, fee) : buildBetBundle(ctx, intent, fee)),
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
  // attribute the received USDC to a market position (operator call, agentA pays its own gas)
  try {
    const recordTx = await recordBetDirect(ctx, {
      marketId: position.marketId,
      outcome: position.outcomeIndex,
      amountUsdc: parseUnits(String(position.betAmountUsdc), 6),
      bettor: (position.bettor as `0x${string}`) ?? ctx.userSmartAccount.address,
    });
    position.recordTxHash = recordTx;
    upsertPosition(position);
    pushLog('contract', 'success', `position recorded on MockPredictionMarket — https://sepolia.etherscan.io/tx/${recordTx}`);
  } catch (e) {
    pushLog('contract', 'error', `recordBet failed: ${(e as Error).message}`);
  }
}

export function findPositionByMemo(memo?: string): Position | undefined {
  if (!memo) return undefined;
  return getPositions().find((p) => p.id === memo);
}
