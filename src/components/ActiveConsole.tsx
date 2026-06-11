/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Terminal, Layers, RefreshCw, Wallet, Flame, TrendingUp, Sparkles, Power } from 'lucide-react';
import { AgentConfig, StyleId } from '../types';
import { THEME_PRESETS } from '../styles';
import { api, useTelemetry } from '../lib/api';

interface ActiveConsoleProps {
  config: AgentConfig;
  onBackToStudio: () => void;
  styleId: StyleId;
}

export default function ActiveConsole({ onBackToStudio, styleId }: ActiveConsoleProps) {
  const { logs, match, state, connected } = useTelemetry();
  const [hiddenBefore, setHiddenBefore] = useState(0); // "reset view" marker
  const [ballPosition, setBallPosition] = useState(50);
  const logEndRef = useRef<HTMLDivElement>(null);

  const t = THEME_PRESETS[styleId];
  const visibleLogs = logs.slice(hiddenBefore);
  const positions = state?.positions ?? [];

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleLogs.length]);

  // ball animation driven by real match events
  useEffect(() => {
    if (!match) return;
    if (match.kind === 'goal') {
      setBallPosition(match.scoreHome > match.scoreAway ? 12 : 88);
    } else {
      setBallPosition((prev) => {
        const next = prev + (Math.floor(Math.random() * 21) - 10);
        return Math.max(18, Math.min(82, next));
      });
    }
  }, [match]);

  const teamHome = match?.teamHome ?? 'Brazil';
  const teamAway = match?.teamAway ?? 'Germany';

  return (
    <div id="active-monitoring-console" className="space-y-6 animate-in fade-in duration-200">
      {/* Navbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between border-b pb-4 border-current/15">
        <button
          type="button"
          onClick={onBackToStudio}
          className="flex items-center gap-1.5 transition-all text-xs font-semibold py-1.5 px-3.5 bg-white text-stone-950 border-2 border-stone-950 shadow-[2px_2px_0px_#000] rounded-none"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Agent Configuration Studio
        </button>

        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 py-1 px-3.5 text-[11px] font-mono font-bold border rounded-none border-stone-950 text-stone-950 ${
              state?.agentActive ? 'bg-[#a7f3d0] animate-pulse' : 'bg-stone-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            {state?.agentActive ? 'Agent ACTIVE — autonomous' : connected ? 'Agent idle' : 'server offline'}
          </div>

          {state?.agentActive && (
            <button
              type="button"
              onClick={() => void api.deactivate()}
              title="Stop the agent loop (off-chain). On-chain: revoke the permission in MetaMask."
              className="flex items-center gap-1.5 p-1.5 px-3 text-[11px] font-bold transition-all outline-none bg-rose-200 hover:bg-rose-300 border-2 border-stone-950 text-stone-950 rounded-none shadow-[2px_2px_0px_#000]"
            >
              <Power className="w-3.5 h-3.5" /> Kill Switch
            </button>
          )}
        </div>
      </div>

      {/* Stats Widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${t.cardBg} flex items-center gap-3.5 !p-4`}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 border-stone-950 bg-blue-200">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] opacity-50 font-mono tracking-tight uppercase font-semibold">Smart Account (Sepolia)</span>
            <div className="text-sm font-black font-mono leading-none mt-1">
              {state?.balanceUsdc != null ? `$${state.balanceUsdc.toFixed(2)} USDC` : '— USDC'}
            </div>
          </div>
        </div>

        <div className={`${t.cardBg} flex items-center gap-3.5 !p-4`}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 border-stone-950 bg-green-200">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] opacity-50 font-mono tracking-tight uppercase font-semibold">Daily Budget Left (7715)</span>
            <div className="text-sm font-black font-mono leading-none mt-1 text-emerald-600">
              ${(state?.budgetLeftUsdc ?? 0).toFixed(2)} USDC
            </div>
          </div>
        </div>

        <div className={`${t.cardBg} flex items-center gap-3.5 !p-4`}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 border-stone-950 bg-indigo-200">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] opacity-50 font-mono tracking-tight uppercase font-semibold">Onchain Bets</span>
            <div className="text-sm font-black font-mono leading-none mt-1">{positions.length} Positions</div>
          </div>
        </div>

        <div className={`${t.cardBg} flex items-center gap-3.5 !p-4`}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 border-stone-950 bg-yellow-200 animate-pulse">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] opacity-50 font-mono tracking-tight uppercase font-semibold">User Gas Paid</span>
            <div className="text-sm font-black font-mono leading-none mt-1">0 ETH</div>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Visual Arena */}
        <div className={`xl:col-span-7 flex flex-col justify-between ${t.cardBg}`}>
          <div>
            <div className="flex items-center justify-between border-b pb-3 border-current/10">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">Live Feed — World Cup 2026 (simulated)</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 border bg-[#fae155] text-stone-950 border-stone-950">
                {match ? `MINUTE ${match.minute}' ${match.kind === 'fulltime' ? 'FT' : 'LIVE'}` : 'WAITING'}
              </span>
            </div>

            {/* Scoreboard */}
            <div className="py-4 px-5 text-center flex items-center justify-center gap-6 mt-4 relative rounded-lg border bg-[#fafaf8] border-2 border-stone-950">
              <div className="flex-1 text-right">
                <span className="text-[11px] font-mono font-bold uppercase text-blue-600">{teamHome}</span>
                <p className="text-[9px] opacity-50 italic">implied {match ? match.odds.home.toFixed(2) : '—'}</p>
              </div>

              <div className="text-xl font-black font-mono tracking-widest px-4 py-1.5 rounded-lg border bg-white border-2 border-stone-950 text-stone-950">
                <span className="text-emerald-500">{match?.scoreHome ?? 0}</span>
                <span className="opacity-40 select-none"> - </span>
                <span>{match?.scoreAway ?? 0}</span>
              </div>

              <div className="flex-1 text-left">
                <span className="text-[11px] font-mono font-bold uppercase">{teamAway}</span>
                <p className="text-[9px] opacity-50 italic">implied {match ? match.odds.away.toFixed(2) : '—'}</p>
              </div>
            </div>

            {/* Pitch */}
            <div className="my-4 relative overflow-hidden h-36 flex flex-col justify-between p-3 border border-2 border-stone-950 bg-[#166534]">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-white/10"></div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/10"></div>
              <div className="absolute left-0 bottom-4 top-4 w-8 border-r border-y border-white/10"></div>
              <div className="absolute right-0 bottom-4 top-4 w-8 border-l border-y border-white/10"></div>

              <div
                className="absolute w-5.5 h-5.5 rounded-full bg-white border shadow-lg flex items-center justify-center text-[10px] font-bold text-stone-950 transition-all duration-700 border-2 border-stone-950 shadow-none"
                style={{ left: `${ballPosition}%`, top: '38%' }}
              >
                ⚽
              </div>

              <div className="z-10 px-3 py-1.5 rounded text-[10px] font-mono text-center flex items-center justify-center gap-1.5 mt-auto border bg-white border-2 border-stone-950 text-stone-950">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>{match ? match.description : 'Waiting for kickoff — activate the agent in the Forge.'}</span>
              </div>
            </div>

            {/* Demo controls */}
            <div className="p-3.5 rounded-lg space-y-2.5 border bg-[#fafae8] border-2 border-stone-950">
              <span className="text-[10px] opacity-60 block uppercase font-bold tracking-wider">
                🔧 Demo Controls (inject real match events — the agent reacts on-chain)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void api.simEvent('goal-home')}
                  className="py-1.5 px-2 text-[10px] font-bold font-display cursor-pointer bg-blue-300 hover:bg-blue-400 border-2 border-stone-950 rounded-none text-stone-950"
                >
                  ⚽ Goal {teamHome}
                </button>
                <button
                  type="button"
                  onClick={() => void api.simEvent('goal-away')}
                  className="py-1.5 px-2 text-[10px] font-bold font-display cursor-pointer bg-stone-100 hover:bg-stone-200 border-2 border-stone-950 rounded-none text-stone-950"
                >
                  ⚽ Goal {teamAway}
                </button>
              </div>
            </div>
          </div>

          {/* Positions */}
          <div className="mt-4 border-t border-current/10 pt-3.5">
            <span className="text-[11px] uppercase tracking-wider opacity-60 block mb-2 font-bold">
              💼 Onchain Positions (MockPredictionMarket · Sepolia)
            </span>
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
              {positions.length === 0 ? (
                <div className="text-center py-2 text-xs font-mono opacity-50">No positions yet — wait for a goal or inject one above.</div>
              ) : (
                positions.map((pos) => (
                  <div key={pos.id} className="p-2.5 flex items-center justify-between text-xs border bg-white border-2 border-stone-950 rounded-none text-stone-950">
                    <div>
                      <div className="font-semibold leading-tight">
                        {pos.marketName}
                        <span className={`ml-2 text-[8px] px-1 py-0.5 border border-stone-950 font-mono uppercase ${pos.rail === 'follower' ? 'bg-purple-200' : 'bg-blue-200'}`}>
                          {pos.rail === 'follower' ? 'A2A copy (3-hop)' : 'star (2-hop)'}
                        </span>
                      </div>
                      <div className="text-[9px] opacity-65 mt-0.5 font-mono">
                        <strong className="text-blue-600 font-bold">{pos.selectedOutcome}</strong> • ${pos.betAmountUsdc.toFixed(2)} • odds {pos.entryOdds.toFixed(2)}
                        {pos.txHash && (
                          <>
                            {' • '}
                            <a className="underline" href={`https://sepolia.etherscan.io/tx/${pos.txHash}`} target="_blank" rel="noreferrer">
                              tx ↗
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-mono text-[10px] font-bold px-1.5 py-0.5 border-2 border-stone-950 ${
                          pos.status === 'OPEN' ? 'bg-[#a7f3d0]' : pos.status === 'PENDING' ? 'bg-[#fae155]' : pos.status === 'FAILED' ? 'bg-rose-200' : 'bg-stone-100'
                        }`}
                      >
                        {pos.status}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Telemetry Logs */}
        <div className={`xl:col-span-5 flex flex-col justify-between ${t.cardBg}`}>
          <div>
            <div className="flex items-center gap-1.5 border-b pb-3 mb-3 border-current/10">
              <Terminal className="w-4 h-4 text-blue-500" />
              <h4 className={`text-xs font-bold uppercase tracking-wider ${t.titleText}`}>
                Live Telemetry — Venice · 7715 · 1Shot · Sepolia
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2 text-[11px] font-mono max-h-[380px] min-h-[300px]">
              {visibleLogs.length === 0 && (
                <div className="text-center py-6 text-xs opacity-50">
                  {connected ? 'Stream connected — waiting for events…' : 'Connecting to PolyForge server (npm run server)…'}
                </div>
              )}
              {visibleLogs.map((log) => {
                let badgeClass = 'text-stone-500 bg-current/5';
                let logWrapper = `p-2.5 rounded border border-current/5 bg-current/5`;

                if (log.source === 'venice') {
                  badgeClass = 'bg-blue-500/10 text-blue-600';
                  logWrapper = `p-2.5 rounded border border-blue-500/20 bg-blue-500/5`;
                } else if (log.source === 'guardrail') {
                  badgeClass = 'bg-emerald-500/10 text-emerald-600';
                  logWrapper = `p-2.5 rounded border border-emerald-500/20 bg-emerald-500/5`;
                } else if (log.source === 'relayer') {
                  badgeClass = 'bg-purple-500/10 text-purple-600';
                  logWrapper = `p-2.5 rounded border border-purple-500/20 bg-purple-500/5`;
                } else if (log.source === 'contract') {
                  badgeClass = 'bg-amber-500/10 text-amber-600';
                  logWrapper = `p-2.5 rounded border border-amber-500/20 bg-amber-500/5 font-semibold`;
                }

                const time = log.timestamp.includes('T') ? log.timestamp.split('T')[1].slice(0, 8) : log.timestamp;

                return (
                  <div key={log.id} className={logWrapper}>
                    <div className="flex items-center justify-between border-b border-current/5 pb-1 mb-1 text-[9px]">
                      <span className={`px-1 rounded font-bold uppercase font-mono ${badgeClass}`}>
                        {log.source === 'venice' ? 'Venice AI' : log.source.toUpperCase()}
                      </span>
                      <span className="opacity-40">{time} UTC</span>
                    </div>
                    <div className="opacity-90 leading-relaxed font-sans text-xs break-words">{linkify(log.message)}</div>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>

          <div className="border-t pt-3 mt-3 border-current/10 flex items-center justify-between">
            <span className="text-[10px] opacity-40 font-mono">{connected ? 'SSE stream live' : 'stream reconnecting…'}</span>

            <button
              type="button"
              onClick={() => setHiddenBefore(logs.length)}
              className="flex items-center gap-1.5 font-mono text-[9px] font-bold py-1 px-2.5 cursor-pointer bg-white border-2 border-stone-950 text-stone-950 rounded-none"
            >
              <RefreshCw className="w-3 h-3" />
              Clear View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Make etherscan URLs in log lines clickable. */
function linkify(message: string): React.ReactNode {
  const m = message.match(/https:\/\/sepolia\.etherscan\.io\/\S+/);
  if (!m) return message;
  const [url] = m;
  const i = message.indexOf(url);
  return (
    <>
      {message.slice(0, i)}
      <a className="underline text-blue-600" href={url} target="_blank" rel="noreferrer">
        {url.replace('https://', '')}
      </a>
      {message.slice(i + url.length)}
    </>
  );
}
