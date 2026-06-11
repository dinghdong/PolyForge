/**
 * Venice AI decision brain — OpenAI-compatible chat completions.
 * Falls back to a deterministic rule engine when VENICE_API_KEY is absent
 * or the call fails, so the demo loop never stalls. Telemetry marks which
 * path produced the decision.
 */
import type { MatchEvent } from './simulator';

const VENICE_URL = process.env.VENICE_URL ?? 'https://api.venice.ai/api/v1/chat/completions';

const MODEL_MAP: Record<string, string> = {
  'venice-llama3-70b': 'llama-3.3-70b',
  'deepseek-r1-70b': 'deepseek-r1-671b',
  'hermes3-llama8b': 'qwen3-4b',
};

export type AgentBrainConfig = {
  modelId: string;
  prompt: string;
  maxSpendPerMatch: number; // USDC units
  maxDailyAllowance: number;
};

export type BetDecision = {
  action: 'bet' | 'skip';
  outcome: 0 | 1;
  amountUsdc: number;
  confidence: number; // 0..1
  rationale: string;
  engine: 'venice' | 'fallback';
  model?: string;
};

export async function decideBet(
  cfg: AgentBrainConfig,
  event: MatchEvent,
  budgetLeftUsdc: number,
): Promise<BetDecision> {
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

You are deciding bets on a two-outcome prediction market. Reply with STRICT JSON only:
{"action":"bet"|"skip","outcome":0|1,"amountUsdc":number,"confidence":0..1,"rationale":"one sentence"}
Hard limits you must respect: amountUsdc <= ${Math.min(cfg.maxSpendPerMatch, budgetLeftUsdc)}; skip if confidence < 0.6.`,
            },
            {
              role: 'user',
              content: `Match event: ${JSON.stringify(event)}. Outcome 0 = ${event.teamHome}, outcome 1 = ${event.teamAway}. Current odds (implied prob): home ${event.odds.home.toFixed(2)}, away ${event.odds.away.toFixed(2)}.`,
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
      return { ...fallbackDecision(cfg, event, budgetLeftUsdc), rationale: `(venice unavailable: ${(e as Error).message}) ` };
    }
  }
  return fallbackDecision(cfg, event, budgetLeftUsdc);
}

/** Deterministic rules: bet on sharp odds dislocations (goal events). */
function fallbackDecision(cfg: AgentBrainConfig, event: MatchEvent, budgetLeftUsdc: number): BetDecision {
  if (event.kind !== 'goal' && event.kind !== 'odds-shift') {
    return { action: 'skip', outcome: 0, amountUsdc: 0, confidence: 0.2, rationale: 'no actionable signal', engine: 'fallback' };
  }
  const dislocation = Math.abs(event.odds.home - event.odds.away);
  if (dislocation < 0.25) {
    return { action: 'skip', outcome: 0, amountUsdc: 0, confidence: 0.4, rationale: 'odds dislocation below threshold', engine: 'fallback' };
  }
  const underdogFocused = /underdog|cold|冷门/i.test(cfg.prompt);
  const favorite: 0 | 1 = event.odds.home > event.odds.away ? 0 : 1;
  const outcome: 0 | 1 = underdogFocused ? ((1 - favorite) as 0 | 1) : favorite;
  const amount = Math.min(cfg.maxSpendPerMatch, budgetLeftUsdc, 5);
  return {
    action: amount > 0 ? 'bet' : 'skip',
    outcome,
    amountUsdc: amount,
    confidence: 0.6 + Math.min(0.3, dislocation / 2),
    rationale: `${event.kind} at minute ${event.minute}: ${dislocation.toFixed(2)} odds dislocation, ${underdogFocused ? 'underdog' : 'momentum'} strategy`,
    engine: 'fallback',
  };
}
