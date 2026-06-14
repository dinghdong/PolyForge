# Deploying PolyForge (Render, single service)

One Node web service runs the Express backend, which **also serves the built
React SPA**. The frontend's relative `/api` calls and the `/api/telemetry` SSE
stream are same-origin — no CORS, no proxy, no second service.

Render auto-provides `PORT` and `RENDER_EXTERNAL_URL` (used as the 1Shot relayer
webhook target, so no cloudflared tunnel is needed in production).

## Prerequisites

- The repo on GitHub (this one), including `render.yaml`.
- A free [Render](https://render.com) account.
- The 4 secrets (testnet only — never reuse real keys):
  `SPIKE_USER_PK`, `SPIKE_AGENT_A_PK`, `SPIKE_AGENT_B_PK`, `VENICE_API_KEY`.

## Deploy

1. **Push** the repo (with `render.yaml`) to GitHub.
2. Render dashboard → **New → Blueprint** → connect this repo. Render reads
   `render.yaml` and proposes a `polyforge` web service.
3. Render will prompt for the 4 `sync: false` secrets. Paste them in
   (Dashboard → the service → **Environment**). The non-secret config
   (contract addresses, RPC, `WEBHOOK_TUNNEL=0`) is already in `render.yaml`.
4. **Apply / Create**. First build+deploy takes ~3–5 min
   (`npm install && npm run build`, then `npm run start`).
5. Open the service URL (e.g. `https://polyforge.onrender.com`).

## Verify

- `GET /api/health` → `{ ok: true, chainId: 11155111, market: 0x…, veniceKey: true }`
- The home page loads the live Polymarket board within the first poll.
- Boot log shows `webhooks via https://<your>.onrender.com` (the auto external URL).

## Funding (so bets actually execute)

Bets are real USDC transfers on Sepolia, so the **spending account needs USDC**:

- **Browser / self-custody mode:** each user grants from their MetaMask. The
  ERC-7715 grant delegates from their *smart account* (a separate address from
  the EOA) — that smart account must hold Sepolia USDC + the EOA needs a little
  ETH. Top up via [faucet.circle.com](https://faucet.circle.com).
- **Headless / simulation mode:** spends from the server's `SPIKE_USER_PK`
  smart account; fund that address with Sepolia USDC.
- `SPIKE_AGENT_A_PK` (operator) needs a little Sepolia ETH for `recordBet` /
  mint gas.

## Notes

- **Free plan sleeps** after ~15 min idle (cold start ~50 s on next hit).
  Upgrade the plan or hit it with an uptime pinger to avoid this.
- **Redeploy:** `git push` to the connected branch — `autoDeploy` rebuilds.
- **Open API (by design for the demo):** `/api/markets/inject`,
  `/api/agents/activate` (headless), and `/api/agents/mint` are unauthenticated.
  This is fine for a testnet demo with small funds — do **not** put
  mainnet/real keys on this deployment.
