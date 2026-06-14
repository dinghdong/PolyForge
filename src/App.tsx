/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Layers, 
  Lock, 
  Wallet, 
  ChevronRight, 
  Coins, 
  ShieldAlert, 
  TrendingUp, 
  HelpCircle,
  ShieldCheck,
  Github,
  Zap,
  Globe,
  CheckCircle2
} from 'lucide-react';

import { AgentConfig, StyleId } from './types';
import { THEME_PRESETS } from './styles';
import { api, type AgentNFAEntry } from './lib/api';
import AIBrainConfig from './components/AIBrainConfig';
import GuardrailConfig from './components/GuardrailConfig';
import ExecutionHubConfig from './components/ExecutionHubConfig';
import ActiveConsole from './components/ActiveConsole';
import MetaMaskModal from './components/MetaMaskModal';
import ExploreSignals from './components/ExploreSignals';

const DEFAULT_CONFIG: AgentConfig = {
  modelId: 'venice-llama3-70b',
  prompt: 'You are a statistics-driven World Cup analyst who focuses on underdog markets. You capitalize on historical tournament momentum patterns and algorithmic hedge signals.',
  knowledgeFileName: 'FIFA_Stats_WorldCup2026.csv',
  knowledgeRowCount: 14500,
  knowledgeSizeKb: 420,
  targetContract: '0x3F2b596c56Cc4DF6cc63EF295F4D7b438da0772A',
  maxSpendPerMatch: 50,
  maxDailyAllowance: 200,
  expiryDate: '2026-07-15', // End of 2026 World Cup
  onlyBuy: true,
  restrictSell: true,
  forbidWithdrawal: true,
  relayerMode: '1shot',
  gasAbstraction: true
};

export default function App() {
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [viewState, setViewState] = useState<'studio' | 'console'>('studio');
  const [isMMOpen, setIsMMOpen] = useState(false);
  const [activeTab, setActiveTab2] = useState<'explore' | 'launchpad' | 'vault'>('launchpad');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletError, setWalletError] = useState('');
  const styleId: StyleId = 'brutalist'; // Default style is Brutalist (Neo-Brutalist)
  const [activeCopiedAgent, setActiveCopiedAgent] = useState<string | null>(null);
  const [registry, setRegistry] = useState<AgentNFAEntry[]>([]);
  const [agentName, setAgentName] = useState('World Cup Underdog Hunter');
  const [mintCopyable, setMintCopyable] = useState(true); // public by default
  const [minting, setMinting] = useState(false);
  const [mintMsg, setMintMsg] = useState('');

  useEffect(() => {
    void api.getRegistry().then(setRegistry).catch(() => {});
  }, []);

  const handlePickAgent = (id: number) => {
    const a = registry.find((x) => x.tokenId === id);
    if (!a) {
      setConfig((p) => ({ ...p, agentId: undefined, agentLabel: undefined }));
      return;
    }
    setConfig((p) => ({ ...p, agentId: a.tokenId, agentLabel: a.label, modelId: a.model as AgentConfig['modelId'], prompt: a.prompt }));
    setAgentName(a.label);
  };

  const handleMint = async () => {
    setMinting(true);
    setMintMsg('');
    try {
      // the AgentNFA contract address comes from any agent's DID: did:nfa:chain:contract:tokenId
      const nfaAddress = registry[0]?.did?.split(':')[3] as `0x${string}` | undefined;
      if (nfaAddress) {
        // user-signed: your MetaMask sends the mint, you pay gas, you own the NFA
        setMintMsg('Confirm the mint in MetaMask…');
        const { mintAgentNFA } = await import('./lib/wallet');
        const r = await mintAgentNFA({ nfaAddress, label: agentName, model: config.modelId, prompt: config.prompt, copyable: mintCopyable });
        setMintMsg(`✓ Minted AgentNFA #${r.tokenId} — you signed & own it`);
        setConfig((p) => ({ ...p, agentId: r.tokenId, agentLabel: agentName }));
        // hand the off-chain prompt to the server + select it as the active brain
        await api.saveAgentConfig({ agentId: r.tokenId, modelId: config.modelId, prompt: config.prompt, maxSpendPerMatch: config.maxSpendPerMatch, maxDailyAllowance: config.maxDailyAllowance, expiryDate: config.expiryDate, copyTrade: false }).catch(() => {});
      } else {
        // fallback (no agents yet to derive the address): operator-funded mint
        const r = await api.mintAgent({ label: agentName, model: config.modelId, prompt: config.prompt, creator: walletAddress ?? undefined, copyable: mintCopyable });
        setMintMsg(`✓ Minted AgentNFA #${r.tokenId} (operator-funded)`);
        setConfig((p) => ({ ...p, agentId: r.tokenId, agentLabel: agentName }));
      }
      await api.getRegistry().then(setRegistry).catch(() => {});
    } catch (e) {
      const msg = (e as Error).message ?? 'mint failed';
      setMintMsg(/denied|rejected/i.test(msg) ? 'mint cancelled in wallet' : msg);
    } finally {
      setMinting(false);
      setTimeout(() => setMintMsg(''), 8000);
    }
  };

  // restore connection state on reload + follow account switches made in MetaMask
  useEffect(() => {
    let unsubscribe = () => {};
    void import('./lib/wallet').then(({ getConnectedAccount, onAccountsChanged }) => {
      void getConnectedAccount().then((addr) => addr && setWalletAddress(addr));
      unsubscribe = onAccountsChanged(setWalletAddress);
    });
    return () => unsubscribe();
  }, []);

  const handleConnectWallet = async () => {
    setWalletError('');
    try {
      const { connectWallet, switchAccount, ensureSepolia } = await import('./lib/wallet');
      // already connected → force the account picker instead of a silent no-op
      const address = walletAddress ? await switchAccount() : await connectWallet();
      await ensureSepolia();
      setWalletAddress(address);
    } catch (e) {
      setWalletError((e as Error).message);
      setTimeout(() => setWalletError(''), 6000);
    }
  };

  const handleDeployCopyAgent = (agentId: number, label: string, prompt: string, maxSpend: number) => {
    setActiveCopiedAgent(label);
    setConfig((prev) => ({
      ...prev,
      agentId,
      agentLabel: label,
      prompt,
      maxSpendPerMatch: maxSpend,
      maxDailyAllowance: maxSpend * 4,
    }));
    setActiveTab2('launchpad');
    setIsMMOpen(true);
  };

  const t = THEME_PRESETS[styleId];

  const headerClass = 'bg-white border-stone-950 text-stone-950 font-bold';
  const logoClass = 'border-2 border-stone-950 bg-[#fae155] text-stone-950';
  const badgeClass = 'bg-[#3b82f6] text-white border border-stone-950';

  const handleConfigChange = (updates: Partial<AgentConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  };

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const isDailyAllowanceInvalid = config.maxDailyAllowance < config.maxSpendPerMatch;

  return (
    <div id="polyforge-app" className={`min-h-screen transition-all duration-300 ${t.bodyBg} selection:bg-blue-500 selection:text-white pb-12 font-sans`}>
      
      {/* Dynamic Styled Header */}
      <header className={`border-b-2 sticky top-0 z-40 backdrop-blur-md ${headerClass}`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Logo */}
            <div className={`w-9 h-9 flex items-center justify-center p-[1px] font-black shrink-0 ${logoClass}`}>
              <span className="text-md">⚡</span>
            </div>
            <div>
              <h1 className="text-[13px] font-black tracking-tight font-display uppercase flex items-center gap-1.5 leading-none">
                PolyForge
                <span className={`text-[8px] tracking-wider font-semibold rounded px-1.5 py-0.5 uppercase ${badgeClass}`}>Beta</span>
              </h1>
              <p className="text-[9px] opacity-60 leading-none mt-1">No-Code Agent Launchpad · ERC-7715 × ERC-7710 × 1Shot × Venice</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-2 font-display">
            {(['explore', 'launchpad', 'vault'] as const).map((tab) => {
              const label = tab === 'explore' ? 'Explore Signals' : tab === 'launchpad' ? 'Workspace Studio' : 'Active Ledger';
              const isActive = activeTab === tab;
              let btnClass = '';

              if (isActive) {
                btnClass = 'bg-[#3b82f6] text-white border-2 border-stone-950 shadow-[2px_2px_0px_#000]';
              } else {
                btnClass = 'opacity-70 hover:opacity-100 hover:bg-current/5';
              }

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab2(tab)}
                  className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${btnClass} rounded-none`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Wallet */}
          <div className="flex items-center gap-2">
            {walletError && (
              <span className="hidden md:block text-[9px] font-mono text-rose-600 max-w-[220px] truncate" title={walletError}>
                {walletError}
              </span>
            )}
            <button
              type="button"
              onClick={handleConnectWallet}
              className={`flex items-center gap-2 px-3.5 py-1.5 transition-all text-xs font-mono font-bold cursor-pointer border-2 shadow-[2px_2px_0px_#000] rounded-none border-stone-950 ${
                walletAddress ? 'bg-white text-stone-950' : 'bg-[#fae155] hover:bg-[#ebd01c] text-stone-950'
              }`}
              title={walletAddress ? 'Click to switch account' : 'Connect MetaMask (Sepolia)'}
            >
              <Wallet className="w-3.5 h-3.5 text-blue-500" />
              <span>{walletAddress ? formatAddress(walletAddress) : 'Connect Wallet'}</span>
              <span
                className={`text-[8.5px] px-1.5 py-0.5 rounded font-bold uppercase border border-stone-950 ${
                  walletAddress ? 'bg-[#a7f3d0] text-stone-950' : 'bg-stone-950 text-white'
                }`}
              >
                {walletAddress ? 'Sepolia' : '🦊'}
              </span>
            </button>
          </div>
        </div>
      </header>      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-6">
        
        {activeTab === 'explore' ? (
          <ExploreSignals 
            styleId={styleId} 
            onDeployCopyAgent={handleDeployCopyAgent} 
            activeCopiedAgent={activeCopiedAgent} 
          />
        ) : activeTab === 'launchpad' ? (
          <div className="space-y-6">
            
            {/* Top row description & Beautiful Theme style selector */}
            <div className="p-4 md:p-5 border-2 transition-all duration-300 rounded-none bg-white border-stone-950 shadow-[4px_4px_0px_#000]">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 pb-4 border-b border-current/15">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] opacity-50 uppercase font-mono tracking-widest font-bold">
                    <span>Overview Studio Workspace</span>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-blue-500 font-bold">Launch Selection Platform</span>
                  </div>
                  <h2 className={`text-md md:text-lg font-black tracking-tight uppercase leading-tight ${t.titleText}`}>
                    Polymarket Automated Prediction Agent Builder
                  </h2>
                  <p className="text-[11px] opacity-65 max-w-2xl leading-relaxed">
                    Configure high-speed automated decision strategies on sports match events. Build Venice AI instructions, set MetaMask vault margins via ERC-7715, and execute parallel gasless nonces.
                  </p>
                </div>

                {/* Micro Stats Info */}
                <div className="hidden md:flex items-center gap-2 font-mono">
                  <div className="px-3 py-1.5 border-2 border-stone-950 bg-white text-stone-950 rounded-none text-right leading-none shadow-[2px_2px_0px_#000]">
                    <span className="text-[8.5px] opacity-50 block font-semibold uppercase">Security Limit Caps</span>
                    <span className="text-[11px] font-black text-rose-600 flex items-center justify-end gap-1 mt-1">
                      <Lock className="w-3 h-3" /> ERC-7715 Active
                    </span>
                  </div>
                  <div className="px-3 py-1.5 border-2 border-stone-950 bg-white text-stone-950 rounded-none text-right leading-none shadow-[2px_2px_0px_#000]">
                    <span className="text-[8.5px] opacity-50 block font-semibold uppercase">Broadcasting latency</span>
                    <span className="text-[11px] font-black text-purple-600 flex items-center justify-end gap-1 mt-1">
                      ⚡ 1Shot Relayer
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ───── STEP 1 · Create your AI Agent (brain + identity + policies = the NFA) ───── */}
            <div className="flex items-center gap-2 pt-1">
              <span className="w-6 h-6 flex items-center justify-center font-black text-xs border-2 border-stone-950 bg-[#fae155] rounded-none shadow-[2px_2px_0px_#000]">1</span>
              <h3 className="text-sm font-black uppercase tracking-tight font-display">Create your AI Agent</h3>
              <span className="text-[10px] opacity-50 font-mono hidden sm:inline">brain + identity + policies → an AgentNFA</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {/* brain */}
              <AIBrainConfig config={config} onChange={handleConfigChange} styleId={styleId} />

              {/* identity + policies */}
              <div className={`${t.cardBg} flex flex-col gap-3`}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 border-2 border-stone-950 bg-[#fae155]">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className={`text-xs font-bold uppercase tracking-wider ${t.titleText}`}>Identity & Policies</h3>
                    <p className="text-[10px] opacity-60">ERC-721 AgentNFA · on-chain DID</p>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-60 block mb-1 font-mono">Agent</label>
                  <select
                    value={config.agentId ?? ''}
                    onChange={(e) => handlePickAgent(e.target.value ? Number(e.target.value) : 0)}
                    className="w-full font-mono text-xs border-2 border-stone-950 rounded-none px-2.5 py-2 bg-white"
                  >
                    <option value="">✚ New agent — configure the brain ←</option>
                    {registry.map((a) => (
                      <option key={a.tokenId} value={a.tokenId}>
                        ▶ Run NFA #{a.tokenId} · {a.label}{a.copyable ? '' : ' 🔒'} · {a.activity.positions} bets
                      </option>
                    ))}
                  </select>
                </div>

                {config.agentId ? (
                  <div className="flex items-start gap-2 text-[11px] font-mono bg-[#a7f3d0] border-2 border-stone-950 rounded-none px-3 py-2">
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Running <strong>AgentNFA #{config.agentId}</strong> — brain loaded. Set the mandate in Step 2, then{' '}
                      <strong>Confirm Launch ↓</strong>. Already on-chain — no minting.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2.5 border-t border-current/15 pt-2.5">
                    <div>
                      <label className="text-[9px] font-bold uppercase tracking-wider opacity-50 block mb-1 font-mono">Name</label>
                      <input
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        className="w-full font-mono text-xs border-2 border-stone-950 rounded-none px-2.5 py-2 bg-white"
                        placeholder="World Cup Underdog Hunter"
                      />
                    </div>

                    {/* Policies (creation-time, written to the NFA) */}
                    <div className="space-y-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider opacity-50 block font-mono">Agent Policies</span>
                      {/* gating — REAL */}
                      <button
                        type="button"
                        onClick={() => setMintCopyable((v) => !v)}
                        className="w-full flex items-center justify-between gap-2 border-2 border-stone-950 rounded-none px-2.5 py-2 bg-white text-[10px] font-mono cursor-pointer"
                        title="Public agents can be copied by anyone; private agents are gated to the owner on-chain"
                      >
                        <span className="flex items-center gap-1.5">
                          {mintCopyable ? <Globe className="w-3.5 h-3.5 text-blue-600" /> : <Lock className="w-3.5 h-3.5 text-rose-600" />}
                          Gated execution: <strong>{mintCopyable ? 'Public (copyable)' : 'Private (owner-only)'}</strong>
                        </span>
                        <span className={`px-1.5 py-0.5 border border-stone-950 font-bold uppercase ${mintCopyable ? 'bg-[#a7f3d0]' : 'bg-rose-200'}`}>
                          {mintCopyable ? 'on-chain' : 'on-chain'}
                        </span>
                      </button>
                      {/* fees / restrictions — ROADMAP (disabled, honestly labeled) */}
                      <div className="flex items-center justify-between gap-2 border-2 border-dashed border-current/30 rounded-none px-2.5 py-2 text-[10px] font-mono opacity-55">
                        <span className="flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> Copy / performance fee</span>
                        <span className="px-1.5 py-0.5 border border-current/30 font-bold uppercase">roadmap</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 border-2 border-dashed border-current/30 rounded-none px-2.5 py-2 text-[10px] font-mono opacity-55">
                        <span className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5" /> Allowlisted markets / max drawdown</span>
                        <span className="px-1.5 py-0.5 border border-current/30 font-bold uppercase">roadmap</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleMint}
                        disabled={minting}
                        title="Mint this brain as an AgentNFA — you sign in MetaMask and own it. Optional; you can also Confirm Launch without minting."
                        className="flex-1 py-2 px-4 text-[11px] font-bold uppercase font-mono cursor-pointer bg-blue-300 hover:bg-blue-400 border-2 border-stone-950 rounded-none shadow-[2px_2px_0px_#000] disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        {minting ? 'Minting…' : '🦊 Mint as NFA (you sign)'}
                      </button>
                    </div>
                  </div>
                )}
                {mintMsg && (
                  <span className={`text-[10px] font-mono ${mintMsg.startsWith('✓') ? 'text-emerald-600' : 'text-rose-600'}`}>{mintMsg}</span>
                )}
              </div>
            </div>

            {/* ───── STEP 2 · Launch a Mandate (this run's guardrails + execution) ───── */}
            <div className="flex items-center gap-2 pt-2">
              <span className="w-6 h-6 flex items-center justify-center font-black text-xs border-2 border-stone-950 bg-[#fae155] rounded-none shadow-[2px_2px_0px_#000]">2</span>
              <h3 className="text-sm font-black uppercase tracking-tight font-display">Launch a Mandate</h3>
              <span className="text-[10px] opacity-50 font-mono hidden sm:inline">your guardrails + execution for this run</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              <GuardrailConfig config={config} onChange={handleConfigChange} styleId={styleId} />
              <ExecutionHubConfig config={config} onChange={handleConfigChange} styleId={styleId} />
            </div>

            {/* Config Summary CTA */}
            <div className="bg-white border-2 border-stone-950 shadow-[4px_4px_0px_#000] rounded-none p-5 transition-all duration-300">
              
              <div className="flex items-center justify-between border-b pb-3 border-current/15 mb-3.5">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-500" />
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${t.titleText}`}>
                    [4] Cryptographic Policy Digest Summary
                  </h3>
                </div>
                <span className="text-[10px] opacity-40 font-mono">Security Checksum Pass</span>
              </div>

              {/* Policy summary layout */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
                
                <div className="space-y-1">
                  <div className="flex items-center gap-1 font-bold">
                    <span className="w-4 h-4 rounded-none flex items-center justify-center font-bold text-[9px] border-2 bg-blue-300 text-stone-950 border-stone-950">1</span>
                    <span className="font-display uppercase tracking-tight">Logical Brain Consensus</span>
                  </div>
                  <p className="text-[11px] opacity-75 leading-relaxed font-sans pl-5">
                    Utilizing <strong className="font-mono">{config.modelId.includes('llama3') ? 'Llama-3-70B' : config.modelId.includes('r1') ? 'DeepSeek-R1' : 'Hermes-3'}</strong> LLM. Training CSV data sheet linked: <strong className="font-mono">{config.knowledgeFileName}</strong> ({config.knowledgeRowCount.toLocaleString()} rows).
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1 font-bold">
                    <span className="w-4 h-4 rounded-none flex items-center justify-center font-bold text-[9px] border-2 bg-green-300 text-stone-950 border-stone-950">2</span>
                    <span className="font-display uppercase tracking-tight">ERC-7715 Limit Bounding</span>
                  </div>
                  <p className="text-[11px] opacity-75 leading-relaxed font-sans pl-5">
                    Allowed router: <strong className="font-mono">{config.targetContract.includes('V2') ? 'Router V2' : 'CTF Exchange V1'}</strong>. Strict caps limit bets to <strong>${config.maxSpendPerMatch} USDC</strong> per game and <strong className="font-mono">${config.maxDailyAllowance} USDC</strong> total daily cap. Expiry: <strong className="font-mono">{config.expiryDate}</strong>.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1 font-bold">
                    <span className="w-4 h-4 rounded-none flex items-center justify-center font-bold text-[9px] border-2 bg-purple-300 text-stone-950 border-stone-950">3</span>
                    <span className="font-display uppercase tracking-tight">Gasless 1Shot Relayer</span>
                  </div>
                  <p className="text-[11px] opacity-75 leading-relaxed font-sans pl-5">
                    Agent A redelegates a narrowed ERC-7710 slice per bet; the 1Shot relayer redeems the chain on Sepolia. Gas is {config.gasAbstraction ? <strong className="text-purple-600">relayer-sponsored (user holds 0 ETH)</strong> : <strong className="opacity-50">paid by wallet in ETH</strong>}, status lands via Ed25519-signed webhooks.
                  </p>
                </div>

              </div>

              {/* Deploy Trigger Section */}
              <div className="pt-4 border-t border-current/15 mt-4 flex flex-col items-center justify-center gap-3">
                {isDailyAllowanceInvalid ? (
                  <div className="flex items-center gap-2 text-rose-600 bg-rose-500/5 border border-rose-500/30 px-3.5 py-2.5 text-xs font-semibold w-full max-w-lg">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <p className="leading-tight text-[11px]">
                      <strong>Rule Violation:</strong> Your daily allowance cap cannot be smaller than your max match spend requirement. Please adjust margin constraints.
                    </p>
                  </div>
                ) : null}

                {/* Confirm Sign */}
                <button
                  type="button"
                  disabled={isDailyAllowanceInvalid}
                  onClick={() => setIsMMOpen(true)}
                  className={`w-full max-w-md py-3 font-semibold uppercase tracking-wider text-[11px] transition-all duration-300 cursor-pointer rounded-none font-mono border-2 ${
                    isDailyAllowanceInvalid
                      ? "bg-zinc-200 text-zinc-400 border-zinc-300 cursor-not-allowed shadow-none"
                      : "bg-[#fae155] border-3 border-stone-950 text-stone-950 hover:bg-[#ebd01c] shadow-[4px_4px_0px_#000]"
                  }`}
                >
                  Confirm Cryptographic Launch (Approve Session Key)
                </button>
                
                <p className="text-[9.5px] opacity-40 text-center max-w-xs">
                  Triggers safe MetaMask sign proposal. Keys are strictly code bounded with absolute custody retention.
                </p>
              </div>

            </div>

          </div>
        ) : (
          /* Active Telemetry Simulation State */
          <ActiveConsole
            config={config}
            onBackToStudio={() => {
              setActiveTab2('launchpad');
            }}
            styleId={styleId}
            walletAddress={walletAddress}
          />
        )}

      </main>

      {/* Modern crisp footer */}
      <footer className="max-w-7xl mx-auto px-4 md:px-6 mt-16 pt-8 border-t border-current/10 text-center text-[11px] opacity-50 space-y-1 bg-transparent">
        <p className="font-display font-semibold uppercase tracking-wider">⚡ PolyForge Workspace • Secured No-Code Automated Margins Studio</p>
        <p className="font-mono text-[9px]">
          Ethereum Sepolia (11155111) • gas: 1Shot relayer-sponsored, fees in USDC • AI: Venice (privacy-first, no logging)
        </p>
      </footer>

      {/* MetaMask modal inclusion */}
      <MetaMaskModal
        isOpen={isMMOpen}
        onClose={() => setIsMMOpen(false)}
        onApprove={() => {
          setIsMMOpen(false);
          setActiveTab2('vault');
        }}
        config={config}
        styleId={styleId}
        copyTrade={activeCopiedAgent !== null}
      />
    </div>
  );
}
