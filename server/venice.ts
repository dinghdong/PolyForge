/**
 * Venice AI decision brain — OpenAI-compatible chat completions.
 * Falls back to a deterministic rule engine when VENICE_API_KEY is absent
 * or the call fails, so the demo loop never stalls. Telemetry marks which
 * path produced the decision.
 */
import type { MarketQuote } from './polymarket';

const VENICE_URL = process.env.VENICE_URL ?? 'https://api.venice.ai/api/v1/chat/completions';

// Frontend modelId → real Venice model id (verified against GET /api/v1/models)
const MODEL_MAP: Record<string, string> = {
  'venice-llama3-70b': 'llama-3.3-70b',
  'deepseek-r1-70b': 'deepseek-v4-flash',
  'hermes3-llama8b': 'hermes-3-llama-3.1-405b',
};

export type AgentBrainConfig = {
  modelId: string;
  prompt: string;
  maxSpendPerMatch: number; // USDC units (per-market cap)
  maxDailyAllowance: number;
};

export type BetDecision = {
  action: 'bet' | 'skip';
  outcome: 0 | 1; // 0 = YES, 1 = NO
  amountUsdc: number;
  confidence: number; // 0..1
  rationale: string;
  engine: 'venice' | 'fallback';
  model?: string;
};

export async function decideBet(cfg: AgentBrainConfig, market: MarketQuote, budgetLeftUsdc: number): Promise<BetDecision> {
  const apiKey = process.env.VENICE_API_KEY;
  if (apiKey) {
    try {
      const model = process.env.VENICE_MODEL ?? MODEL_MAP[cfg.modelId] ?? 'llama-3.3-70b';
      const res = await fetch(VENICE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 400,
          messages: [
            {
              role: 'system',
              content: `${cfg.prompt}

You trade two-outcome prediction markets. A repricing signal just fired. Reply with STRICT JSON only:
{"action":"bet"|"skip","outcome":0|1,"amountUsdc":number,"confidence":0..1,"rationale":"one sentence"}
outcome 0 buys YES at the quoted yes price, outcome 1 buys NO.
Hard limits: amountUsdc <= ${Math.min(cfg.maxSpendPerMatch, budgetLeftUsdc)}; skip if confidence < 0.6.`,
            },
            {
              role: 'user',
              content: `${market.matchTitle ? `Match: ${market.matchTitle} (World Cup 2026). ` : ''}Market: "${market.question}" | YES $${market.yesPrice.toFixed(3)} / NO $${market.noPrice.toFixed(3)} | 24h volume $${Math.round(market.volume24h).toLocaleString()} | repricing delta on YES: ${market.delta >= 0 ? '+' : ''}${market.delta.toFixed(3)}${market.injected ? ' (synthetic demo event)' : ''}`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`venice HTTP ${res.status}`);
      const json = (await res.json()) as { choices: { message: { content: string } }[] };
      const text = json.choices?.[0]?.message?.content ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('no JSON in venice reply');
      const parsed = JSON.parse(match[0]) as Partial<BetDecision>;
      const amount = Math.max(0, Math.min(Number(parsed.amountUsdc) || 0, cfg.maxSpendPerMatch, budgetLeftUsdc));
      return {
        action: parsed.action === 'bet' && amount > 0 ? 'bet' : 'skip',
        outcome: parsed.outcome === 1 ? 1 : 0,
        amountUsdc: amount,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        rationale: String(parsed.rationale ?? '').slice(0, 240),
        engine: 'venice',
        model,
      };
    } catch (e) {
      const fb = fallbackDecision(cfg, market, budgetLeftUsdc);
      return { ...fb, rationale: `(venice unavailable: ${(e as Error).message}) ${fb.rationale}` };
    }
  }
  return fallbackDecision(cfg, market, budgetLeftUsdc);
}

/**
 * Deterministic rules on repricing signals:
 *   value persona (underdog/value/cheap keywords) buys the side that just got
 *   cheaper (mean reversion); otherwise rides the momentum of the move.
 */
function fallbackDecision(cfg: AgentBrainConfig, market: MarketQuote, budgetLeftUsdc: number): BetDecision {
  const move = market.delta;
  if (Math.abs(move) < 0.004) {
    return { action: 'skip', outcome: 0, amountUsdc: 0, confidence: 0.3, rationale: 'repricing below threshold', engine: 'fallback' };
  }
  const valuePersona = /underdog|value|cheap|cold|冷门/i.test(cfg.prompt);
  // move<0 → YES got cheaper; value buys YES, momentum buys NO (continuation)
  const outcome: 0 | 1 = valuePersona ? (move < 0 ? 0 : 1) : move > 0 ? 0 : 1;
  const amount = Math.min(cfg.maxSpendPerMatch, budgetLeftUsdc, 5);
  return {
    action: amount > 0 ? 'bet' : 'skip',
    outcome,
    amountUsdc: amount,
    confidence: Math.min(0.95, 0.6 + Math.abs(move) * 8),
    rationale: `${market.injected ? 'injected ' : ''}reprice Δ${move >= 0 ? '+' : ''}${move.toFixed(3)} on YES — ${valuePersona ? 'value entry on the cheapened side' : 'momentum continuation'}`,
    engine: 'fallback',
  };
}
