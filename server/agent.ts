/**
 * Multi-mandate agent loop: a market repricing signal fans out to EVERY active
 * mandate. Each mandate decides independently (its own brain, budget, cooldown,
 * in-flight lock), then executes its bet on the gasless rail. Mandates run
 * concurrently; agentA operator writes are serialized in chain.ts.
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
  addMandateSpent,
  getActiveMandates,
  getPositions,
  mandateBudgetLeft,
  mandateMatchSpent,
  pushLog,
  upsertPosition,
  type Mandate,
  type Position,
} from './state';

let webhookUrl: string | undefined;
export function setWebhookUrl(url: string | undefined) {
  webhookUrl = url;
}

let positionSeq = 0;
/** per-(mandate,market) cooldown + per-mandate in-flight lock */
const lastBetAt = new Map<string, number>();
const inFlight = new Set<string>();
const MARKET_COOLDOWN_MS = 90_000;

/**
 * Concurrent mandates share one underlying user account (headless) or grant
 * (browser). Two redemptions from the same EIP-7702 account at once conflict
 * on its internal execution state — so serialize relayer sends per bettor.
 * Decisions stay concurrent; only the on-chain execution queues.
 */
const sendQueues = new Map<string, Promise<unknown>>();
function enqueueSend<T>(account: string, fn: () => Promise<T>): Promise<T> {
  const prev = sendQueues.get(account) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  sendQueues.set(
    account,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export async function onMarketSignal(ctx: ChainContext, signal: MarketSignal) {
  const active = getActiveMandates();
  if (active.length === 0) return;
  // fan out: every active mandate evaluates this signal independently
  await Promise.all(active.map((m) => evaluateForMandate(ctx, m, signal)));
}

async function evaluateForMandate(ctx: ChainContext, mandate: Mandate, signal: MarketSignal) {
  const { market } = signal;
  if (inFlight.has(mandate.id)) return; // this mandate is already placing a bet
  const cdKey = `${mandate.id}:${market.slug}`;
  if (Date.now() - (lastBetAt.get(cdKey) ?? 0) < MARKET_COOLDOWN_MS) return;

  inFlight.add(mandate.id);
  try {
    const tag = `${mandate.agentLabel ? `"${mandate.agentLabel}"` : mandate.id}`;
    // Max Spend Per Match: cumulative across all outcomes of one match
    const matchKey = market.matchSlug ?? `futures:${market.slug}`;
    const matchUsed = mandateMatchSpent(mandate, matchKey);
    const matchLeft = mandate.maxSpendPerMatch - matchUsed;
    if (matchLeft <= 0) {
      pushLog('guardrail', 'warning', `[${tag}] per-match cap reached on "${market.matchTitle ?? market.label}" ($${matchUsed.toFixed(2)}/$${mandate.maxSpendPerMatch}) — skip`);
      return;
    }

    // 1) brain
    const left = Math.min(mandateBudgetLeft(mandate), matchLeft);
    const decision = await decideBet({ modelId: mandate.modelId, prompt: mandate.prompt, maxSpendPerMatch: mandate.maxSpendPerMatch, maxDailyAllowance: mandate.maxDailyAllowance }, market, left);
    pushLog(
      'venice',
      decision.action === 'bet' ? 'success' : 'info',
      `[${tag}] "${market.question.slice(0, 48)}" → ${decision.action.toUpperCase()} ` +
        `${decision.action === 'bet' ? `${decision.outcome === 0 ? 'YES' : 'NO'} $${decision.amountUsdc} ` : ''}(conf ${decision.confidence.toFixed(2)})`,
    );
    if (decision.action !== 'bet') return;

    // 2) guardrail precheck (mirror of the on-chain caveats)
    if (decision.amountUsdc > matchLeft || decision.amountUsdc > mandateBudgetLeft(mandate)) {
      pushLog('guardrail', 'error', `[${tag}] BLOCKED: $${decision.amountUsdc} exceeds match-left $${matchLeft.toFixed(2)} or daily-left $${mandateBudgetLeft(mandate).toFixed(2)}`);
      return;
    }
    if (new Date(mandate.expiryDate).getTime() < Date.now()) {
      pushLog('guardrail', 'error', `[${tag}] BLOCKED: mandate permission expired`);
      return;
    }
    pushLog('guardrail', 'success', `[${tag}] ERC-7715 check OK — $${decision.amountUsdc} (match ${matchUsed.toFixed(2)}+${decision.amountUsdc}≤${mandate.maxSpendPerMatch}; daily-left ${mandateBudgetLeft(mandate).toFixed(2)})`);

    // 3) execute (star rail; optionally mirrored by the 3-hop follower rail)
    lastBetAt.set(cdKey, Date.now());
    const rails: ('star' | 'follower')[] = mandate.copyTrade ? ['star', 'follower'] : ['star'];
    for (const rail of rails) {
      await executeBet(ctx, mandate, signal, rail, decision.outcome, decision.amountUsdc);
    }
    addMandateSpent(mandate, matchKey, decision.amountUsdc * rails.length);
  } catch (e) {
    pushLog('system', 'error', `[${mandate.id}] loop error: ${(e as Error).message}`);
  } finally {
    inFlight.delete(mandate.id);
  }
}

async function executeBet(ctx: ChainContext, mandate: Mandate, signal: MarketSignal, rail: 'star' | 'follower', outcome: 0 | 1, amountUsdc: number) {
  const { market } = signal;
  const amount = parseUnits(String(amountUsdc), 6);
  const browserMode = mandate.mode === 'browser' && Boolean(getBrowserRoot());
  const bettor = (browserMode ? getBrowserDelegator() : ctx.userSmartAccount.address) ?? ctx.userSmartAccount.address;
  const entryOdds = outcome === 0 ? market.yesPrice : market.noPrice;
  const entryPriceE6 = BigInt(Math.min(990_000, Math.max(10_000, Math.round(entryOdds * 1e6))));

  const position: Position = {
    id: `pos-${++positionSeq}`,
    marketId: -1,
    outcomeIndex: outcome,
    mandateId: mandate.id,
    agentId: mandate.agentId,
    agentLabel: mandate.agentLabel,
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
    const marketId = await ensureMirrorMarket(ctx, market.slug, market.question);
    position.marketId = marketId;

    const intent = { marketId, outcome, amountUsdc: amount, entryPriceE6, bettor, mandateId: mandate.id, viaFollower: rail === 'follower' } as const;
    // serialize redemptions from the same shared account to avoid 7702 conflicts
    const { taskId, feeAmount } = await enqueueSend(bettor, () =>
      estimateAndSend(
        (fee) => (browserMode ? buildBrowserBetBundle(ctx, intent, fee) : buildBetBundle(ctx, intent, fee)),
        parseUnits('0.01', 6),
        { destinationUrl: webhookUrl ? `${webhookUrl}/api/relayer-webhook` : undefined, memo: position.id },
      ),
    );
    position.taskId = taskId;
    pushLog('relayer', 'success', `[${mandate.agentLabel ?? mandate.id}] task ${taskId.slice(0, 16)}… submitted (fee ${formatUnits(feeAmount, 6)} USDC, gas: relayer-sponsored)`);
    void pollUntilTerminal(ctx, taskId, position);
  } catch (e) {
    position.status = 'FAILED';
    upsertPosition(position);
    pushLog('relayer', 'error', `[${mandate.agentLabel ?? mandate.id}] bundle rejected: ${(e as Error).message}`);
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
        pushLog('contract', 'error', `task ${taskId.slice(0, 16)}… failed (status ${st.status})`);
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
  pushLog('contract', 'success', `[${position.agentLabel ?? position.mandateId}] bet confirmed${txHash ? ` — https://sepolia.etherscan.io/tx/${txHash}` : ''} (user gas: 0)`);
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
    pushLog('contract', 'success', `[${position.agentLabel ?? position.mandateId}] recorded on mirror #${position.marketId} — https://sepolia.etherscan.io/tx/${recordTx}`);
  } catch (e) {
    pushLog('contract', 'error', `recordBet failed: ${(e as Error).message}`);
  }
}

export function findPositionByMemo(memo?: string): Position | undefined {
  if (!memo) return undefined;
  return getPositions().find((p) => p.id === memo);
}
