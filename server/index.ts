/**
 * PolyForge server — express on :8788.
 *   GET  /api/telemetry          SSE stream (log / markets / state events)
 *   GET  /api/state              snapshot (config, positions, budget)
 *   GET  /api/markets            live Polymarket World Cup board
 *   POST /api/markets/inject     { slug } synthetic dislocation (demo)
 *   POST /api/agents             save agent config from the Forge studio
 *   POST /api/agents/activate    headless (script root) or browser
 *                                ({ permissionContext } from ERC-7715 grant)
 *   POST /api/agents/deactivate  stop the loop (off-chain kill switch)
 *   POST /api/relayer-webhook    1Shot Ed25519-signed status events
 *   GET  /api/health             chain context + relayer caps + feed
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express from 'express';
import { config as loadEnv } from 'dotenv';
import { erc20Abi, formatUnits } from 'viem';
import { decodeDelegations } from '@metamask/smart-accounts-kit/utils';
import { initChainContext, getHeadlessRoot, setBrowserRoot, getBrowserDelegator, publicClient, type ChainContext } from './chain';
import { onMarketSignal, setWebhookUrl, applyConfirmation, findPositionByMemo } from './agent';
import { verifyWebhook, type WebhookBody } from './relayer';
import { startPolymarketFeed, getBoard, injectDislocation, marketSignals, type MarketSignal, type BoardSnapshot } from './polymarket';
import { readAgents, mintAgent, getAgent, rememberPrompt } from './agents';
import {
  createMandate,
  getAllMandates,
  getActiveMandates,
  getMandate,
  getPositions,
  pushBoard,
  pushLog,
  snapshot,
  sseSubscribe,
  sseUnsubscribe,
  stopAllMandates,
  stopMandate,
  type MandateConfig,
} from './state';

loadEnv({ path: '.env.local' });

const PORT = Number(process.env.PORT ?? 8788);
const app = express();
app.use(express.json({ limit: '1mb' }));

// demo resilience: a transient RPC/proxy hiccup must never kill the server
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  try {
    pushLog('system', 'warning', `unhandled rejection (ignored): ${msg.slice(0, 140)}`);
  } catch {
    // eslint-disable-next-line no-console
    console.error('unhandledRejection:', msg.slice(0, 200));
  }
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('uncaughtException (kept alive):', err.message?.slice(0, 200));
});

let ctx: ChainContext;

marketSignals.on('board', (board: BoardSnapshot) => pushBoard(board));
marketSignals.on('signal', (signal: MarketSignal) => void onMarketSignal(ctx, signal));

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

app.get('/api/markets', (_req, res) => {
  res.json(getBoard());
});

app.post('/api/markets/inject', (req, res) => {
  const slug = String(req.body?.slug ?? '');
  const delta = req.body?.delta !== undefined ? Number(req.body.delta) : undefined;
  const q = injectDislocation(slug, delta);
  if (!q) {
    res.status(404).json({ ok: false, error: `unknown market slug: ${slug}` });
    return;
  }
  res.json({ ok: true, market: q });
});

// --- Agent (brain / NFA) registry ---

app.get('/api/agents/registry', async (_req, res) => {
  try {
    const agents = await readAgents();
    const positions = getPositions();
    // merge real activity per agent (no win-rate — markets settle outside the hackathon window)
    const board = agents.map((a) => {
      const own = positions.filter((p) => p.agentId === a.tokenId);
      return {
        ...a,
        activity: {
          positions: own.length,
          volumeUsdc: own.reduce((s, p) => s + p.betAmountUsdc, 0),
          openPositions: own.filter((p) => p.status === 'OPEN' || p.status === 'PENDING').length,
          lastMarket: own[own.length - 1]?.marketName,
        },
      };
    });
    res.json(board);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post('/api/agents/mint', async (req, res) => {
  try {
    const b = req.body ?? {};
    const creator = (b.creator as `0x${string}`) ?? getBrowserDelegator() ?? ctx.userSmartAccount.address;
    const label = String(b.label ?? 'Untitled Agent').slice(0, 64);
    const model = String(b.model ?? 'venice-llama3-70b');
    const prompt = String(b.prompt ?? '');
    const copyable = b.copyable === undefined ? true : Boolean(b.copyable); // public by default
    pushLog('system', 'info', `minting AgentNFA "${label}" → ${creator.slice(0, 10)}… (${copyable ? 'public' : 'private'}, operator-funded)`);
    const { tokenId, txHash } = await mintAgent(ctx, creator, label, model, prompt, copyable);
    pushLog('contract', 'success', `AgentNFA #${tokenId} "${label}" minted (${copyable ? 'public' : 'private'}) — https://sepolia.etherscan.io/tx/${txHash}`);
    res.json({ ok: true, tokenId, txHash });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

// --- Mandates (concurrent running instances) ---

// the config being assembled in the Studio, consumed by activate
let pendingConfig: MandateConfig | undefined;

app.post('/api/agents', async (req, res) => {
  const b = req.body ?? {};
  let agentId: number | undefined;
  let agentLabel: string | undefined;
  let modelId = String(b.modelId ?? 'venice-llama3-70b');
  let prompt = String(b.prompt ?? '');
  if (b.agentId !== undefined && b.agentId !== null) {
    const brain = await getAgent(Number(b.agentId));
    if (!brain) {
      res.status(404).json({ ok: false, error: `agent #${b.agentId} not found` });
      return;
    }
    agentId = brain.tokenId;
    agentLabel = brain.label;
    modelId = brain.model;
    prompt = prompt || brain.prompt;
    rememberPrompt(brain.tokenId, prompt);
  }
  pendingConfig = {
    agentId,
    agentLabel,
    modelId,
    prompt,
    maxSpendPerMatch: Number(b.maxSpendPerMatch ?? 5),
    maxDailyAllowance: Number(b.maxDailyAllowance ?? 20),
    expiryDate: String(b.expiryDate ?? '2026-07-19'),
    copyTrade: Boolean(b.copyTrade ?? false),
  };
  res.json({ ok: true });
});

app.post('/api/agents/activate', async (req, res) => {
  try {
    const cfg = pendingConfig;
    if (!cfg) {
      res.status(400).json({ ok: false, error: 'configure an agent first' });
      return;
    }
    const mode = (req.body?.mode as string) === 'browser' ? 'browser' : 'headless';
    const runner = (mode === 'browser' ? getBrowserDelegator() : ctx.userSmartAccount.address) ?? ctx.userSmartAccount.address;

    // gated execution: a private (non-copyable) agent can only be run by its owner
    if (cfg.agentId !== undefined) {
      const brain = await getAgent(cfg.agentId);
      if (brain && !brain.copyable && runner.toLowerCase() !== brain.owner.toLowerCase()) {
        pushLog('guardrail', 'error', `BLOCKED: AgentNFA #${cfg.agentId} "${brain.label}" is private — only its owner can run it`);
        res.status(403).json({ ok: false, error: `Agent #${cfg.agentId} is private (gated to its owner). Pick a public agent or mint your own.` });
        return;
      }
    }

    if (mode === 'browser') {
      const context = req.body?.permissionContext as `0x${string}` | undefined;
      if (!context) {
        res.status(400).json({ ok: false, error: 'permissionContext required for browser mode' });
        return;
      }
      setBrowserRoot(decodeDelegations(context));
    }

    const mandate = createMandate(cfg, mode);
    if (mode === 'headless') await getHeadlessRoot(ctx, mandate.id); // pre-sign this mandate's root
    pushLog(
      'system',
      'success',
      `▶ mandate ${mandate.id} ACTIVE — ${cfg.agentLabel ? `agent "${cfg.agentLabel}" (NFA #${cfg.agentId})` : `model ${cfg.modelId}`} · ${mode} · perMatch $${cfg.maxSpendPerMatch} · daily $${cfg.maxDailyAllowance} · now ${getActiveMandates().length} running`,
    );
    res.json({ ok: true, mandateId: mandate.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

app.get('/api/mandates', (_req, res) => {
  res.json(snapshot().mandates);
});

app.post('/api/mandates/:id/stop', (req, res) => {
  const ok = stopMandate(req.params.id);
  if (ok) pushLog('system', 'warning', `■ mandate ${req.params.id} stopped — ${getActiveMandates().length} still running`);
  res.status(ok ? 200 : 404).json({ ok });
});

app.post('/api/agents/deactivate', (_req, res) => {
  stopAllMandates();
  pushLog('system', 'warning', 'all mandates stopped. On-chain revocation: disable the permission in MetaMask.');
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
    board: { matches: getBoard().matches.length, futures: getBoard().futures.length },
  });
});

// ---------- static frontend (single-service production) ----------
// In prod the built SPA is served from the same origin as the API, so the
// frontend's relative `/api` calls and the `/api/telemetry` SSE stream just
// work — no CORS, no proxy, no second service. Mounted only when a build
// exists, so local dev (vite on :3000) is unaffected.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  // SPA fallback: any non-API GET returns index.html for client-side routing
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(distDir, 'index.html'));
      return;
    }
    next();
  });
}

// ---------- boot ----------
async function startTunnel(): Promise<string | undefined> {
  if (process.env.WEBHOOK_PUBLIC_URL) return process.env.WEBHOOK_PUBLIC_URL;
  // Render (and most PaaS) expose the service's own public URL — use it directly
  // as the relayer webhook target so no cloudflared tunnel is needed in prod.
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
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
startPolymarketFeed();

app.listen(PORT, () => {
  pushLog('system', 'info', `PolyForge server on :${PORT} — market=${ctx.market ?? 'NOT DEPLOYED (betting disabled)'}`);
  pushLog('system', 'info', tunnelUrl ? `webhooks via ${tunnelUrl}` : 'webhooks disabled — falling back to relayer_getStatus polling');
  pushLog('system', 'info', process.env.VENICE_API_KEY ? 'Venice AI: live' : 'Venice AI: no API key — deterministic fallback engine');
});
