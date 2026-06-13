# Hackathon feedback — PolyForge build

Submitted for the **Best Feedback** track. Concrete friction we hit building on the MetaMask Smart Accounts Kit + 1Shot relayer + Venice, with repros and fixes, so the next builder loses less time.

## 1Shot relayer

1. **Reverts are masked as `data: "0x0"`.** When a `relayer_send7710Transaction` redemption reverts, `relayer_getStatus` returns `status: 500, message: "Reverted", data: "0x0"` — no reason string, no tx hash. We burned hours blind. We only found the cause by reconstructing `redeemDelegations` and replaying it via offline `eth_call` (`spike/04-replay-grant.ts`), which surfaced the real `CaveatEnforcer:invalid-call-type`. **Ask:** surface the enforcer revert reason (or the simulated revert data) in `relayer_getStatus`.

2. **Multi-execution bundles get batched → `invalid-call-type`.** A single `transactions[]` entry with two executions (fee + work) is executed as a BATCH, which the standard caveat enforcers reject. The skill mentions this for `Erc20TransferAmount` but the practical fix that worked for us was **one execution per `transactions[]` entry** (relayer redeems multi-single). Worth making explicit in the quickstart with a copy-paste example.

3. **`estimate` passes but `send` reverts.** Fee estimation succeeded (returned `requiredPaymentAmount`) while the actual send reverted at the relayer's stricter pre-broadcast simulation. The estimate-vs-execute gap is surprising; documenting what estimate does *not* catch would help.

4. **Concurrent redemptions from one EIP-7702 account conflict.** Two near-simultaneous redemptions from the same upgraded account fail (internal exec state). We had to serialize sends per account. A note in the docs would save others the race.

## MetaMask Smart Accounts Kit / 7715

5. **`requestExecutionPermissions` fails with "failed to batch upsert user storage for path 'gator_7715_permissions' / Failed to fetch"** when the wallet's profile-sync backend is unreachable (e.g. behind a region proxy / DNS manipulation). The grant rejects entirely. Fix that isn't discoverable: **disable Backup & sync** in MetaMask. **Ask:** let 7715 grants persist locally and degrade gracefully when sync is down; make the error actionable.

6. **EIP-7702-upgraded accounts are awkward to fund/Send in MetaMask UI.** Once an account is a smart account, the normal Send flow behaves unexpectedly; we funded the operator via faucet-to-address instead. Clarify expected UX for 7702 accounts.

7. **`@metamask/delegation-toolkit` → `@metamask/smart-accounts-kit` rename** — older examples/imports float around; a redirect note at the top of search-indexed docs would help.

## Venice

8. **402 with no obvious balance UX.** A freshly created API key returns `accessPermitted:false` and every model 402s until credits are added; the path from key → credits isn't obvious for a hackathon. A small free trial or a clear "add credits" CTA on the key page would lower the barrier. (The OpenAI-compatible API itself dropped into our stack with zero friction — that part was great.)

## Tooling / environment

9. **Node `fetch` ignores `HTTPS_PROXY` by default** (needs `NODE_USE_ENV_PROXY=1` / a dispatcher). Worth a one-liner in any guide that assumes outbound calls work behind a proxy.

10. **Sepolia public-RPC round-robin returns stale reads** for just-deployed contracts (`agentCount()` → `0x`). Pinning a single RPC fixed it; a caution in the deploy quickstart would help.
