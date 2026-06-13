/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TrendingUp, Cpu, ShieldCheck, Users, ExternalLink, RefreshCw, Layers, Activity } from 'lucide-react';
import { StyleId } from '../types';
import { THEME_PRESETS } from '../styles';
import { api, type AgentNFAEntry } from '../lib/api';

interface ExploreSignalsProps {
  styleId: StyleId;
  onDeployCopyAgent: (agentId: number, label: string, prompt: string, maxSpend: number) => void;
  activeCopiedAgent: string | null;
}

const SEPOLIA_NFA = (addr: string, tokenId: number) => `https://sepolia.etherscan.io/nft/${addr}/${tokenId}`;

export default function ExploreSignals({ styleId, onDeployCopyAgent, activeCopiedAgent }: ExploreSignalsProps) {
  const t = THEME_PRESETS[styleId];
  const [agents, setAgents] = useState<AgentNFAEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [allocationLimit, setAllocationLimit] = useState<number>(5);
  const [loading, setLoading] = useState(true);
  const [nfaContract, setNfaContract] = useState<string>('');

  const refresh = () => {
    setLoading(true);
    api
      .getRegistry()
      .then((a) => {
        setAgents(a);
        if (a.length && selectedId === null) setSelectedId(a[0].tokenId);
        // derive the NFA contract address from any DID: did:nfa:chain:contract:tokenId
        const did = a[0]?.did?.split(':');
        if (did && did.length >= 4) setNfaContract(did[3]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = agents.find((a) => a.tokenId === selectedId) ?? agents[0];

  const handleCopy = () => {
    if (!active) return;
    onDeployCopyAgent(active.tokenId, active.label, active.prompt, allocationLimit);
  };

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="p-5 border-2 rounded-none bg-white border-stone-950 shadow-[4px_4px_0px_#000]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-mono font-bold tracking-widest opacity-60 uppercase flex items-center gap-1.5">
              <Users className="w-3 h-3 text-blue-500" /> Onchain Agent Registry (ERC-721 · NFA)
            </span>
            <h2 className={`text-md md:text-lg font-black tracking-tight uppercase ${t.titleText}`}>
              Discover & Copy AI Agents
            </h2>
            <p className="text-[11px] opacity-75 max-w-3xl leading-relaxed">
              Every agent is an <strong>AgentNFA</strong> with an on-chain DID. Pick one and spawn a copy mandate — a
              follower agent mirrors its signals via ERC-7710 redelegation (3-hop A2A), bounded by your own ERC-7715
              guardrails. Stats are live on-chain activity (win-rate omitted — markets settle after the hackathon).
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
            <div className="px-2.5 py-1 bg-zinc-900/10 border-2 border-current/15 rounded-none font-bold">
              👥 {agents.length} NFA AGENTS
            </div>
            <button type="button" onClick={refresh} className="px-2.5 py-1 bg-white border-2 border-stone-950 rounded-none font-bold flex items-center gap-1 cursor-pointer">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Leaderboard */}
        <div className="lg:col-span-2 p-5 border-2 rounded-none flex flex-col bg-white border-stone-950 shadow-[4px_4px_0px_#000]">
          <div className="flex items-center justify-between border-b pb-3 border-current/10 mb-4">
            <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-blue-500" /> Live Onchain Activity
            </h3>
            <span className="text-[10px] opacity-50 font-mono">Sepolia · refreshed every 15s</span>
          </div>

          {agents.length === 0 ? (
            <div className="text-center py-12 text-xs font-mono opacity-50">
              {loading ? 'reading AgentNFA registry…' : 'no agents minted yet — mint one in the Workspace Studio'}
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map((a) => {
                const isSel = a.tokenId === active?.tokenId;
                return (
                  <div
                    key={a.tokenId}
                    onClick={() => setSelectedId(a.tokenId)}
                    className={`p-4 border-2 transition-all cursor-pointer rounded-none border-stone-950 ${
                      isSel ? 'bg-zinc-50 shadow-[3px_3px_0px_#000] translate-y-[-1px]' : 'bg-white shadow-[1px_1px_0px_#000] hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-none border-2 border-stone-950 flex items-center justify-center text-sm bg-[#fae155] shrink-0 font-black">
                          #{a.tokenId}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs font-display uppercase leading-tight truncate">{a.label}</h4>
                            <span className="text-[8.5px] px-1 bg-stone-950 text-white font-mono font-black rounded uppercase shrink-0">
                              {a.model.split('-')[0]}
                            </span>
                          </div>
                          <a
                            href={nfaContract ? SEPOLIA_NFA(nfaContract, a.tokenId) : '#'}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[9px] opacity-60 font-mono mt-1 flex items-center gap-1 hover:underline"
                            title={a.did}
                          >
                            {a.did.length > 38 ? `${a.did.slice(0, 38)}…` : a.did}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center gap-5 font-mono text-right shrink-0">
                        <div>
                          <span className="text-[9px] opacity-50 block uppercase">Onchain Bets</span>
                          <span className="text-xs font-black text-blue-600">{a.activity.positions}</span>
                        </div>
                        <div>
                          <span className="text-[9px] opacity-50 block uppercase">Volume</span>
                          <span className="text-xs font-black text-stone-950">${a.activity.volumeUsdc.toFixed(0)}</span>
                        </div>
                        <div className="hidden md:block">
                          <span className="text-[9px] opacity-50 block uppercase">Open</span>
                          <span className="text-xs font-bold text-emerald-600">{a.activity.openPositions}</span>
                        </div>
                      </div>
                    </div>
                    {a.activity.lastMarket && (
                      <div className="text-[9px] opacity-55 font-mono mt-2 flex items-center gap-1 border-t border-current/10 pt-1.5">
                        <Activity className="w-2.5 h-2.5" /> last: {a.activity.lastMarket}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 p-3 border-2 border-dashed border-current/25 rounded-none flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-600 shrink-0" />
            <p className="text-[10px] opacity-75 font-sans leading-normal">
              <strong>A2A copy = real redelegation:</strong> your follower agent receives a narrower ERC-7710 slice of the
              star agent's authority (user → star → follower → relayer), executed gaslessly via 1Shot. Revoke anytime.
            </p>
          </div>
        </div>

        {/* Copy panel */}
        <div className="p-5 border-2 rounded-none flex flex-col justify-between bg-white border-stone-950 shadow-[4px_4px_0px_#000]">
          <div>
            <div className="flex items-center gap-2 mb-4 border-b pb-3 border-current/10">
              <div className="w-7 h-7 rounded-none border-2 border-stone-950 flex items-center justify-center text-xs bg-yellow-200">⚡</div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-stone-950">Deploy Copy Mandate</h3>
                <p className="text-[9px] opacity-50">3-hop A2A follower agent</p>
              </div>
            </div>

            {active ? (
              <div className="p-3 bg-zinc-50 border-2 border-stone-950 rounded-none mb-4 space-y-2 text-xs">
                <span className="text-[9px] opacity-50 font-bold tracking-widest block uppercase">Selected NFA</span>
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-md">#{active.tokenId}</span>
                  <span className="uppercase text-stone-950 truncate">{active.label}</span>
                </div>
                <p className="text-[10px] opacity-75 font-sans leading-normal">{active.prompt}</p>
                <div className="border-t border-stone-200 pt-1.5 mt-1 flex justify-between text-[10px] font-mono">
                  <span className="opacity-50">Brain:</span>
                  <span className="font-semibold">{active.model}</span>
                </div>
              </div>
            ) : (
              <div className="p-3 text-[10px] opacity-50 font-mono mb-4">Select an agent to copy.</div>
            )}

            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="alloc" className="text-[11px] font-bold uppercase tracking-tight text-neutral-500">
                    Max Spend Per Match (follower)
                  </label>
                  <span className="text-xs font-bold font-mono text-rose-600">${allocationLimit} USDC</span>
                </div>
                <input
                  id="alloc"
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={allocationLimit}
                  onChange={(e) => setAllocationLimit(parseInt(e.target.value))}
                  className="w-full accent-rose-600 cursor-pointer h-1.5 bg-current/10 rounded-full appearance-none"
                />
              </div>

              <div className="p-2.5 border-2 border-stone-950 bg-emerald-50 text-[10px] space-y-1 rounded-none leading-relaxed">
                <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>ERC-7715 + ERC-7710 bounded</span>
                </div>
                <p className="text-emerald-700 opacity-90 font-sans">
                  The follower redeems only within a scoped slice of your budget, ≤ ${allocationLimit} per match, expiring
                  with your grant.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-current/15 mt-6">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!active}
              className="w-full py-3 font-mono font-black uppercase text-[10.5px] border-2 bg-[#fae155] text-stone-950 border-stone-950 hover:bg-[#ebd01c] shadow-[2.5px_2.5px_0px_#000] rounded-none cursor-pointer transition-all disabled:opacity-40"
            >
              🚀 {activeCopiedAgent ? 'Reconfigure Copy' : 'Copy this Agent'}
            </button>
            {activeCopiedAgent && (
              <p className="text-[9px] text-emerald-600 font-bold text-center mt-2.5 font-mono">
                ✓ Copying ({activeCopiedAgent}) — sign the mandate to go live
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
