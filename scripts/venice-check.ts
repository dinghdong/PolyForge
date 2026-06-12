/**
 * Validate VENICE_API_KEY in .env.local: lists rate limits, runs one tiny
 * chat completion on each mapped model, prints a verdict. Run after pasting
 * the key:  npx tsx scripts/venice-check.ts
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const KEY = process.env.VENICE_API_KEY;
if (!KEY) {
  console.error('VENICE_API_KEY missing — add it to .env.local first (https://venice.ai → Settings → API Keys)');
  process.exit(1);
}
const BASE = process.env.VENICE_URL?.replace(/\/chat\/completions$/, '') ?? 'https://api.venice.ai/api/v1';
const auth = { Authorization: `Bearer ${KEY}` };

// 1) rate limits / balance
try {
  const res = await fetch(`${BASE}/api_keys/rate_limits`, { headers: auth });
  if (res.ok) {
    const json = (await res.json()) as { data?: { balances?: unknown; apiTier?: unknown } };
    console.log('rate limits / balances:', JSON.stringify(json.data ?? json).slice(0, 400));
  } else {
    console.log(`rate_limits endpoint: HTTP ${res.status} (non-fatal)`);
  }
} catch (e) {
  console.log(`rate_limits check skipped: ${(e as Error).message}`);
}

// 2) one tiny completion per mapped model
const models = ['llama-3.3-70b', 'deepseek-v4-flash', 'hermes-3-llama-3.1-405b'];
let okCount = 0;
for (const model of models) {
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        model,
        max_tokens: 24,
        messages: [{ role: 'user', content: 'Reply with exactly: PONG' }],
      }),
    });
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; error?: unknown };
    if (res.ok && json.choices?.[0]?.message?.content) {
      okCount += 1;
      console.log(`✅ ${model}: ${JSON.stringify(json.choices[0].message.content.trim().slice(0, 40))}`);
    } else {
      console.log(`❌ ${model}: HTTP ${res.status} ${JSON.stringify(json.error ?? json).slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`❌ ${model}: ${(e as Error).message}`);
  }
}

console.log(okCount > 0 ? `\nVenice key WORKS (${okCount}/${models.length} models) — server will log "Venice AI: live"` : '\nKey failed on all models — check tier/balance on venice.ai');
process.exit(okCount > 0 ? 0 : 1);
