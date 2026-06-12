/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Terminal, Layers, RefreshCw, Wallet, Flame, TrendingUp, TrendingDown, Power, ExternalLink, Zap } from 'lucide-react';
import { AgentConfig, StyleId } from '../types';
import { THEME_PRESETS } from '../styles';
import { api, useTelemetry, type MarketQuote, type MatchGroup } from '../lib/api';

interface ActiveConsoleProps {
  config: AgentConfig;
  onBackToStudio: () => void;
  styleId: StyleId;
}

export default function ActiveConsole({ onBackToStudio, styleId }: ActiveConsoleProps) {
  const { logs, board, state, connected } = useTelemetry();
  const [hiddenBefore, setHiddenBefore] = useState(0);
  const [injecting, setInjecting] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const t = THEME_PRESETS[styleId];
  const visibleLogs = logs.slice(hiddenBefore);
  const positions = state?.positions ?? [];

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleLogs.length]);

  const handleInject = async (slug: string) => {
    setInjecting(slug);
    try {
      await api.injectDislocation(slug);
    } finally {
      setTimeout(() => setInjecting(null), 1500);
    }
  };

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
            {state?.agentActive ? 'Agent ACTIVE — scanning board' : connected ? 'Agent idle' : 'server offline'}
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
            <span className="text-[10px] opacity-50 font-mono tracking-tight uppercase font-semibold">Onchain Positions</span>
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
        {/* Market Board */}
        <div className={`xl:col-span-7 flex flex-col ${t.cardBg}`}>
          <div className="flex items-center justify-between border-b pb-3 border-current/10">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">
                Polymarket · World Cup 2026 — match board
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 border bg-[#fae155] text-stone-950 border-stone-950">
              {board.matches.length} MATCHES · Gamma API
            </span>
          </div>

          <div className="mt-3 space-y-2 overflow-y-auto max-h-[440px] pr-1">
            {board.matches.length === 0 && board.futures.length === 0 && (
              <div className="text-center py-10 text-xs font-mono opacity-50">
                {connected ? 'loading Polymarket board…' : 'connecting to PolyForge server (npm run server)…'}
              </div>
            )}
            {board.matches.map((match) => (
              <MatchCard key={match.eventSlug} match={match} injecting={injecting} onInject={(slug) => void handleInject(slug)} />
            ))}

            {board.futures.length > 0 && (
              <details className="border-2 border-stone-950 bg-stone-50">
                <summary className="cursor-pointer px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider font-mono select-none">
                  🏆 Championship futures — World Cup Winner ({board.futures.length} markets)
                </summary>
                <div className="p-2 pt-0 space-y-1.5 max-h-[260px] overflow-y-auto">
                  {board.futures.map((m) => (
                    <MarketRow key={m.slug} market={m} injecting={injecting === m.slug} onInject={() => void handleInject(m.slug)} />
                  ))}
                </div>
              </details>
            )}
          </div>

          <p className="text-[9px] opacity-45 font-mono mt-2.5 leading-relaxed">
            Real-time match moneylines + futures from polymarket.com (read-only Gamma API). ⚡ injects a synthetic
            dislocation for demo determinism — labeled in telemetry. Execution settles on the Sepolia mirror market via
            the 1Shot relayer.
          </p>

          {/* Positions */}
          <div className="mt-4 border-t border-current/10 pt-3.5">
            <span className="text-[11px] uppercase tracking-wider opacity-60 block mb-2 font-bold">
              💼 Onchain Positions (mirror market · Sepolia)
            </span>
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {positions.length === 0 ? (
                <div className="text-center py-2 text-xs font-mono opacity-50">
                  No positions yet — wait for a real reprice or inject one above.
                </div>
              ) : (
                positions.map((pos) => (
                  <div key={pos.id} className="p-2.5 flex items-center justify-between text-xs border bg-white border-2 border-stone-950 rounded-none text-stone-950">
                    <div className="min-w-0">
                      <div className="font-semibold leading-tight truncate">
                        {pos.marketName}
                        {pos.polymarketUrl && (
                          <a className="ml-1.5 inline-block align-middle text-blue-600" href={pos.polymarketUrl} target="_blank" rel="noreferrer" title="View on Polymarket">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <span className={`ml-2 text-[8px] px-1 py-0.5 border border-stone-950 font-mono uppercase ${pos.rail === 'follower' ? 'bg-purple-200' : 'bg-blue-200'}`}>
                          {pos.rail === 'follower' ? 'A2A copy (3-hop)' : 'star (2-hop)'}
                        </span>
                      </div>
                      <div className="text-[9px] opacity-65 mt-0.5 font-mono">
                        <strong className="text-blue-600 font-bold">{(pos.betAmountUsdc / pos.entryOdds).toFixed(1)} {pos.selectedOutcome} shares</strong> @ ${pos.entryOdds.toFixed(3)} • ${pos.betAmountUsdc.toFixed(2)} in
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
                    <div className="text-right shrink-0 ml-2">
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

            <div className="flex-1 overflow-y-auto pr-1 space-y-2 text-[11px] font-mono max-h-[460px] min-h-[320px]">
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

function MatchCard({
  match,
  injecting,
  onInject,
}: {
  match: MatchGroup;
  injecting: string | null;
  onInject: (slug: string) => void;
  key?: string;
}) {
  const day = match.endDate ? new Date(match.endDate).toISOString().slice(5, 10).replace('-', '/') : '';
  return (
    <div className="border-2 border-stone-950 bg-white text-stone-950 p-2.5">
      <div className="flex items-center justify-between gap-2 border-b border-stone-950/15 pb-1.5 mb-2">
        <div className="font-bold text-xs truncate flex items-center gap-1.5">
          ⚽ <span className="truncate">{match.title}</span>
          <a href={match.polymarketUrl} target="_blank" rel="noreferrer" className="text-blue-600 shrink-0" title="Open on Polymarket">
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <span className="text-[9px] font-mono opacity-55 shrink-0">{day} UTC</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {match.markets.map((m) => {
          const deltaUp = m.delta > 0;
          const hasDelta = Math.abs(m.delta) >= 0.001;
          return (
            <div key={m.slug} className={`border-2 border-stone-950 p-1.5 text-center ${m.injected ? 'bg-[#fef3c7]' : 'bg-stone-50'}`}>
              <div className="text-[9px] font-bold uppercase truncate" title={m.question}>
                {m.label}
                {m.injected && <span className="ml-1 text-[7px] px-0.5 bg-stone-950 text-white font-mono">demo Δ</span>}
              </div>
              <div className="font-mono font-black text-xs mt-0.5">${m.yesPrice.toFixed(3)}</div>
              <div className={`text-[8.5px] font-mono flex items-center justify-center gap-0.5 ${hasDelta ? (deltaUp ? 'text-emerald-600' : 'text-rose-600') : 'opacity-40'}`}>
                {hasDelta && (deltaUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />)}
                Δ{m.delta >= 0 ? '+' : ''}
                {m.delta.toFixed(3)}
              </div>
              <button
                type="button"
                onClick={() => onInject(m.slug)}
                disabled={injecting === m.slug}
                title={`Inject a synthetic dislocation on ${m.label} (demo)`}
                className={`mt-1 w-full py-0.5 border-2 border-stone-950 rounded-none cursor-pointer flex items-center justify-center ${injecting === m.slug ? 'bg-stone-200' : 'bg-[#fae155] hover:bg-[#ebd01c]'}`}
              >
                <Zap className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarketRow({
  market,
  injecting,
  onInject,
}: {
  market: MarketQuote;
  injecting: boolean;
  onInject: () => void;
  key?: string; // satisfies the JSX checker under strictNullChecks-only tsconfig
}) {
  const deltaUp = market.delta > 0;
  const hasDelta = Math.abs(market.delta) >= 0.001;
  const vol =
    market.volume24h >= 1_000_000
      ? `$${(market.volume24h / 1_000_000).toFixed(1)}M`
      : market.volume24h >= 1_000
        ? `$${(market.volume24h / 1_000).toFixed(0)}k`
        : `$${Math.round(market.volume24h)}`;

  return (
    <div className={`p-2 px-2.5 flex items-center gap-2 text-xs border-2 border-stone-950 rounded-none text-stone-950 ${market.injected ? 'bg-[#fef3c7]' : 'bg-white'}`}>
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight truncate flex items-center gap-1.5">
          <a href={market.polymarketUrl} target="_blank" rel="noreferrer" className="truncate hover:underline" title={`${market.question} — open on Polymarket`}>
            {market.question.replace('Will ', '').replace(' win the 2026 FIFA World Cup?', '')}
          </a>
          <a href={market.polymarketUrl} target="_blank" rel="noreferrer" className="text-blue-600 shrink-0" title="Open on Polymarket">
            <ExternalLink className="w-3 h-3" />
          </a>
          {market.injected && <span className="text-[8px] px-1 border border-stone-950 bg-stone-950 text-white font-mono uppercase shrink-0">demo Δ</span>}
        </div>
        <div className="text-[9px] opacity-55 font-mono mt-0.5">vol 24h {vol}</div>
      </div>

      <div className="shrink-0 text-right font-mono">
        <div className="font-bold">
          <span className="text-emerald-700">YES ${market.yesPrice.toFixed(3)}</span>
          <span className="opacity-40 mx-1">·</span>
          <span className="text-rose-700">NO ${market.noPrice.toFixed(3)}</span>
        </div>
        <div className={`text-[9px] flex items-center justify-end gap-0.5 ${hasDelta ? (deltaUp ? 'text-emerald-600' : 'text-rose-600') : 'opacity-40'}`}>
          {hasDelta && (deltaUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />)}
          Δ{market.delta >= 0 ? '+' : ''}
          {market.delta.toFixed(3)}
        </div>
      </div>

      <button
        type="button"
        onClick={onInject}
        disabled={injecting}
        title="Inject a synthetic dislocation on this market (demo)"
        className={`shrink-0 p-1.5 border-2 border-stone-950 rounded-none cursor-pointer ${injecting ? 'bg-stone-200' : 'bg-[#fae155] hover:bg-[#ebd01c]'}`}
      >
        <Zap className="w-3.5 h-3.5" />
      </button>
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
