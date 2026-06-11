/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Calendar, Lock, Key, AlertCircle, RefreshCw } from 'lucide-react';
import { AgentConfig, StyleId } from '../types';
import { THEME_PRESETS } from '../styles';

interface MetaMaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
  config: AgentConfig;
  styleId: StyleId;
}

export default function MetaMaskModal({ isOpen, onClose, onApprove, config, styleId }: MetaMaskModalProps) {
  const [signingStep, setSigningStep] = useState<'review' | 'signing' | 'success'>('review');

  const t = THEME_PRESETS[styleId];

  useEffect(() => {
    if (isOpen) {
      setSigningStep('review');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSign = () => {
    setSigningStep('signing');
    setTimeout(() => {
      setSigningStep('success');
      setTimeout(() => {
        onApprove();
      }, 1200);
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md transition-all duration-300">
      <div 
        id="metamask-modal-container"
        className="w-full max-w-md overflow-hidden transition-all duration-300 bg-white border-3 border-stone-950 text-stone-950 rounded-none shadow-[8px_8px_0px_#000]"
      >
        {/* MetaMask Simulated Top Bar */}
        <div className="px-4 py-3 flex items-center justify-between border-b bg-[#fae155] border-b-3 border-stone-950 font-bold">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center border bg-white border-2 border-stone-950">
              <span className="text-xs">🦊</span>
            </div>
            <div>
              <div className="text-xs font-bold font-display">MetaMask Sign Session</div>
              <div className="text-[9px] opacity-60 font-mono">Smart Account ERC-7715 Engine</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-mono opacity-60">Polygon Core</span>
          </div>
        </div>

        {/* Modal Main Content */}
        {signingStep === 'review' && (
          <div className="p-5">
            {/* Permission Request Header */}
            <div className="text-center mb-5">
              <div className="w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-stone-950 bg-blue-200">
                <Key className="w-5 h-5 bg-transparent" />
              </div>
              <h3 className="text-sm font-bold tracking-tight uppercase">Cryptographic Signature Request</h3>
              <p className="text-[11px] opacity-65 mt-1 max-w-[280px] mx-auto leading-normal">
                Authorize the decision agent with restricted access keys to Polymarket's Router contracts.
              </p>
            </div>

            {/* Constraints Card */}
            <div className="p-4 space-y-3 mb-5 border bg-white border-2 border-stone-950">
              <div className="flex items-center justify-between border-b border-stone-950 pb-2">
                <span className="text-[11px] opacity-60 font-medium">Target Contract</span>
                <span className="text-[10px] font-mono font-bold">
                  {config.targetContract.includes('V2') ? 'Polymarket Router V2' : 'CTF Exchange V1'}
                </span>
              </div>

              {/* Policy Metrics */}
              <div className="grid grid-cols-2 gap-3 py-1 text-center">
                <div className="p-2.5 bg-white border-2 border-stone-950">
                  <div className="text-[9px] opacity-50 uppercase font-mono tracking-wider font-semibold">Max Match Spend</div>
                  <div className="text-sm font-black font-mono mt-0.5">${config.maxSpendPerMatch} USDC</div>
                </div>
                <div className="p-2.5 bg-white border-2 border-stone-950">
                  <div className="text-[9px] opacity-50 uppercase font-mono tracking-wider font-semibold">Daily Allowance</div>
                  <div className="text-sm font-black font-mono mt-0.5">${config.maxDailyAllowance} USDC</div>
                </div>
              </div>

              {/* Guardrail Rules Checklist */}
              <div className="space-y-1 text-[10px] leading-relaxed font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                  <span>Execution limit: {config.onlyBuy ? 'Enabled strict buy()' : 'Standard actions permitted'}</span>
                </div>
                {config.restrictSell && (
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                    <span>Forbid sell() liquidation mid-intervals</span>
                  </div>
                )}
                {config.forbidWithdrawal && (
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                    <span>Prevent direct custom fund extraction</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 opacity-60 shrink-0" />
                  <span>Expiry Boundary: <strong className="font-mono">{config.expiryDate}</strong></span>
                </div>
              </div>
            </div>

            {/* Validation detail */}
            <div className="p-2.5 border flex items-center gap-2 text-[10px] mb-5 bg-[#a7f3d0] border-2 border-stone-950 text-stone-950">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-550" />
              <div className="leading-tight font-mono">
                <strong>ERC-7715 keys active:</strong> 
                {config.gasAbstraction ? ' relayer gas sponsor session included.' : ' standard matic fees query.'}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-4 text-xs font-semibold cursor-pointer border-2 border-stone-950 bg-white hover:bg-stone-50 rounded-none text-stone-950"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={handleSign}
                className="py-2 px-4 text-xs font-bold cursor-pointer bg-[#fae155] hover:bg-[#ebd01c] border-2 border-stone-950 text-stone-950 rounded-none"
              >
                Approve & Sign
              </button>
            </div>
          </div>
        )}

        {signingStep === 'signing' && (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            <RefreshCw className="w-9 h-9 text-[#ff8f00] animate-spin mb-4" />
            <h4 className="text-xs font-bold font-mono">Awaiting External Approve</h4>
            <p className="text-[11px] opacity-65 mt-2 max-w-[270px] leading-relaxed">
              Confirm key signing parameter check on your hardware wallet or MetaMask popup.
            </p>
          </div>
        )}

        {signingStep === 'success' && (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border-2 border-stone-950 flex items-center justify-center mb-4 text-emerald-600">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h4 className="text-xs font-bold text-emerald-600">Cryptographically Signed</h4>
            <p className="text-[11px] opacity-60 mt-2">
              Keys securely delegated. Launching live tracking session.
            </p>
          </div>
        )}

        {/* Footer info lock */}
        <div className="px-4 py-3 text-[9px] opacity-50 text-center border-t border-stone-950 flex items-center justify-center gap-1 bg-stone-100 font-mono">
          <AlertCircle className="w-3.5 h-3.5" />
          By signing you retain custody. Security rules enforce limits.
        </div>
      </div>
    </div>
  );
}
