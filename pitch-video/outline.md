# Video Outline

> **主题**：`<待定，Checkpoint Plan 选>` — neo-brutalist 候选(配 app 风格:粗黑边 / #fae155 黄 / mono 字)
> **总时长**：约 1 分 30 秒(英文口播 ~225 词 ÷ ~2.5 词/秒)
> **章节数**：5 章 / 14 步

---

## 1. coldopen — The problem（2 steps · ~13s）

**信息池**：
- 论点：AI 交易 bot = 黑盒,你把私钥交给它 —— 来源 article §The problem
- 风险二元:custody risk(被掏空) + approval fatigue(每次都签) —— 来源 article §The problem
- 反题:PolyForge 的 agent 从不碰你的私钥 —— 来源 article §core idea

**开发计划**：
- step 1 (~7s) — hero:"hand it your private keys and hope" —— 黑盒 + 钥匙意象
- step 2 (~6s) — 反转:"never touches your keys" 立住 PolyForge 立场

口播节选：
> An AI trading bot usually means one thing. You hand it your private keys and hope. … Your agent never touches your keys.

---

## 2. agent-mandate — Agent ≠ Mandate（3 steps · ~17s）

**信息池**：
- 概念:Agent = 大脑,铸成 AgentNFA(ERC-721 + 链上 DID),你拥有 —— 来源 article §core idea
- 概念:Mandate = 护栏 + 执行,由 ERC-7715 授权绑定到 Agent —— 来源 article §core idea
- 元数据:DID 形如 did:nfa:11155111:0xb0bf71bd…:1 —— 来源 article §core idea

**开发计划**：
- step 1 (~5s) — 抛出对立:"agent" 和 "mandate" 是两件事
- step 2 (~6s) — Agent = 大脑/NFT,你拥有(可挂 DID 角标)
- step 3 (~6s) — Mandate = 一次签名的链上 scoped 权限

口播节选：
> The agent is the brain — a strategy you mint as an NFT. You own it. A mandate is how you run it. A scoped, on-chain permission, signed once.

---

## 3. one-signature — Grant once, gasless（3 steps · ~22s）

**信息池**：
- 参数:一次 MetaMask ERC-7715 签名,50 USDC/天,世界杯决赛日过期 —— 来源 article §one signature
- 行为:签完 hands-off,读真实 Polymarket 价格自动下注 —— 来源 article §one signature
- 机制:1Shot relayer 代付,fee 用 USDC,用户持 0 ETH —— 来源 article §gasless

**开发计划**：
- step 1 (~7s) — 一次签名授予预算(额度 50/天 + 过期日做数据浮层)
- step 2 (~7s) — hands-off 自动下注,无更多弹窗
- step 3 (~8s) — gasless:relayer 执行,USDC 付费,0 ETH(强调 0 ETH)

口播节选：
> You grant a budget with a single MetaMask signature. … Then it's hands-off. … And it's gasless. The 1Shot relayer does the execution. You pay fees in USDC and hold zero ETH.

---

## 4. a2a-concurrent — Copy, concurrency, bounded（3 steps · ~23s）

**信息池**：
- 机制:copy = 真实 ERC-7710 再委托,user→star→follower→relayer,逐跳收窄,3 跳 —— 来源 article §A2A
- 并发:多个 agent 同时跑,各自独立预算 —— 来源 article §concurrent
- 安全:被劫持的 agent 也越不过链上额度,over-budget 触发 allowance-exceeded revert —— 来源 article §concurrent

**开发计划**：
- step 1 (~8s) — copy → ERC-7710 再委托链,权限逐跳变窄(委托链可视化)
- step 2 (~6s) — 多个 agent 并排同时跑,各自预算
- step 3 (~9s) — 链上 caveat 兜底:劫持也越不过你签的额度

口播节选：
> Copy it. That's a real ERC-7710 redelegation — a narrower slice of authority, passed agent to agent. Run as many as you want… even a hijacked agent can't move a cent past the limit you signed.

---

## 5. close — Real on-chain + tagline（3 steps · ~15s）

**信息池**：
- 证据:真合约 + 真委托 + 真下注,live on Sepolia(可挂合约地址/tx 角标) —— 来源 article §Real on-chain
- 标语:Agents you own. Permissions you scope. Execution you never pay gas for. —— 来源 article §Tagline
- 收尾:Grant once. Revoke anytime. —— 来源 article §Tagline

**开发计划**：
- step 1 (~5s) — "not a mockup":真合约/委托/下注 live on Sepolia(挂 tx 角标)
- step 2 (~6s) — 三句价值主张(逐句揭示)
- step 3 (~4s) — logo + "Grant once. Revoke anytime."

口播节选：
> This isn't a mockup. Real contracts, real delegations, real bets — live on Sepolia. … PolyForge. Grant once. Revoke anytime.

---

## 素材清单

### 1. coldopen
- ✓ 纯排版/CSS 可做(钥匙、黑盒用图标或纯 CSS),无需外部图

### 2. agent-mandate
- ✓ AgentNFA 卡片 + DID 字符串(article 已有),纯排版

### 3. one-signature
- ✓ MetaMask 签名意象(纯 CSS/图标)+ 额度数据浮层
- ⚠️(可选)真实 7715 弹窗截图 —— 录 demo 时可顺手截,锦上添花

### 4. a2a-concurrent
- ✓ 委托链 user→A→B→relayer(纯 CSS/SVG 节点图)

### 5. close
- ✓ 合约地址/tx hash(article 已有)+ PolyForge logo(app 里的 ⚡ + 字标)
