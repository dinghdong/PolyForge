# PolyForge — source facts for the pitch

PolyForge is a no-code launchpad for self-custodial AI prediction-market agents. Built for the MetaMask Smart Accounts Kit × 1Shot API × Venice AI Dev Cook Off.

## The problem
AI trading bots are black boxes you hand your private keys to. That means custody risk (the bot can drain you) and approval fatigue (you sign every action). Autonomy and safety have been a trade-off.

## The core idea: Agent ≠ Mandate
- **Agent (the brain):** a reusable strategy minted as an `AgentNFA` — ERC-721 + an on-chain DID (`did:nfa:11155111:0xb0bf71bd…:1`). You own it. It can be public (copyable) or private (gated to the owner, enforced on-chain).
- **Mandate (the run):** a user's guardrails (per-match cap, daily allowance, expiry) + execution, bound to an Agent by an ERC-7715 Advanced Permission. The agent never holds your keys.

## One signature → autonomous
The user grants a scoped, expiring USDC budget with a single MetaMask ERC-7715 signature — e.g. 50 USDC/day, expiring at the World Cup final. After that one popup, the agent runs hands-off: it reads real Polymarket prices (Gamma API) and bets on a Sepolia market on its own.

## Gasless via 1Shot
The 1Shot permissionless relayer redeems the delegations and takes its fee in USDC. The user holds **0 ETH**. Includes EIP-7702 EOA→smart-account upgrade through the relayer and Ed25519-verified webhooks (not polling).

## A2A coordination
Copying a star agent is a real **ERC-7710 redelegation**: user → star agent → follower agent → relayer, each hop narrowing the caveats (smaller cap, shorter expiry). Three hops deep, proven on-chain.

## Concurrent + bounded
Multiple agents run at once, each with its own budget. Because the caveats are enforced on-chain, even a fully hijacked agent brain cannot move USDC past the limit the user signed — an over-budget bundle reverts with `ERC20TransferAmountEnforcer:allowance-exceeded`.

## Real, on-chain (Sepolia) — not a mockup
- AgentNFA: 0xB0Bf71Bd0AA1c73e649b0f482229d135B95107d0
- MockPredictionMarket (mirrors Polymarket prices): 0xF1EE83A565d4F4007028de3C5E29b01FfAD64476
- 2-hop redelegation + EIP-7702 + webhooks: tx 0x72a9…7b5a
- Real MetaMask 7715 grant → gasless bet: tx 0x6684…7a23
- Two concurrent agents, opposite bets, both confirmed: tx 0x81df…f74c, 0xe4d3…f7ff
- Real Polymarket prices via the Gamma API drive the odds.

## Tagline
Agents you own. Permissions you scope. Execution you never pay gas for. Grant once. Revoke anytime.
