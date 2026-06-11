/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Brain, FileText, Sparkles, UploadCloud, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AgentConfig, ModelId, StyleId } from '../types';
import { THEME_PRESETS } from '../styles';

interface AIBrainConfigProps {
  config: AgentConfig;
  onChange: (updates: Partial<AgentConfig>) => void;
  styleId: StyleId;
}

const PRESET_PERSONAS = [
  {
    name: "⚽ Underdog Statistician",
    description: "You are a statistics-driven World Cup analyst who focuses on underdog markets. You capitalize on historical tournament momentum patterns and algorithmic hedge signals.",
  },
  {
    name: "⚡ High-Speed Arber",
    description: "You are a ultra-low-latency hedging agent. Your main metric is cross-market discrepancies between standard sportsbooks and Polymarket, executing high-certainty micro-yield bets.",
  },
  {
    name: "🧠 Deep Sentiment Bot",
    description: "You monitor global social sentiment, news channels, and press conferences. Highly responsive to team injury updates, coach statements, and historical fan indexes.",
  }
];

const PRESET_DATASETS = [
  { name: "FIFA_Stats_WorldCup2026.csv", rows: 14500, size: 420 },
  { name: "Arbitrage_Sports.json", rows: 8900, size: 280 },
  { name: "Underdog_Matches.csv", rows: 6200, size: 195 },
];

export default function AIBrainConfig({ config, onChange, styleId }: AIBrainConfigProps) {
  const [activeTab, setActiveTab] = useState<'model' | 'prompt' | 'data'>('model');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const t = THEME_PRESETS[styleId];

  const handleUploadPreset = (dataset: typeof PRESET_DATASETS[number]) => {
    setUploading(true);
    setUploadProgress(10);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setUploading(false);
          onChange({
            knowledgeFileName: dataset.name,
            knowledgeRowCount: dataset.rows,
            knowledgeSizeKb: dataset.size
          });
          return 100;
        }
        return prev + 25;
      });
    }, 150);
  };

  const handleMockCustomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setUploading(true);
      setUploadProgress(5);
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setUploading(false);
            onChange({
              knowledgeFileName: file.name,
              knowledgeRowCount: Math.floor(Math.random() * 5000) + 1200,
              knowledgeSizeKb: Math.floor(file.size / 1024) || 28
            });
            return 100;
          }
          return prev + 20;
        });
      }, 100);
    }
  };

  return (
    <div id="ai-brain-column" className={`${t.cardBg} h-full flex flex-col justify-between transition-all duration-300`}>
      <div>
        {/* Column Title */}
        <div className="flex items-center gap-2.5 mb-5">
          <div className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 ${
            styleId === 'brutalist' ? 'border-2 border-stone-950 bg-blue-300' : 'bg-blue-500/10 text-blue-500'
          }`}>
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${t.titleText}`}>
              [1] AI Brain Setup
            </h3>
            <p className="text-[10px] opacity-60">Powered by Venice AI (Zero-Knowledge LLM)</p>
          </div>
        </div>

        {/* Tab Selection Navigation */}
        <div className={`flex border-b ${t.divider} mb-4 gap-1`}>
          {(['model', 'prompt', 'data'] as const).map((tab) => {
            const label = tab === 'model' ? 'Model Input' : tab === 'prompt' ? 'Prompt Profile' : 'Data Knowledge';
            const isActive = activeTab === tab;
            let activeTabClass = '';
            
            if (isActive) {
              activeTabClass = 'bg-[#3b82f6] text-white border-2 border-stone-950 font-bold border-b-0';
            } else {
              activeTabClass = 'text-zinc-500 hover:text-current border-b border-transparent';
            }

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 text-[11px] font-medium px-1 rounded-t-lg transition-all ${activeTabClass}`}
              >
                {label}
                {tab === 'data' && config.knowledgeRowCount > 0 && (
                  <span className="inline-block ml-1 w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab 1: base model */}
        {activeTab === 'model' && (
          <div className="space-y-4 animate-in fade-in duration-100">
            <div>
              <label htmlFor="model-select" className={`text-[11px] font-semibold block mb-1.5 ${t.textPrimary}`}>
                Private Base LLM Instance
              </label>
              <select
                id="model-select"
                value={config.modelId}
                onChange={(e) => onChange({ modelId: e.target.value as ModelId })}
                className={`w-full ${t.inputClass}`}
              >
                <option value="venice-llama3-70b">Venice Llama-3-70B (Encrypted)</option>
                <option value="deepseek-r1-70b">Venice DeepSeek R1-70B (Logic)</option>
                <option value="hermes3-llama8b">Hermes-3-Llama-3-8B (Raw Speed)</option>
              </select>
            </div>

            {/* Config Specs Banner */}
            <div className={`p-3 rounded-lg text-[11px] space-y-1.5 ${
              styleId === 'brutalist' ? 'bg-[#f4f4f2] border-2 border-stone-950 text-stone-950' : 'bg-black/10 border border-current/10'
            }`}>
              <div className="flex justify-between">
                <span className="opacity-60">Inference:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Zero-Knowledge RPC</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">Signer Envelope:</span>
                <span>Session Key Restricted</span>
              </div>
              
              <div className="text-[10px] leading-relaxed border-t border-current/10 pt-1.5 opacity-80 font-sans">
                {config.modelId === 'venice-llama3-70b' && (
                  <span>🛡️ Balanced secure query path. Average prompt evaluation decision time: 1.2s.</span>
                )}
                {config.modelId === 'deepseek-r1-70b' && (
                  <span>🧩 Deep rational chain-of-thought, optimizes complex hedging ratios. Decision time: 2.8s.</span>
                )}
                {config.modelId === 'hermes3-llama8b' && (
                  <span>⚡ Minimal-latency, hyper-responsive for dynamic prediction markets. Decision time: <span className="text-blue-500 font-mono">0.3s</span>.</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: prompts */}
        {activeTab === 'prompt' && (
          <div className="space-y-3.5 animate-in fade-in duration-100">
            <div className="flex items-center justify-between">
              <label htmlFor="prompt-persona" className={`text-[11px] font-semibold ${t.textPrimary}`}>
                Prompt Persona Specification
              </label>
              <span className="text-[10px] opacity-40 font-mono">
                {config.prompt.length} chars
              </span>
            </div>

            <textarea
              id="prompt-persona"
              value={config.prompt}
              onChange={(e) => onChange({ prompt: e.target.value })}
              className={`w-full h-32 resize-none leading-relaxed ${t.inputClass}`}
              placeholder="Configure autonomous persona limits..."
            />

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] opacity-50 block uppercase tracking-wider font-semibold">Core Target Presets</span>
              <div className="space-y-2 mt-2">
                {PRESET_PERSONAS.map((preset) => {
                  const isActive = config.prompt === preset.description;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => onChange({ prompt: preset.description })}
                      className={`w-full text-left p-2.5 border-2 border-stone-950 font-sans text-[11px] rounded-none cursor-pointer transition-all ${
                        isActive
                          ? 'bg-[#3b82f6] text-white shadow-[1px_1px_0px_#000] translate-y-[1px]'
                          : 'bg-white text-stone-950 shadow-[2px_2px_0px_#000] hover:bg-stone-50 hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#000] active:translate-y-[1px] active:shadow-[1px_1px_0px_#000]'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1.5">{preset.name}</div>
                      <div className="truncate mt-1 opacity-85 font-medium">{preset.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: knowledges */}
        {activeTab === 'data' && (
          <div className="space-y-4 animate-in fade-in duration-100">
            <div>
              <span className={`text-[11px] font-semibold block mb-1.5 ${t.textPrimary}`}>
                Inject Live Reference Datasets
              </span>
              
              {/* Fake Upload Drag Box */}
              <div className={`border border-dashed p-4 text-center cursor-pointer transition-colors relative ${
                styleId === 'brutalist' ? 'border-2 border-stone-950 bg-white' : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-500'
              }`}>
                <input
                  type="file"
                  id="knowledge-file-upload"
                  accept=".csv,.json,.xlsx"
                  onChange={handleMockCustomUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={uploading}
                />
                <UploadCloud className="w-7 h-7 mx-auto mb-1.5 opacity-50 animate-pulse" />
                <p className="text-xs font-semibold">Drag or browse training feed</p>
                <p className="text-[9px] opacity-50 mt-1">Accepts industry CSV, JSON spreadsheets</p>
              </div>
            </div>

            {/* Preset Training Materials */}
            <div className="space-y-1.5">
              <span className="text-[10px] opacity-50 block uppercase tracking-wider font-semibold">Static Knowledge Matrices</span>
              <div className="space-y-2 mt-2">
                {PRESET_DATASETS.map((data) => {
                  const isActive = config.knowledgeFileName === data.name;
                  return (
                    <button
                      key={data.name}
                      type="button"
                      onClick={() => handleUploadPreset(data)}
                      className={`w-full flex items-center justify-between p-2.5 border-2 border-stone-950 rounded-none cursor-pointer text-left transition-all ${
                        isActive
                          ? 'bg-[#fae155] text-stone-950 shadow-[1px_1px_0px_#000] translate-y-[1px]'
                          : 'bg-white text-stone-950 shadow-[2px_2px_0px_#000] hover:bg-stone-50 hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_#000] active:translate-y-[1px] active:shadow-[1px_1px_0px_#000]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 shrink-0 max-w-[70%]">
                        <FileText className="w-4 h-4 text-stone-950 shrink-0" />
                        <div className="text-[11px] font-mono leading-none font-bold truncate">{data.name}</div>
                      </div>
                      <div className="text-[10px] opacity-65 font-mono font-bold text-right pt-0.5">
                        {(data.rows / 1000).toFixed(1)}k rows
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Uploading progress indicator */}
            {uploading && (
              <div className="bg-current/5 p-2 rounded">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="font-semibold text-blue-500 flex items-center gap-1">
                    Parsing schema...
                  </span>
                  <span className="font-mono">{uploadProgress}%</span>
                </div>
                <div className="w-full h-1 bg-current/10 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-150" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Details */}
      <div className={`border-t ${t.divider} pt-3.5 mt-4 flex items-center justify-between`}>
        <span className="text-[10px] opacity-50 font-mono">Current Knowledge:</span>
        {config.knowledgeRowCount > 0 ? (
          <div className="flex items-center gap-1 text-emerald-600 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono">
              {config.knowledgeFileName.length > 18 ? `${config.knowledgeFileName.slice(0,15)}...` : config.knowledgeFileName}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-zinc-500">
            <AlertCircle className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono">No CSV attached</span>
          </div>
        )}
      </div>
    </div>
  );
}
