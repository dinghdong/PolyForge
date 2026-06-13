/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Calendar, Key, AlertCircle, RefreshCw, Bot, FlaskConical } from 'lucide-react';
import { AgentConfig, StyleId } from '../types';
import { api, type ServerState } from '../lib/api';
import { connectWallet, ensureSepolia, requestAgentPermission } from '../lib/wallet';

interface MetaMaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
  config: AgentConfig;
  styleId: StyleId;
  copyTrade?: boolean;
}

export default function MetaMaskModal({ isOpen, onClose, onApprove, config, copyTrade }: MetaMaskModalProps) {
  const [step, setStep] = useState<'review' | 'signing' | 'success' | 'error'>('review');
  const [error, setError] = useState('');
  const [server, setServer] = useState<ServerState | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('review');
      setError('');
      void api.getState().then(setServer).catch(() => setServer(null));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const saveConfig = () =>
    api.saveAgentConfig({
      agentId: config.agentId,
      modelId: config.modelId,
      prompt: config.prompt,
      maxSpendPerMatch: config.maxSpendPerMatch,
      maxDailyAllowance: config.maxDailyAllowance,
      expiryDate: config.expiryDate,
      copyTrade: Boolean(copyTrade),
    });

  const handleMetaMask = async () => {
    setStep('signing');
    try {
      if (!server?.agentA || !server?.usdc) throw new Error('PolyForge server unreachable — run `npm run server`');
      await saveConfig();
      await connectWallet();
      await ensureSepolia();
      const context = await requestAgentPermission({
        agentA: server.agentA as `0x${string}`,
        usdc: server.usdc as `0x${string}`,
        dailyBudgetUsdc: config.maxDailyAllowance,
        expiryDate: config.expiryDate,
        justification: `PolyForge betting agent — daily budget $${config.maxDailyAllowance} USDC, expires ${config.expiryDate}`,
      });
      await api.activateBrowser(context);
      setStep('success');
      setTimeout(onApprove, 1200);
    } catch (e) {
      setError((e as Error).message);
      setStep('error');
    }
  };

  const handleHeadless = async () => {
    setStep('signing');
    try {
      await saveConfig();
      await api.activateHeadless();
      setStep('success');
      setTimeout(onApprove, 1200);
    } catch (e) {
      setError((e as Error).message);
      setStep('error');
    }
  };

  const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all duration-300">
      <div
        id="metamask-modal-container"
        className="w-full max-w-md overflow-hidden transition-all duration-300 bg-white border-3 border-stone-950 text-stone-950 rounded-none shadow-[8px_8px_0px_#000]"
      >
        {/* Top Bar */}
        <div className="px-4 py-3 flex items-center justify-between border-b bg-[#fae155] border-b-3 border-stone-950 font-bold">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center border bg-white border-2 border-stone-950">
              <span className="text-xs">🦊</span>
            </div>
            <div>
              <div className="text-xs font-bold font-display">Advanced Permissions (ERC-7715)</div>
              <div className="text-[9px] opacity-60 font-mono">MetaMask Smart Accounts Kit</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-mono opacity-60">Ethereum Sepolia</span>
          </div>
        </div>

        {step === 'review' && (
          <div className="p-5">
            <div className="text-center mb-5">
              <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-stone-950 bg-blue-200">
                <Key className="w-5 h-5 bg-transparent" />
              </div>
              <h3 className="text-sm font-bold tracking-tight uppercase">Grant Scoped Permission to Agent</h3>
              <p className="text-[11px] opacity-65 mt-1 max-w-[300px] mx-auto leading-normal">
                One signature. The agent can then spend <strong>only</strong> your USDC budget, <strong>only</strong> until
                expiry — enforced by on-chain caveats, revocable anytime.
              </p>
            </div>

            {/* Constraints Card — the real ERC-7715 grant parameters */}
            <div className="p-4 space-y-3 mb-5 border bg-white border-2 border-stone-950">
              <div className="flex items-center justify-between border-b border-stone-950 pb-2">
                <span className="text-[11px] opacity-60 font-medium">Delegate (Star Agent A)</span>
                <span className="text-[10px] font-mono font-bold">{short(server?.agentA)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-stone-950/20 pb-2">
                <span className="text-[11px] opacity-60 font-medium">Token</span>
                <span className="text-[10px] font-mono font-bold">USDC (Sepolia) {short(server?.usdc)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 py-1 text-center">
                <div className="p-2.5 bg-white border-2 border-stone-950">
                  <div className="text-[9px] opacity-50 uppercase font-mono tracking-wider font-semibold">Daily Budget (periodic)</div>
                  <div className="text-sm font-black font-mono mt-0.5">${config.maxDailyAllowance} USDC</div>
                </div>
                <div className="p-2.5 bg-white border-2 border-stone-950">
                  <div className="text-[9px] opacity-50 uppercase font-mono tracking-wider font-semibold">Per-Match Cap (agent)</div>
                  <div className="text-sm font-black font-mono mt-0.5">${config.maxSpendPerMatch} USDC</div>
                </div>
              </div>

              <div className="space-y-1 text-[10px] leading-relaxed font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                  <span>Permission type: erc20-token-periodic (transfers only)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                  <span>Agent A redelegates a narrower slice per bet (ERC-7710)</span>
                </div>
                {copyTrade && (
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-blue-500"></span>
                    <span>Copy-trade: follower Agent B gets an even narrower slice</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 opacity-60 shrink-0" />
                  <span>
                    Expiry: <strong className="font-mono">{config.expiryDate}</strong> (World Cup final)
                  </span>
                </div>
              </div>
            </div>

            <div className="p-2.5 border flex items-center gap-2 text-[10px] mb-5 bg-[#a7f3d0] border-2 border-stone-950 text-stone-950">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <div className="leading-tight font-mono">
                <strong>Gas: $0 ETH.</strong> Execution rides the 1Shot relayer; fees paid in USDC from the budget.
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={handleMetaMask}
                className="py-2.5 px-4 text-xs font-bold cursor-pointer bg-[#fae155] hover:bg-[#ebd01c] border-2 border-stone-950 text-stone-950 rounded-none flex items-center justify-center gap-2"
              >
                <span>🦊</span> Sign with MetaMask (ERC-7715)
              </button>
              <button
                type="button"
                onClick={handleHeadless}
                className="py-2.5 px-4 text-xs font-bold cursor-pointer bg-white hover:bg-stone-50 border-2 border-stone-950 text-stone-950 rounded-none flex items-center justify-center gap-2"
                title="Server-held test key signs the session delegation — same on-chain rails, no wallet popup"
              >
                <FlaskConical className="w-3.5 h-3.5" /> Headless Demo Mode
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-4 text-xs font-semibold cursor-pointer border-2 border-stone-950 bg-white hover:bg-stone-50 rounded-none text-stone-950 opacity-70"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {step === 'signing' && (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            <RefreshCw className="w-9 h-9 text-[#ff8f00] animate-spin mb-4" />
            <h4 className="text-xs font-bold font-mono">Awaiting Signature</h4>
            <p className="text-[11px] opacity-65 mt-2 max-w-[270px] leading-relaxed">
              Confirm the permission request in MetaMask. This is the only popup you'll see — every bet afterwards is
              autonomous.
            </p>
          </div>
        )}

        {step === 'success' && (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border-2 border-stone-950 flex items-center justify-center mb-4 text-emerald-600">
              <Bot className="w-7 h-7" />
            </div>
            <h4 className="text-xs font-bold text-emerald-600">Agent Activated</h4>
            <p className="text-[11px] opacity-60 mt-2">Scoped delegation live. Switching to the telemetry console…</p>
          </div>
        )}

        {step === 'error' && (
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <AlertCircle className="w-9 h-9 text-rose-500 mb-3" />
            <h4 className="text-xs font-bold text-rose-600 uppercase">Activation Failed</h4>
            <p className="text-[11px] opacity-75 mt-2 max-w-[300px] leading-relaxed font-mono break-words">{error}</p>
            <button
              type="button"
              onClick={() => setStep('review')}
              className="mt-4 py-2 px-5 text-xs font-bold cursor-pointer bg-white border-2 border-stone-950 rounded-none"
            >
              Back
            </button>
          </div>
        )}

        <div className="px-4 py-3 text-[9px] opacity-50 text-center border-t border-stone-950 flex items-center justify-center gap-1 bg-stone-100 font-mono">
          <AlertCircle className="w-3.5 h-3.5" />
          You retain custody. Revoke the permission in MetaMask at any time — the whole delegation chain dies with it.
        </div>
      </div>
    </div>
  );
}
