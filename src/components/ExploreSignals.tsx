/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import { 
  TrendingUp, 
  User, 
  Cpu, 
  Coins, 
  Check, 
  Zap, 
  ShieldCheck, 
  UserCheck, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  Search,
  Users,
  Copy,
  LineChart
} from 'lucide-react';
import { StyleId } from '../types';
import { THEME_PRESETS } from '../styles';

interface ExploreSignalsProps {
  styleId: StyleId;
  onDeployCopyAgent: (agentName: string, prompt: string, maxSpend: number) => void;
  activeCopiedAgent: string | null;
}

interface StarAgent {
  id: string;
  name: string;
  avatar: string;
  author: string;
  winRate: number;
  totalVolume: number;
  roi: number;
  model: string;
  desc: string;
  chartPath: string;
  color: string;
}

const STAR_AGENTS: StarAgent[] = [
  {
    id: 'agent-1',
    name: "⚽ Octopus Underdog",
    avatar: "🐙",
    author: "0xPaul...8912",
    winRate: 84.5,
    totalVolume: 42500,
    roi: 184.2,
    model: "DeepSeek R1 (70B)",
    desc: "An underdog-seeking statistical oracle. Focuses on premium sports events (World Cup, UEFA) where global crowds over-hedge, locking arbitrage margins on explosive multipliers.",
    chartPath: "M 0 45 L 30 38 L 60 40 L 90 20 L 120 22 L 150 5 L 180 8 L 210 2 Q 230 0 240 1",
    color: "#39ff14"
  },
  {
    id: 'agent-2',
    name: "⚡ Speed Arb Whale",
    avatar: "🐋",
    author: "0xArb...fc99",
    winRate: 91.8,
    totalVolume: 128900,
    roi: 312.5,
    model: "Hermes-3-Llama-8B",
    desc: "Ultra-low-latency arbitrage master. Constantly analyzes price spikes between Polymarket outcomes and global bookmakers to trigger safe micro-hedges with 1Shot Relayer parallel nonces.",
    chartPath: "M 0 49 L 30 45 L 60 30 L 90 32 L 120 15 L 150 18 L 180 5 L 210 1 Q 230 0 240 0.5",
    color: "#db2777"
  },
  {
    id: 'agent-3',
    name: "🧠 Sentiment Alpha",
    avatar: "🧠",
    author: "0xSent...cd31",
    winRate: 78.4,
    totalVolume: 18400,
    roi: 114.8,
    model: "Llama-3-70B Stable",
    desc: "Continuous NLP social crawler. Analyzes Telegram team channels, coach interview transcripts, and players' health reports from injury sheets to calculate dynamic sentiment-backed odds signals.",
    chartPath: "M 0 48 L 30 46 L 60 35 L 90 38 L 120 28 L 150 25 L 180 20 L 210 15 Q 230 10 240 8",
    color: "#3b82f6"
  }
];

export default function ExploreSignals({ styleId, onDeployCopyAgent, activeCopiedAgent }: ExploreSignalsProps) {
  const t = THEME_PRESETS[styleId];
  const [selectedAgentId, setSelectedAgentId] = useState<string>('agent-1');
  const [allocationLimit, setAllocationLimit] = useState<number>(30);
  const [copiedState, setCopiedState] = useState<string | null>(null);

  const activeAgent = STAR_AGENTS.find(a => a.id === selectedAgentId) || STAR_AGENTS[0];

  const handleCopyTrigger = () => {
    onDeployCopyAgent(
      activeAgent.name,
      `[A2A Follower Agent] Automatically clones signals issued from ${activeAgent.name} (Win Rate: ${activeAgent.winRate}%, Model: ${activeAgent.model}). Validates and hedges parameters safely within allocated limits.`,
      allocationLimit
    );
    setCopiedState(activeAgent.name);
    setTimeout(() => {
      setCopiedState(null);
    }, 3000);
  };

  return (
    <div className="space-y-6">
      
      {/* Intro Header */}
      <div className="p-5 border-2 rounded-none bg-white border-stone-950 shadow-[4px_4px_0px_#000]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-bold tracking-widest opacity-60 uppercase flex items-center gap-1.5">
              <Users className="w-3 h-3 text-blue-500" /> STAR INTEL COLLABORATIVE SOCIAL FORGE
            </span>
            <h2 className={`text-md md:text-lg font-black tracking-tight uppercase ${t.titleText}`}>
              Agent-2-Agent (A2A) Leaderboard & Copier Platform
            </h2>
            <p className="text-[11px] opacity-75 max-w-3xl leading-relaxed">
              Skip baseline manual configuration. Discover high-performing star AI Agents operating on-chain, and spawn a dependent "follower agent" to replicate their market prediction signals in real-time. Secured via MetaMask ERC-7715 sandboxed margins.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
            <div className="px-2.5 py-1 bgColor bg-zinc-900/10 border-2 border-current/15 rounded-none font-bold">
              👥 {STAR_AGENTS.length} STAR AGENTS LIVE
            </div>
            <div className="px-2.5 py-1 bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-600 rounded-none font-bold">
              ✓ AUDITED CODE
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Leaders + Config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        {/* Left Col (2 Columns Wide): Leaderboard */}
        <div className="lg:col-span-2 p-5 border-2 rounded-none flex flex-col justify-between bg-white border-stone-950 shadow-[4px_4px_0px_#000]">
          <div>
            <div className="flex items-center justify-between border-b pb-3 border-current/10 mb-5">
              <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-500" /> Active Star Performance Index
              </h3>
              <span className="text-[10px] opacity-50 font-mono">Real-time ROI Stats (Updated Live)</span>
            </div>

            {/* List */}
            <div className="space-y-4">
              {STAR_AGENTS.map((agent) => {
                const isSelected = agent.id === selectedAgentId;
                
                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`p-4 border-2 transition-all cursor-pointer rounded-none relative overflow-hidden ${
                      isSelected
                        ? 'bg-zinc-50 border-stone-950 shadow-[3px_3px_0px_#000] translate-y-[-1px]'
                        : 'bg-white text-stone-950 border-stone-950 shadow-[1px_1px_0px_#000] hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      
                      {/* Left: Avatar + Title */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-none border-2 border-stone-950 flex items-center justify-center text-lg bg-zinc-100 shrink-0">
                          {agent.avatar}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs font-display uppercase leading-tight">{agent.name}</h4>
                            <span className="text-[8.5px] px-1 bg-stone-950 text-white font-mono font-black rounded uppercase">
                              {agent.model.split(' ')[0]}
                            </span>
                          </div>
                          <div className="text-[10px] opacity-60 font-mono mt-1 flex items-center gap-1">
                            <span>Author Account:</span>
                            <span className="underline decoration-dotted">{agent.author}</span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: ROI MINI CHART */}
                      <div className="h-10 w-24 flex items-center shrink-0">
                        <svg className="w-full h-full" viewBox="0 0 240 50">
                          <path
                            d={agent.chartPath}
                            fill="none"
                            stroke="#3b82f6"
                            strokeWidth="3"
                          />
                        </svg>
                      </div>

                      {/* Right: ROI Metrics */}
                      <div className="flex items-center gap-6 font-mono text-right shrink-0">
                        <div>
                          <span className="text-[9px] opacity-50 block uppercase">Win Rate</span>
                          <span className="text-xs font-black text-emerald-600">{agent.winRate}%</span>
                        </div>
                        <div>
                          <span className="text-[9px] opacity-50 block uppercase">ROI (Cumulative)</span>
                          <span className="text-xs font-black text-blue-600">+{agent.roi}%</span>
                        </div>
                        <div className="hidden md:block">
                          <span className="text-[9px] opacity-50 block uppercase">Volume</span>
                          <span className="text-xs font-bold text-stone-950">${(agent.totalVolume/1000).toFixed(1)}k USDC</span>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 p-3 border-2 border-dashed border-current/25 rounded-none flex items-center gap-2 bg-zinc-50/5">
            <Cpu className="w-4 h-4 text-purple-600 shrink-0" />
            <p className="text-[10px] opacity-75 font-sans leading-normal">
              <strong>How A2A Signal Mirroring Works:</strong> When the Star Agent triggers an encrypted Venice AI inference path, a callback publishes signals securely. Follower accounts intercept these, query their local MetaMask Smart-Key guardrails for validation, and pass them to 1Shot API for high-speed, zero-gas execution.
            </p>
          </div>
        </div>

        {/* Right Col: Copy Configuration Panel */}
        <div className="p-5 border-2 rounded-none flex flex-col justify-between bg-white border-stone-950 shadow-[4px_4px_0px_#000]">
          <div>
            <div className="flex items-center gap-2 mb-4 border-b pb-3 border-current/10">
              <div className="w-7 h-7 rounded-none border-2 border-stone-950 flex items-center justify-center text-xs bg-yellow-200">
                ⚡
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-stone-950">
                  Deploy Copy Bot
                </h3>
                <p className="text-[9px] opacity-50">Spawn collaborative prediction node</p>
              </div>
            </div>

            {/* Selected Info Summary */}
            <div className="p-3 bg-zinc-50 border-2 border-stone-950 rounded-none mb-4 space-y-2 text-xs">
              <span className="text-[9px] opacity-50 font-bold tracking-widest block uppercase">Selected target</span>
              <div className="flex items-center gap-1.5 font-bold">
                <span className="text-md">{activeAgent.avatar}</span>
                <span className="uppercase text-stone-950">{activeAgent.name}</span>
              </div>
              <p className="text-[10px] opacity-75 font-sans leading-normal">
                {activeAgent.desc}
              </p>
              <div className="border-t border-stone-200 pt-1.5 mt-1 flex justify-between text-[10px] font-mono">
                <span className="opacity-50">Inference Engine:</span>
                <span className="font-semibold">{activeAgent.model}</span>
              </div>
            </div>

            {/* Custom Margin Allocation Settings */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="risk-allowance-range" className="text-[11px] font-bold uppercase tracking-tight text-neutral-500">
                    Max Safe Single-Bet Alloc
                  </label>
                  <span className="text-xs font-bold font-mono text-rose-600">${allocationLimit} USDC</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <input
                    type="range"
                    id="risk-allowance-range"
                    min="5"
                    max="100"
                    step="5"
                    value={allocationLimit}
                    onChange={(e) => setAllocationLimit(parseInt(e.target.value))}
                    className="flex-1 accent-rose-600 cursor-pointer h-1.5 bg-current/10 rounded-full appearance-none"
                  />
                  <span className="text-[10px] font-mono opacity-50">Limit %</span>
                </div>
              </div>

              {/* Security Policy Assurance */}
              <div className="p-2.5 border-2 border-stone-950 bg-emerald-50 text-[10px] space-y-1 rounded-none leading-relaxed">
                <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>ERC-7715 Copy Vault Isolation</span>
                </div>
                <p className="text-emerald-700 opacity-90 font-sans">
                  The Mirror Bot runs under custom constraints. It can only execute trades that exactly match the signals signed by the Star Agent, up to ${allocationLimit} USDC per prediction.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-current/15 mt-6">
            <button
              type="button"
              onClick={handleCopyTrigger}
              className="w-full py-3 font-mono font-black uppercase text-[10.5px] border-2 bg-[#fae155] text-stone-950 border-stone-950 hover:bg-[#ebd01c] shadow-[2.5px_2.5px_0px_#000] rounded-none cursor-pointer transition-all"
            >
              🚀 {copiedState ? 'DEPLOYING NODE...' : 'ACTIVATE A2A COPY BOT'}
            </button>
            
            {activeCopiedAgent && (
              <p className="text-[9px] text-emerald-600 font-bold text-center mt-2.5 font-mono">
                ✓ Active Followers: Copying ({activeCopiedAgent}) Live
              </p>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
