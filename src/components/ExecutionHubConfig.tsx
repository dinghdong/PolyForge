/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Zap, ShieldAlert, Layers, Webhook } from 'lucide-react';
import { AgentConfig, StyleId } from '../types';
import { THEME_PRESETS } from '../styles';

interface ExecutionHubConfigProps {
  config: AgentConfig;
  onChange: (updates: Partial<AgentConfig>) => void;
  styleId: StyleId;
}

export default function ExecutionHubConfig({ config, onChange, styleId }: ExecutionHubConfigProps) {
  const t = THEME_PRESETS[styleId];

  const handleToggleGas = () => {
    onChange({ gasAbstraction: !config.gasAbstraction });
  };

  return (
    <div id="execution-hub-column" className={`${t.cardBg} h-full flex flex-col justify-between transition-all duration-300`}>
      <div className="space-y-4">
        {/* Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 border-2 border-stone-950 bg-purple-200">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${t.titleText}`}>[3] Execution Hub</h3>
            <p className="text-[10px] opacity-60">1Shot Permissionless Relayer · Ethereum Sepolia</p>
          </div>
        </div>

        {/* Relayer Mode */}
        <div>
          <span className="text-[11px] font-semibold block mb-2">Relayer Mode</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChange({ relayerMode: '1shot' })}
              className={`p-2.5 text-left border transition-all ${
                config.relayerMode === '1shot'
                  ? 'bg-[#3b82f6] text-white border-2 border-stone-950 font-bold shadow-[2px_2px_0px_#000]'
                  : 'bg-transparent border-current/10 opacity-70 hover:opacity-100'
              } border-2 border-stone-950 rounded-none`}
            >
              <div className="text-xs font-bold leading-none flex items-center gap-1">
                <span>⚡ 1Shot</span>
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
              </div>
              <p className="text-[9px] opacity-60 mt-1 leading-tight">
                ERC-7710 redemption, fees in <strong>USDC</strong>. No signup, no paymaster.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onChange({ relayerMode: 'standard' })}
              className={`p-2.5 text-left border transition-all ${
                config.relayerMode === 'standard'
                  ? 'bg-[#fae155] border-2 border-stone-950 text-stone-950 font-bold shadow-[2px_2px_0px_#000]'
                  : 'bg-transparent border-current/10 opacity-70 hover:opacity-100'
              } border-2 border-stone-950 rounded-none`}
            >
              <div className="text-xs font-semibold leading-none">🐢 Self-send</div>
              <p className="text-[9px] opacity-60 mt-1 leading-tight">
                Wallet signs every tx. Needs ETH for gas.
              </p>
            </button>
          </div>
        </div>

        {/* Gas Abstraction */}
        <div className="p-3 border rounded-xl space-y-3 bg-white border-2 border-stone-950 text-stone-950">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold block">Gas Abstraction (EIP-7702)</span>
              <p className="text-[9px] opacity-60 mt-0.5">EOA upgraded to smart account via the relayer</p>
            </div>
            <button
              type="button"
              onClick={handleToggleGas}
              className={`w-9 h-5 rounded-full p-0.5 transition-all focus:outline-none border-2 border-stone-950 bg-white ${config.gasAbstraction ? 'bg-purple-600' : 'bg-current/20'}`}
            >
              <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform bg-stone-950 border border-stone-950 ${config.gasAbstraction ? 'translate-x-4.5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="text-[10px] leading-relaxed border-t border-current/10 pt-2 opacity-85">
            {config.gasAbstraction ? (
              <span className="text-purple-600 font-medium">
                ✅ Active: wallet holds <strong>0 ETH</strong> forever — relayer fees come out of the USDC budget.
              </span>
            ) : (
              <span className="opacity-60 flex items-center gap-1 font-mono">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                Off: wallet must hold Sepolia ETH for gas.
              </span>
            )}
          </div>
        </div>

        {/* Status feedback */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] font-semibold flex items-center gap-1">
              <Webhook className="w-3 h-3 opacity-60" />
              Status Feedback
            </span>
            <span className={`text-[11px] font-mono font-bold ${t.textPrimary}`}>webhooks</span>
          </div>
          <div className={`w-full font-mono text-[10px] p-2.5 border-2 border-stone-950 bg-white leading-relaxed`}>
            Ed25519-signed relayer webhooks (submitted → confirmed) verified against the public JWKS — no polling.
          </div>
          <span className="text-[9px] opacity-50 block leading-relaxed mt-1.5 font-sans">
            ℹ️ Every bundle is pre-validated with relayer_estimate7710Transaction before submission — over-budget bets
            are rejected by the on-chain caveat enforcer.
          </span>
        </div>
      </div>

      {/* Bottom status */}
      <div className={`border-t ${t.divider} pt-3.5 mt-4 flex items-center justify-between`}>
        <span className="text-[10px] opacity-50 font-mono">Relayer:</span>
        <div className="flex items-center gap-1 text-purple-600 font-semibold text-[10px]">
          <Layers className="w-3.5 h-3.5" />
          <span className="font-mono">relayer.1shotapi.dev · Sepolia</span>
        </div>
      </div>
    </div>
  );
}
