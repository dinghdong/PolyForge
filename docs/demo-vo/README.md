# Demo voiceover clips (English, AI-synthesized — no narration needed)

Generated with edge-tts (free, Microsoft `en-US-AriaNeural`, rate −4%). Total ~1:51.
`00-test.mp3` is just a voice sample. Want a different voice (e.g. male `en-US-GuyNeural`) or pace? Ask and I'll regenerate.

## How to record (two ways)

**Easiest — play while screen-recording (no editing):**
Start your screen recorder with system audio on (QuickTime ⌘⇧5 captures mic; for system audio use OBS, or play the clips through speakers). For each clip: hit play, do the action below, then play the next when ready. On-chain waits happen silently between clips.

**Cleaner — overlay in CapCut / iMovie:**
Record the screen silently, then drop each mp3 onto the timeline at the matching moment. Add auto-captions if you want subtitles too.

## Clip → what to show

| Clip | ~dur | Do this on screen |
|---|---|---|
| **1-hook** | 17s | Workspace Studio overview; slowly pan the 3 tabs |
| **2-mint** | 15s | Step 1: pick model + prompt, toggle Public/Private, click **🦊 Mint as NFA** → MetaMask popup → Confirm. Cut to Explore: the NFA with its DID |
| **3-grant** | 19s | Step 2: set per-match / daily / expiry → **Confirm Launch → Sign with MetaMask (ERC-7715)** → Advanced Permissions popup → Confirm |
| **4-execute** | 22s | Active Ledger: ⚡ inject a market; watch telemetry venice→guardrail→relayer→webhook ✓; position → OPEN; click tx ↗ to Etherscan (USDC moved, gas 0); point at "User Gas Paid: 0 ETH" |
| **5-a2a** | 18s | Explore → Copy a public agent → sign; back to Active Ledger: two agents in Running Agents; click one card → panel filters to it |
| **6-close** | 20s | Click an agent's Stop; mention MetaMask revoke; end on the logo |

Total speech ~1:51; with the on-chain waits the final video lands ~2:30–3:00.

## Pre-flight (so the on-chain shots actually fire)
- script user wallet ~20 Sepolia USDC; your MetaMask wallet USDC + a little ETH; agentA ~0.05 ETH
- MetaMask → Security & privacy → Security alerts OFF (clean popup)
- the PolyForge server + frontend running; ask me to inject events on cue in the background
