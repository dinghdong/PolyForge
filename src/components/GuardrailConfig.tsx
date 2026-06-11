/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, Coins, Calendar, Info, AlertTriangle, Settings2 } from 'lucide-react';
import { AgentConfig, StyleId } from '../types';
import { THEME_PRESETS } from '../styles';

interface GuardrailConfigProps {
  config: AgentConfig;
  onChange: (updates: Partial<AgentConfig>) => void;
  styleId: StyleId;
}

const POLYMARKET_CONTRACTS = [
  { name: "Polymarket Router V2", address: "0x3F2b596c56Cc4DF6cc63EF295F4D7b438da0772A" },
  { name: "CTF Exchange V1", address: "0x4D1b098b67C198F03bC6bf171CeeB1389D91990B" },
];

export default function GuardrailConfig({ config, onChange, styleId }: GuardrailConfigProps) {
  const t = THEME_PRESETS[styleId];

  const handleQuickSpend = (amount: number) => {
    onChange({ maxSpendPerMatch: amount });
    if (config.maxDailyAllowance < amount) {
      onChange({ maxDailyAllowance: amount * 3 });
    }
  };

  const handleQuickDaily = (amount: number) => {
    onChange({ maxDailyAllowance: amount });
  };

  const setPresetDate = (days: number) => {
    const today = new Date();
    today.setDate(today.getDate() + days);
    const dateString = today.toISOString().split('T')[0];
    onChange({ expiryDate: dateString });
  };

  const setSpecificDate = (fixedDate: string) => {
    onChange({ expiryDate: fixedDate });
  };

  const isDailyAllowanceInvalid = config.maxDailyAllowance < config.maxSpendPerMatch;

  return (
    <div id="guardrail-column" className={`${t.cardBg} h-full flex flex-col justify-between transition-all duration-300`}>
      <div className="space-y-4">
        {/* Title */}
        <div className="flex items-center gap-2.5">
          <div className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 ${
            styleId === 'brutalist' ? 'border-2 border-stone-950 bg-green-200' : 'bg-emerald-500/10 text-emerald-500'
          }`}>
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${t.titleText}`}>
              [2] Guardrail Settings
            </h3>
            <p className="text-[10px] opacity-60">Powered by MetaMask Advanced ERC-7715</p>
          </div>
        </div>

        {/* Target Contract */}
        <div>
          <label htmlFor="target-contract" className="text-[11px] font-semibold block mb-1">
            Target Allowed Protocol
          </label>
          <select
            id="target-contract"
            value={config.targetContract}
            onChange={(e) => onChange({ targetContract: e.target.value })}
            className={`w-full ${t.inputClass}`}
          >
            {POLYMARKET_CONTRACTS.map((contract) => (
              <option key={contract.address} value={contract.address}>
                {contract.name}
              </option>
            ))}
          </select>
          <div className="text-[10px] font-mono opacity-50 mt-1 truncate">
            {config.targetContract}
          </div>
        </div>

        {/* Risk Constraints Policy */}
        <div className="space-y-3 pt-1">
          {/* Max Spend per Match */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="spend-input" className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
                Max Spend Per Match
              </label>
              <span className={`text-xs font-mono font-bold ${t.textPrimary}`}>${config.maxSpendPerMatch} USDC</span>
            </div>
            
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                id="spend-input"
                min="1"
                max="500"
                value={config.maxSpendPerMatch}
                onChange={(e) => onChange({ maxSpendPerMatch: Math.max(1, parseInt(e.target.value) || 0) })}
                className={`w-20 font-mono text-center ${t.inputClass}`}
              />
              <input
                type="range"
                min="5"
                max="200"
                step="5"
                value={config.maxSpendPerMatch}
                onChange={(e) => onChange({ maxSpendPerMatch: parseInt(e.target.value) })}
                className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-current/10 rounded-full appearance-none"
              />
            </div>

            {/* Quick Spend Badges */}
            <div className="flex gap-2">
              {[10, 20, 50, 100].map((val) => {
                const isActive = config.maxSpendPerMatch === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickSpend(val)}
                    className={`flex-1 text-[11px] font-mono py-1.5 font-bold uppercase transition-all border-2 border-stone-950 rounded-none cursor-pointer text-center ${
                      isActive
                        ? 'bg-[#3b82f6] text-white shadow-[1px_1px_0px_#000] translate-y-[1px]'
                        : 'bg-white text-stone-950 hover:bg-stone-50 shadow-[2px_2px_0px_#000] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#000] active:translate-y-[1px] active:shadow-[1px_1px_0px_#000]'
                    }`}
                  >
                    ${val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Max Daily Allowance */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="daily-cap-input" className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
                Max Daily Allowance Cap
              </label>
              <span className={`text-xs font-mono font-bold ${t.textPrimary}`}>${config.maxDailyAllowance} USDC</span>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                id="daily-cap-input"
                min="1"
                max="1000"
                value={config.maxDailyAllowance}
                onChange={(e) => onChange({ maxDailyAllowance: Math.max(1, parseInt(e.target.value) || 0) })}
                className={`w-20 font-mono text-center ${t.inputClass}`}
              />
              <input
                type="range"
                min="10"
                max="500"
                step="10"
                value={config.maxDailyAllowance}
                onChange={(e) => onChange({ maxDailyAllowance: parseInt(e.target.value) })}
                className="flex-1 accent-[#3b82f6] cursor-pointer h-1.5 bg-current/10 rounded-full appearance-none"
              />
            </div>

            {/* Quick Daily Badges */}
            <div className="flex gap-2">
              {[50, 100, 200, 450].map((val) => {
                const isActive = config.maxDailyAllowance === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleQuickDaily(val)}
                    className={`flex-1 text-[11px] font-mono py-1.5 font-bold uppercase transition-all border-2 border-stone-950 rounded-none cursor-pointer text-center ${
                      isActive
                        ? 'bg-[#3b82f6] text-white shadow-[1px_1px_0px_#000] translate-y-[1px]'
                        : 'bg-white text-stone-950 hover:bg-stone-50 shadow-[2px_2px_0px_#000] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#000] active:translate-y-[1px] active:shadow-[1px_1px_0px_#000]'
                    }`}
                  >
                    ${val}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Expiry Date */}
        <div>
          <label htmlFor="expiry-date" className="text-[11px] font-semibold block mb-1">
            Session Expiry Boundaries
          </label>
          <input
            type="date"
            id="expiry-date"
            value={config.expiryDate}
            onChange={(e) => onChange({ expiryDate: e.target.value })}
            className={`w-full font-mono ${t.inputClass}`}
          />
          {/* Quick Dates */}
          <div className="flex gap-2 mt-2 flex-wrap">
            <button
              type="button"
              onClick={() => setPresetDate(1)}
              className="text-[10px] font-mono font-bold px-2 py-1 border-2 border-stone-950 rounded-none bg-white text-stone-950 shadow-[1.5px_1.5px_0px_#000] hover:bg-stone-50 hover:translate-y-[-0.5px] hover:shadow-[2px_2px_0px_#000] active:translate-y-[0.5px] active:shadow-[0.5px_0.5px_0px_#000] transition-all cursor-pointer"
            >
              +1 Day
            </button>
            <button
              type="button"
              onClick={() => setPresetDate(7)}
              className="text-[10px] font-mono font-bold px-2 py-1 border-2 border-stone-950 rounded-none bg-white text-stone-950 shadow-[1.5px_1.5px_0px_#000] hover:bg-stone-50 hover:translate-y-[-0.5px] hover:shadow-[2px_2px_0px_#000] active:translate-y-[0.5px] active:shadow-[0.5px_0.5px_0px_#000] transition-all cursor-pointer"
            >
              +7 Days
            </button>
            <button
              type="button"
              onClick={() => setSpecificDate("2026-07-15")}
              className={`text-[10px] font-mono font-bold px-2 py-1 border-2 border-stone-950 rounded-none cursor-pointer transition-all ${
                config.expiryDate === "2026-07-15"
                  ? 'bg-[#fae155] text-stone-950 shadow-[0.5px_0.5px_0px_#000] translate-y-[0.5px]'
                  : 'bg-white text-stone-950 shadow-[1.5px_1.5px_0px_#000] hover:bg-stone-50 hover:translate-y-[-0.5px] hover:shadow-[2px_2px_0px_#000] active:translate-y-[0.5px] active:shadow-[0.5px_0.5px_0px_#000]'
              }`}
            >
              End of WC (07-15)
            </button>
          </div>
        </div>

        {/* Security Restrictions Checkbox Grid */}
        <div className={`p-3 space-y-2 rounded-lg ${
          styleId === 'brutalist' ? 'bg-white border-2 border-stone-950 text-stone-950' : 'bg-current/5'
        }`}>
          <span className="text-[10px] opacity-50 block uppercase font-bold tracking-wider">Granular Restrictions</span>
          
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="only-buy-check"
              checked={config.onlyBuy}
              onChange={(e) => onChange({ onlyBuy: e.target.checked })}
              className="mt-0.5 rounded focus:ring-0 accent-emerald-500 h-3.5 w-3.5 border-current/10"
            />
            <label htmlFor="only-buy-check" className="text-[10px] opacity-80 leading-tight cursor-pointer font-sans select-none">
              <strong>Strict buy() limits:</strong> Block balance deployment avenues other than prediction acquisition.
            </label>
          </div>

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="restrict-sell-check"
              checked={config.restrictSell}
              onChange={(e) => onChange({ restrictSell: e.target.checked })}
              className="mt-0.5 rounded focus:ring-0 accent-emerald-500 h-3.5 w-3.5 border-current/10"
            />
            <label htmlFor="restrict-sell-check" className="text-[10px] opacity-80 leading-tight cursor-pointer font-sans select-none">
              <strong>Restrict sell() mid-game:</strong> Blocks dynamic liquidation signals mid-game to prevent arbitrage bleeding.
            </label>
          </div>

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="forbid-withdraw-check"
              checked={config.forbidWithdrawal}
              onChange={(e) => onChange({ forbidWithdrawal: e.target.checked })}
              className="mt-0.5 rounded focus:ring-0 accent-emerald-500 h-3.5 w-3.5 border-current/10"
            />
            <label htmlFor="forbid-withdraw-check" className="text-[10px] opacity-80 leading-tight cursor-pointer font-sans select-none">
              <strong>Block withdrawals:</strong> Smart account prevents remote fund-withdrawal parameters entirely.
            </label>
          </div>
        </div>
      </div>

      {/* Validation Message */}
      <div className={`border-t ${t.divider} pt-3 mt-4 flex items-center gap-2`}>
        {isDailyAllowanceInvalid ? (
          <div className="flex items-center gap-1.5 text-rose-500 px-2.5 py-1 bg-rose-500/5 border border-rose-500/20 rounded-lg w-full">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 animate-bounce" />
            <span className="text-[9px] leading-tight text-rose-500 font-semibold">
              Warning: Spend beats cap!
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-emerald-600 font-bold text-[10px]">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="font-mono">Guardrails Active & Verified ✅</span>
          </div>
        )}
      </div>
    </div>
  );
}
