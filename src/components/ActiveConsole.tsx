/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, Pause, Terminal, Layers, RefreshCw, Wallet, Flame, TrendingUp, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { AgentConfig, TelemetryLog, SimulationStats, ActivePosition, MatchState, StyleId } from '../types';
import { THEME_PRESETS } from '../styles';

interface ActiveConsoleProps {
  config: AgentConfig;
  onBackToStudio: () => void;
  styleId: StyleId;
}

const INITIAL_LOGS: TelemetryLog[] = [
  {
    id: 'init-1',
    timestamp: '17:31:56',
    source: 'system',
    message: 'PolyForge telemetry listener active. Awaiting ERC-7715 session stream setup...',
    type: 'info'
  },
  {
    id: 'init-2',
    timestamp: '17:31:57',
    source: 'guardrail',
    message: 'MetaMask Smart Account session key registered: 0x7715...893F. Permissions strictly bounded to Polymarket Router buy() transactions.',
    type: 'success'
  },
  {
    id: 'init-3',
    timestamp: '17:31:58',
    source: 'system',
    message: '1Shot Relayer RPC pinged: latency 11ms. 0-Gas Abstraction enabled on Channel 0x0a.',
    type: 'info'
  }
];

export default function ActiveConsole({ config, onBackToStudio, styleId }: ActiveConsoleProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [stats, setStats] = useState<SimulationStats>({
    balanceUsdc: 850.00,
    totalBetsPlaced: 3,
    totalVolumeUsdc: 150.00,
    pnlUsdc: 24.50,
    agentStatus: 'active'
  });

  const [match, setMatch] = useState<MatchState>({
    minute: 27,
    teamHome: 'Brazil',
    teamAway: 'France',
    scoreHome: 1,
    scoreAway: 0,
    ballPosition: 45,
    phase: 'live',
    lastActionDescription: 'Game is actively disputed in midfield.'
  });

  const [logs, setLogs] = useState<TelemetryLog[]>(INITIAL_LOGS);
  const [positions, setPositions] = useState<ActivePosition[]>([
    {
      id: 'pos-1',
      marketName: 'Brazil vs France - Match Winner',
      selectedOutcome: 'YES',
      betAmountUsdc: 50.00,
      entryOdds: 0.65,
      currentValueUsdc: 62.10,
      status: 'OPEN'
    },
    {
      id: 'pos-2',
      marketName: 'Over 2.5 Goals - Brazil vs France',
      selectedOutcome: 'YES',
      betAmountUsdc: 50.00,
      entryOdds: 1.85,
      currentValueUsdc: 52.40,
      status: 'OPEN'
    },
    {
      id: 'pos-3',
      marketName: 'France to keep Clean Sheet',
      selectedOutcome: 'NO',
      betAmountUsdc: 50.00,
      entryOdds: 0.35,
      currentValueUsdc: 60.00,
      status: 'OPEN'
    }
  ]);

  const logEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const t = THEME_PRESETS[styleId];

  // Auto scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Append new telemetry entry
  const addLog = (source: TelemetryLog['source'], message: string, type: TelemetryLog['type'] = 'info') => {
    const time = new Date().toISOString().split('T')[1].slice(0, 8);
    const newLog: TelemetryLog = {
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: time,
      source,
      message,
      type
    };
    setLogs((prev) => [...prev, newLog]);
  };

  // Helper code to handle instant bet creation simulation when match events occur
  const executePredictionBetOrder = (market: string, outcome: 'YES' | 'NO', amount: number, odds: number) => {
    setTimeout(() => {
      addLog('venice', `[Venice AI Inference]: consensus signal target exceeds threshold (current: 0.91). Dispatching analysis path for ${market} (${outcome}).`, 'info');
      
      setTimeout(() => {
        const isWithinLimits = amount <= config.maxSpendPerMatch && (stats.totalVolumeUsdc + amount) <= config.maxDailyAllowance;
        if (isWithinLimits) {
          addLog('guardrail', `[MetaMask ERC-7715]: verification passed. limits check complete (Requested: $${amount} / Limit: $${config.maxSpendPerMatch}).`, 'success');
          
          setTimeout(() => {
            addLog('relayer', `[1Shot Relayer]: Transaction successfully bundled on Multi-2D channel [${config.channelNonce}]. Nonce clear. Relaying to RPC...`, 'info');
            
            setTimeout(() => {
              addLog('contract', `[Polymarket Router]: Successful settlement on ${config.targetContract.slice(0, 8)}... Locked $${amount} YES outcome on '${market}'.`, 'success');
              
              setStats((prev) => {
                const newVolume = prev.totalVolumeUsdc + amount;
                const newBalance = prev.balanceUsdc - amount;
                return {
                  ...prev,
                  balanceUsdc: newBalance,
                  totalVolumeUsdc: newVolume,
                  totalBetsPlaced: prev.totalBetsPlaced + 1
                };
              });

              const newPos: ActivePosition = {
                id: `pos-${Date.now()}`,
                marketName: market,
                selectedOutcome: outcome,
                betAmountUsdc: amount,
                entryOdds: odds,
                currentValueUsdc: amount * 1.05,
                status: 'OPEN'
              };
              setPositions((prev) => [newPos, ...prev]);

            }, 800);
          }, 800);
        } else {
          addLog('guardrail', `[MetaMask ERC-7715]: Request blocked. Bet amount of $${amount} USDC exceeds current session limit ($${config.maxSpendPerMatch} USDC).`, 'error');
        }
      }, 700);
    }, 400);
  };

  const triggerManualEvent = (type: 'brazil-goal' | 'france-goal' | 'foul-penalty' | 'venice-check') => {
    if (type === 'brazil-goal') {
      const nextScoreHome = match.scoreHome + 1;
      setMatch((prev) => ({
        ...prev,
        scoreHome: nextScoreHome,
        ballPosition: 15,
        lastActionDescription: '⚽ GOAL scored by Brazil! Dynamic momentum shift detected.'
      }));
      addLog('system', `⚽ Arena Update: Brazil Scores! Dynamic tally matches BRA ${nextScoreHome} - ${match.scoreAway} FRA.`, 'info');
      executePredictionBetOrder('Brazil to win World Cup match', 'YES', config.maxSpendPerMatch, 0.72);
    } else if (type === 'france-goal') {
      const nextScoreAway = match.scoreAway + 1;
      setMatch((prev) => ({
        ...prev,
        scoreAway: nextScoreAway,
        ballPosition: 85,
        lastActionDescription: '⚽ GOAL scored by France! Set-piece shot hits the net.'
      }));
      addLog('system', `⚽ Arena Update: France Scores! Live score hits BRA ${match.scoreHome} - ${nextScoreAway} FRA.`, 'info');
      executePredictionBetOrder('Total goals scored Over 3.5 Group Stages', 'YES', Math.min(config.maxSpendPerMatch, 30), 1.95);
    } else if (type === 'foul-penalty') {
      setMatch((prev) => ({
        ...prev,
        ballPosition: 12,
        lastActionDescription: '⚠️ Intercepted penalty foul! Penalty awarded to Brazil.'
      }));
      addLog('system', `⚠️ Local foul declared inside penalty box. High risk betting telemetry triggered.`, 'warning');
      executePredictionBetOrder('Brazil to score Penalty YES', 'YES', Math.min(config.maxSpendPerMatch, 25), 1.25);
    } else if (type === 'venice-check') {
      addLog('venice', `[Venice AI Analytics Check]: Inference engine swept variables on ${config.modelId}. All variables within standard parameters.`, 'info');
    }
  };

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setMatch((prev) => {
          let nextMinute = prev.minute + 1;
          let nextBallPosition = prev.ballPosition + (Math.floor(Math.random() * 21) - 10);
          
          if (nextBallPosition < 15) nextBallPosition = 20;
          if (nextBallPosition > 85) nextBallPosition = 80;
          if (nextMinute >= 90) nextMinute = 1;

          const commentaries = [
            'Tight midfield pressure between core forwards.',
            'Passing sequences across defensive quadrants.',
            'Brazil forward attempts a fast pitch route.',
            'France goalkeeper catches a direct header safely.',
            'Foul in defense. Set-piece awarded to France.',
            'Precision shot on goal, deflected out of bounds.'
          ];
          const desc = commentaries[Math.floor(Math.random() * commentaries.length)];

          return {
            ...prev,
            minute: nextMinute,
            ballPosition: nextBallPosition,
            lastActionDescription: desc
          };
        });

        const roll = Math.random();
        if (roll < 0.12) {
          addLog('venice', `[Venice AI Analytics Sweep]: Sweep evaluation clear. Spreadsheet factors integrated. resting route executing.`, 'info');
        } else if (roll > 0.88) {
          const outcome = match.ballPosition > 50 ? 'YES' : 'NO';
          executePredictionBetOrder('Total corners taken over 11.5', outcome, Math.min(config.maxSpendPerMatch, 20), 1.55);
        }

      }, 5000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, config, stats, match]);

  return (
    <div id="active-monitoring-console" className="space-y-6 animate-in fade-in duration-200">
      {/* Navbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between border-b pb-4 border-current/15">
        <button
          type="button"
          onClick={onBackToStudio}
          className={`flex items-center gap-1.5 transition-all text-xs font-semibold py-1.5 px-3.5 ${
            styleId === 'brutalist'
              ? 'bg-white text-stone-950 border-2 border-stone-950 shadow-[2px_2px_0px_#000] rounded-none'
              : 'bg-current/5 hover:bg-current/10 text-current border border-current/10 rounded-lg'
          }`}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Agent Configuration Studio
        </button>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 py-1 px-3.5 text-[11px] font-mono font-bold border rounded-full animate-pulse ${
            styleId === 'brutalist' ? 'bg-[#a7f3d0] border-stone-950 text-stone-950 rounded-none' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Agent Status: Running Active Telemetry
          </div>
          
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-1.5 transition-all outline-none border ${
              styleId === 'brutalist'
                ? 'bg-white border-2 border-stone-950 text-stone-950 rounded-none shadow-[2px_2px_0px_#000]'
                : 'bg-current/5 border-current/10 text-current select-none rounded-lg hover:bg-current/10'
            }`}
            title={isPlaying ? "Pause simulation streams" : "Resume simulation streams"}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Stats Widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Balance */}
        <div className={`${t.cardBg} flex items-center gap-3.5 !p-4`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            styleId === 'brutalist' ? 'border-2 border-stone-950 bg-blue-200' : 'bg-blue-500/10 text-blue-500'
          }`}>
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] opacity-50 font-mono tracking-tight uppercase font-semibold">Smart Account Balance</span>
            <div className="text-sm font-black font-mono leading-none mt-1">${stats.balanceUsdc.toFixed(2)} USDC</div>
          </div>
        </div>

        {/* Profits */}
        <div className={`${t.cardBg} flex items-center gap-3.5 !p-4`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            styleId === 'brutalist' ? 'border-2 border-stone-950 bg-green-200' : 'bg-emerald-500/10 text-emerald-500'
          }`}>
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] opacity-50 font-mono tracking-tight uppercase font-semibold">Calculated Session Net PnL</span>
            <div className="text-sm font-black font-mono leading-none mt-1 text-emerald-600">
              +${stats.pnlUsdc.toFixed(2)} USDC
            </div>
          </div>
        </div>

        {/* Bets placed */}
        <div className={`${t.cardBg} flex items-center gap-3.5 !p-4`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            styleId === 'brutalist' ? 'border-2 border-stone-950 bg-indigo-200' : 'bg-indigo-500/10 text-indigo-500'
          }`}>
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] opacity-50 font-mono tracking-tight uppercase font-semibold">Settled Orders Count</span>
            <div className="text-sm font-black font-mono leading-none mt-1">{stats.totalBetsPlaced} Positions</div>
          </div>
        </div>

        {/* Speed */}
        <div className={`${t.cardBg} flex items-center gap-3.5 !p-4`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            styleId === 'brutalist' ? 'border-2 border-stone-950 bg-yellow-200 animate-pulse' : 'bg-amber-500/10 text-amber-500 animate-pulse'
          }`}>
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] opacity-50 font-mono tracking-tight uppercase font-semibold">Average Execution Latency</span>
            <div className="text-sm font-black font-mono leading-none mt-1">112 ms</div>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        
        {/* Visual Arena */}
        <div className={`xl:col-span-7 flex flex-col justify-between ${t.cardBg}`}>
          <div>
            {/* Header */}
            <div className="flex items-center justify-between border-b pb-3 border-current/10">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-85">Predictive World Arena Simulator</span>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 border ${
                styleId === 'brutalist' ? 'bg-[#fae155] text-stone-950 border-stone-950' : 'bg-current/5 border-current/10'
              }`}>
                MINUTE {match.minute}' LIVE
              </span>
            </div>

            {/* Scoreboard */}
            <div className={`py-4 px-5 text-center flex items-center justify-center gap-6 mt-4 relative rounded-lg border ${
              styleId === 'brutalist' ? 'bg-[#fafaf8] border-2 border-stone-950' : 'bg-current/5 border-current/5'
            }`}>
              <div className="flex-1 text-right">
                <span className={`text-[11px] font-mono font-bold uppercase ${styleId === 'brutalist' ? 'text-blue-600' : 'text-current'}`}>BRAZIL</span>
                <p className="text-[9px] opacity-50 italic">Coeff: 0.87</p>
              </div>

              <div className={`text-xl font-black font-mono tracking-widest px-4 py-1.5 rounded-lg border ${
                styleId === 'brutalist' ? 'bg-white border-2 border-stone-950 text-stone-950' : 'bg-black/95 text-white'
              }`}>
                <span className="text-emerald-500">{match.scoreHome}</span>
                <span className="opacity-40 select-none"> - </span>
                <span>{match.scoreAway}</span>
              </div>

              <div className="flex-1 text-left">
                <span className="text-[11px] font-mono font-bold uppercase">FRANCE</span>
                <p className="text-[9px] opacity-50 italic">Coeff: 0.79</p>
              </div>
            </div>

            {/* Simulated Pitch */}
            <div className={`my-4 relative overflow-hidden h-36 flex flex-col justify-between p-3 border ${
              styleId === 'brutalist' ? 'border-2 border-stone-950 bg-[#166534]' : 'bg-[#14532d] border-emerald-900/60 rounded-xl'
            }`}>
              {/* Pitch grid lines */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-white/10"></div>
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/10"></div>
              <div className="absolute left-0 bottom-4 top-4 w-8 border-r border-y border-white/10"></div>
              <div className="absolute right-0 bottom-4 top-4 w-8 border-l border-y border-white/10"></div>

              {/* Soccer Ball */}
              <div 
                className={`absolute w-5.5 h-5.5 rounded-full bg-white border shadow-lg flex items-center justify-center text-[10px] font-bold text-stone-950 transition-all duration-700 ${
                  styleId === 'brutalist' ? 'border-2 border-stone-950 shadow-none' : 'border-blue-500'
                }`}
                style={{ 
                  left: `${match.ballPosition}%`, 
                  top: '38%',
                }}
              >
                ⚽
              </div>

              {/* Commentary ribbon */}
              <div className={`z-10 px-3 py-1.5 rounded text-[10px] font-mono text-center flex items-center justify-center gap-1.5 mt-auto border ${
                styleId === 'brutalist' ? 'bg-white border-2 border-stone-950 text-stone-950' : 'bg-black/85 text-zinc-200 border-zinc-800'
              }`}>
                <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>Commentary: "{match.lastActionDescription}"</span>
              </div>
            </div>

            {/* Overrides control grid */}
            <div className={`p-3.5 rounded-lg space-y-2.5 border ${
              styleId === 'brutalist' ? 'bg-[#fafae8] border-2 border-stone-950' : 'bg-current/5 border-current/5'
            }`}>
              <span className="text-[10px] opacity-60 block uppercase font-bold tracking-wider">
                🔧 Interactive Manual Overrides (Simulate Play Events)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => triggerManualEvent('brazil-goal')}
                  className={`py-1.5 px-2 text-[10px] font-bold font-display cursor-pointer ${
                    styleId === 'brutalist'
                      ? 'bg-blue-300 hover:bg-blue-400 border-2 border-stone-950 rounded-none text-stone-950'
                      : 'bg-blue-600 hover:bg-blue-700 text-white rounded-lg'
                  }`}
                >
                  Goal Brazil
                </button>
                <button
                  type="button"
                  onClick={() => triggerManualEvent('france-goal')}
                  className={`py-1.5 px-2 text-[10px] font-bold font-display cursor-pointer ${
                    styleId === 'brutalist'
                      ? 'bg-stone-100 hover:bg-stone-200 border-2 border-stone-950 rounded-none text-stone-950'
                      : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-900 rounded-lg'
                  }`}
                >
                  Goal France
                </button>
                <button
                  type="button"
                  onClick={() => triggerManualEvent('foul-penalty')}
                  className={`py-1.5 px-2 text-[10px] font-bold font-display cursor-pointer ${
                    styleId === 'brutalist'
                      ? 'bg-[#fae155] hover:bg-[#ebd01c] border-2 border-stone-950 rounded-none text-stone-950'
                      : 'bg-[#f59e0b] hover:bg-[#d97706] text-white rounded-lg'
                  }`}
                >
                  Trigger Penalty
                </button>
                <button
                  type="button"
                  onClick={() => triggerManualEvent('venice-check')}
                  className={`py-1.5 px-2 text-[10px] font-bold font-display cursor-pointer ${
                    styleId === 'brutalist'
                      ? 'bg-white hover:bg-stone-100 border-2 border-stone-950 rounded-none text-stone-950'
                      : 'bg-zinc-800 hover:bg-zinc-750 text-white border border-zinc-700 rounded-lg'
                  }`}
                >
                  Execute Query
                </button>
              </div>
            </div>
          </div>

          {/* Active outcome claims */}
          <div className="mt-4 border-t border-current/10 pt-3.5">
            <span className="text-[11px] uppercase tracking-wider opacity-60 block mb-2 font-bold">
              💼 Active Outcome Claims (Live Portfolio Ledger)
            </span>
            <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
              {positions.length === 0 ? (
                <div className="text-center py-2 text-xs font-mono opacity-50">No active positions on chain.</div>
              ) : (
                positions.map((pos) => (
                  <div key={pos.id} className={`p-2.5 flex items-center justify-between text-xs border ${
                    styleId === 'brutalist'
                      ? 'bg-white border-2 border-stone-950 rounded-none text-stone-950'
                      : 'bg-current/5 border-current/5 rounded-lg'
                  }`}>
                    <div>
                      <div className="font-semibold leading-tight">{pos.marketName}</div>
                      <div className="text-[9px] opacity-65 mt-0.5 font-mono">
                        Claimed: <strong className="text-blue-600 font-bold">{pos.selectedOutcome}</strong> • Allocated: ${pos.betAmountUsdc.toFixed(2)} • Odds: {pos.entryOdds}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[11px] font-bold text-emerald-600">
                        ${pos.currentValueUsdc.toFixed(2)}
                      </div>
                      <div className="text-[8px] font-mono opacity-55">Claim Yield</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Action Logs Box */}
        <div className={`xl:col-span-5 flex flex-col justify-between ${t.cardBg}`}>
          <div>
            <div className="flex items-center gap-1.5 border-b pb-3 mb-3 border-current/10">
              <Terminal className="w-4 h-4 text-blue-500 animate-spin" />
              <h4 className={`text-xs font-bold uppercase tracking-wider ${t.titleText}`}>
                1Shot Broadcast Action Logs
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2 text-[11px] font-mono max-h-[380px] min-h-[300px]">
              {logs.map((log) => {
                let badgeClass = "text-stone-500 bg-current/5";
                let logWrapper = `p-2.5 rounded border border-current/5 bg-current/5`;

                if (log.source === 'venice') {
                  badgeClass = "bg-blue-500/10 text-blue-600";
                  logWrapper = `p-2.5 rounded border border-blue-500/20 bg-blue-500/5`;
                } else if (log.source === 'guardrail') {
                  badgeClass = "bg-emerald-500/10 text-emerald-600";
                  logWrapper = `p-2.5 rounded border border-emerald-500/20 bg-emerald-500/5`;
                } else if (log.source === 'relayer') {
                  badgeClass = "bg-purple-500/10 text-purple-600";
                  logWrapper = `p-2.5 rounded border border-purple-500/20 bg-purple-500/5`;
                } else if (log.source === 'contract') {
                  badgeClass = "bg-amber-500/10 text-amber-600";
                  logWrapper = `p-2.5 rounded border border-amber-500/20 bg-amber-500/5 font-semibold`;
                }

                return (
                  <div key={log.id} className={logWrapper}>
                    <div className="flex items-center justify-between border-b border-current/5 pb-1 mb-1 text-[9px]">
                      <span className={`px-1 rounded font-bold uppercase font-mono ${badgeClass}`}>
                        {log.source === 'venice' ? 'Venice AI' : log.source.toUpperCase()}
                      </span>
                      <span className="opacity-40">{log.timestamp} UTC</span>
                    </div>
                    <div className="opacity-90 leading-relaxed font-sans text-xs">{log.message}</div>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>

          <div className="border-t pt-3 mt-3 border-current/10 flex items-center justify-between">
            <span className="text-[10px] opacity-40 font-mono">Routing ledger active</span>
            
            <button
              type="button"
              onClick={() => {
                setLogs(INITIAL_LOGS);
                setStats({
                  balanceUsdc: 1000.00,
                  totalBetsPlaced: 0,
                  totalVolumeUsdc: 0.00,
                  pnlUsdc: 0.00,
                  agentStatus: 'active'
                });
                setPositions([]);
                addLog('system', 'Telemetry session reset. Initializing fresh nonces...', 'info');
              }}
              className={`flex items-center gap-1.5 font-mono text-[9px] font-bold py-1 px-2.5 cursor-pointer ${
                styleId === 'brutalist'
                  ? 'bg-white border-2 border-stone-950 text-stone-950 rounded-none'
                  : 'bg-current/5 hover:bg-current/10 text-current border border-current/10 rounded'
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              Reset Logs
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
