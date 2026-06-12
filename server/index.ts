/**
 * PolyForge server — express on :8788.
 *   GET  /api/telemetry          SSE stream (log / match / state events)
 *   GET  /api/state              snapshot (config, positions, budget)
 *   POST /api/agents             save agent config from the Forge studio
 *   POST /api/agents/activate    activate: headless (script root) or browser
 *                                ({ permissionContext } from ERC-7715 grant)
 *   POST /api/agents/deactivate  stop the loop (off-chain kill switch; on-chain
 *                                revocation is the wallet-side action)
 *   POST /api/relayer-webhook    1Shot Ed25519-signed status events
 *   GET  /api/health             chain context + relayer caps
 */
import { spawn } from 'node:child_process';
import express from 'express';
import { config as loadEnv } from 'dotenv';
import { erc20Abi, formatUnits } from 'viem';
import { decodeDelegations } from '@metamask/smart-accounts-kit/utils';
import { initChainContext, getHeadlessRoot, setBrowserRoot, getBrowserDelegator, publicClient, type ChainContext } from './chain';
import { onMatchEvent, setWebhookUrl, applyConfirmation, findPositionByMemo } from './agent';
import { verifyWebhook, type WebhookBody } from './relayer';
import { MatchSimulator } from './simulator';
import { startPolymarketFeed, getPolymarketState } from './polymarket';
import {
  getAgentConfig,
  pushLog,
  pushMatch,
  setAgentActive,
  setAgentConfig,
  snapshot,
  sseSubscribe,
  sseUnsubscribe,
} from './state';

loadEnv({ path: '.env.local' });

const PORT = Number(process.env.PORT ?? 8788);
const app = express();
app.use(express.json({ limit: '1mb' }));

let ctx: ChainContext;
const simulator = new MatchSimulator({ msPerMatchMinute: Number(process.env.SIM_MS_PER_MINUTE ?? 2000) });

simulator.on('event', (e) => {
  pushMatch(e);
  if (e.kind === 'kickoff' || e.kind === 'goal' || e.kind === 'fulltime') {
    pushLog('system', 'info', e.description);
  }
  void onMatchEvent(ctx, e);
});

app.get('/api/telemetry', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  sseSubscribe(res);
  const heartbeat = setInterval(() => res.write(': hb\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseUnsubscribe(res);
  });
});

app.get('/api/state', async (_req, res) => {
  const activeUser = getBrowserDelegator() ?? ctx.userSmartAccount.address;
  let balanceUsdc: number | null = null;
  try {
    const raw = (await publicClient.readContract({
      address: ctx.usdc,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [activeUser],
    })) as bigint;
    balanceUsdc = Number(formatUnits(raw, 6));
  } catch {
    /* RPC hiccup — frontend shows last known */
  }
  res.json({
    ...snapshot(),
    market: ctx.market,
    usdc: ctx.usdc,
    agentA: ctx.agentA.address,
    user: activeUser,
    balanceUsdc,
  });
});

app.post('/api/sim/event', (req, res) => {
  const type = String(req.body?.type ?? '');
  if (type === 'goal-home') simulator.forceGoal('home');
  else if (type === 'goal-away') simulator.forceGoal('away');
  else {
    res.status(400).json({ ok: false, error: 'type must be goal-home | goal-away' });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/agents', (req, res) => {
  const b = req.body ?? {};
  setAgentConfig({
    modelId: String(b.modelId ?? 'venice-llama3-70b'),
    prompt: String(b.prompt ?? ''),
    maxSpendPerMatch: Number(b.maxSpendPerMatch ?? 5),
    maxDailyAllowance: Number(b.maxDailyAllowance ?? 20),
    expiryDate: String(b.expiryDate ?? '2026-07-19'),
    copyTrade: Boolean(b.copyTrade ?? false),
  });
  pushLog('system', 'success', `agent config saved — model=${b.modelId} perMatch=$${b.maxSpendPerMatch} daily=$${b.maxDailyAllowance}`);
  res.json({ ok: true });
});

app.post('/api/agents/activate', async (req, res) => {
  try {
    if (!getAgentConfig()) {
      res.status(400).json({ ok: false, error: 'save agent config first' });
      return;
    }
    const mode = (req.body?.mode as string) ?? 'headless';
    if (mode === 'browser') {
      const context = req.body?.permissionContext as `0x${string}` | undefined;
      if (!context) {
        res.status(400).json({ ok: false, error: 'permissionContext required for browser mode' });
        return;
      }
      const decoded = decodeDelegations(context);
      setBrowserRoot(decoded);
      pushLog('guardrail', 'success', `ERC-7715 permission received — delegate=${decoded[0]?.delegate?.slice(0, 10)}… caveats=${decoded[0]?.caveats?.length}`);
    } else {
      const root = await getHeadlessRoot(ctx);
      pushLog('guardrail', 'success', `headless session delegation signed by user smart account (${root.caveats.length} caveat(s): USDC transfer budget, 30 USDC ceiling)`);
    }
    setAgentActive(true);
    if (!simulator.running) simulator.start();
    pushLog('system', 'success', 'agent ACTIVE — watching the live feed; hands off the keyboard 🎬');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

app.post('/api/agents/deactivate', (_req, res) => {
  setAgentActive(false);
  pushLog('system', 'warning', 'agent deactivated (loop stopped). On-chain revocation: disable the permission in MetaMask → wallet revokes the delegation.');
  res.json({ ok: true });
});

app.post('/api/relayer-webhook', async (req, res) => {
  const body = req.body as WebhookBody;
  const verified = await verifyWebhook(body);
  if (!verified) {
    pushLog('relayer', 'error', `webhook REJECTED — Ed25519 signature failed (keyId ${body?.keyId ?? '?'})`);
    res.sendStatus(401);
    return;
  }
  const label = body.type === 4 ? 'submitted' : body.type === 0 ? 'confirmed' : 'reverted';
  pushLog('relayer', body.type === 1 ? 'error' : 'success', `webhook ✓ Ed25519-verified — ${label} (memo ${body.data?.memo ?? '-'})`);
  const position = findPositionByMemo(body.data?.memo);
  if (position) {
    if (body.type === 0) void applyConfirmation(ctx, position, body.data?.receipt?.transactionHash);
    if (body.type === 1) {
      position.status = 'FAILED';
      pushLog('contract', 'error', `bundle reverted on-chain (memo ${body.data?.memo})`);
    }
  }
  res.sendStatus(200);
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    chainId: 11155111,
    market: ctx.market ?? null,
    relayerTarget: ctx.caps.targetAddress,
    veniceKey: Boolean(process.env.VENICE_API_KEY),
    webhookMode: Boolean(process.env.WEBHOOK_PUBLIC_URL) || undefined,
    polymarket: getPolymarketState() ?? null,
  });
});

// ---------- boot ----------
async function startTunnel(): Promise<string | undefined> {
  if (process.env.WEBHOOK_PUBLIC_URL) return process.env.WEBHOOK_PUBLIC_URL;
  if (process.env.WEBHOOK_TUNNEL === '0') return undefined;
  try {
    const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.unref();
    return await new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), 15_000);
      const scan = (chunk: Buffer) => {
        const m = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) {
          clearTimeout(timer);
          resolve(m[0]);
        }
      };
      proc.stdout?.on('data', scan);
      proc.stderr?.on('data', scan);
      proc.on('exit', () => resolve(undefined));
    });
  } catch {
    return undefined;
  }
}

ctx = await initChainContext();
const tunnelUrl = await startTunnel();
setWebhookUrl(tunnelUrl);
startPolymarketFeed(simulator);

app.listen(PORT, () => {
  pushLog('system', 'info', `PolyForge server on :${PORT} — market=${ctx.market ?? 'NOT DEPLOYED (dry betting disabled)'}`);
  pushLog('system', 'info', tunnelUrl ? `webhooks via ${tunnelUrl}` : 'webhooks disabled — falling back to relayer_getStatus polling');
  pushLog('system', 'info', process.env.VENICE_API_KEY ? 'Venice AI: live' : 'Venice AI: no API key — deterministic fallback engine');
});
