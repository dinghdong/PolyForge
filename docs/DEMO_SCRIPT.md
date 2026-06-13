# PolyForge — demo video script (~3 min)

Goal: show the MetaMask Smart Accounts Kit in the **main flow**, 1Shot gasless execution, A2A redelegation, and concurrent agents — all with real on-chain results. Judges said they won't reward peripheral integrations, so every claim here is shown happening.

## Pre-flight checklist (do before recording)

- [ ] `npm run server` is up (`[system] Venice AI: live` or `fallback`; `webhooks via …trycloudflare.com`).
- [ ] `npm run dev` is up; open **http://localhost:3000**, hard-refresh (⌘⇧R).
- [ ] **Fund the wallets** so bets confirm:
  - script user (`SPIKE_USER_PK`) holds ~20 Sepolia USDC (Circle faucet) for headless.
  - your MetaMask account (browser flow) holds Sepolia USDC + a little ETH.
  - agentA operator holds ~0.05 Sepolia ETH (operator gas).
- [ ] For a clean MetaMask popup: **Settings → Security & privacy → Security alerts OFF** (or verify the contract). Otherwise the grant shows a red "Review alert".
- [ ] Have a Sepolia Etherscan tab ready to show a confirmed tx.
- [ ] Pick 1 well-known World Cup match on the board to inject.

## Shot list

**[0:00–0:20] Hook — the pitch**
- Screen: PolyForge Studio (Workspace tab).
- VO: "PolyForge is a no-code launchpad for AI prediction-market agents. The agent is an NFT you own. You grant it a budget with one signature — then it trades real Polymarket markets autonomously, gasless, and you can revoke it anytime."

**[0:20–0:45] Step 1 — create the Agent (NFA)**
- Screen: Step 1 panel. Pick a model, type a persona prompt. Toggle **Public/Private**. Click **🦊 Mint as NFA (you sign)**.
- Show the **MetaMask popup** → "You receive #N" (the AgentNFA). Confirm.
- VO: "First I create the agent's brain and mint it as an ERC-721 with an on-chain DID. I sign — I own it. I can make it public for others to copy, or private and gated to me."
- Cut to Explore tab for 2s: the agent now appears in the on-chain registry with its DID.

**[0:45–1:25] Step 2 — grant the Mandate (the Kit in the main flow)**
- Screen: Step 2 — set per-match cap, daily allowance, expiry (= World Cup final). Click **Confirm Launch → Sign with MetaMask (ERC-7715)**.
- Show the **Advanced Permissions popup**: delegate = the agent, USDC, periodic allowance, expiry. Confirm.
- VO: "Now the key moment: with one ERC-7715 Advanced Permission, I delegate a *scoped, expiring* USDC budget to the agent — using the MetaMask Smart Accounts Kit. This is the only popup. From here, hands off the keyboard."

**[1:25–2:10] Autonomous execution — gasless, on-chain**
- Screen: Active Ledger. Show the live Polymarket board. Click ⚡ to inject a dislocation on one market.
- Watch telemetry: `venice` decision → `guardrail` ERC-7715 check OK → `relayer` task submitted → `webhook ✓ Ed25519-verified` → position turns **OPEN**.
- Click the position's tx ↗ → Sepolia Etherscan: show USDC moved from the user account, **gas paid by the relayer**.
- VO: "The agent sees a real price move, decides on Venice, the on-chain caveat passes, and the 1Shot relayer redeems the delegation — gas paid in USDC. Look at the stats: User Gas Paid, zero ETH. And the fee comes out of the budget I authorized — nothing more."

**[2:10–2:40] A2A + concurrency — the differentiators**
- Screen: Explore → pick a public agent → **Copy this Agent** (set follower cap) → sign. Back to Active Ledger.
- Show **two agents in Running Agents**, both reacting to the same market with *independent* decisions (e.g. opposite sides). Click one card → the panel filters to just that agent's positions + telemetry.
- VO: "Copy turns into a real ERC-7710 redelegation — the follower gets a *narrower* slice of authority, three hops deep. And I can run many agents at once, each with its own budget. Click one to focus its activity."

**[2:40–3:00] Control + close**
- Screen: click an agent's **Stop**, then mention MetaMask revoke.
- VO: "I keep absolute control — stop any agent, or revoke the permission in MetaMask and the whole delegation chain dies. PolyForge: agents you own, permissions you scope, execution you never pay gas for. Thanks for watching."

## Capture tips
- Record at 1280×800+; zoom the MetaMask popups (they're the proof shots).
- If a real reprice doesn't fire during recording, use ⚡ inject (it's labeled "demo Δ" — honest).
- Keep one Etherscan confirmation visible — it's the single most convincing frame.
- If the browser-grant bet is slow, the headless agents (Stop All not pressed) keep the telemetry alive.
