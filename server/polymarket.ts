/**
 * Polymarket price feed — real market data over the public Gamma API
 * (no key, read-only). The selected market's outcome prices become the
 * odds layer of the live console; meaningful repricings emit odds-shift
 * signals the agent can act on. Execution still settles on our Sepolia
 * mirror market (mainnet CLOB integration = roadmap, CTF Exchange V2
 * EIP-1271).
 */
import { pushLog } from './state';
import type { MatchSimulator } from './simulator';

const GAMMA = 'https://gamma-api.polymarket.com';
const DEFAULT_SLUG = 'will-brazil-win-the-2026-fifa-world-cup-183';

export type PolymarketState = {
  slug: string;
  question: string;
  yesPrice: number; // 0..1
  noPrice: number;
  fetchedAt: number;
};

let current: PolymarketState | undefined;
export function getPolymarketState(): PolymarketState | undefined {
  return current;
}

async function fetchMarket(slug: string): Promise<PolymarketState | undefined> {
  const res = await fetch(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`gamma HTTP ${res.status}`);
  const list = (await res.json()) as Array<{
    question?: string;
    outcomePrices?: string | string[];
    active?: boolean;
    closed?: boolean;
  }>;
  const m = Array.isArray(list) ? list[0] : undefined;
  if (!m) return undefined;
  // gamma sometimes returns outcomePrices as a JSON-encoded string
  const raw = typeof m.outcomePrices === 'string' ? (JSON.parse(m.outcomePrices) as string[]) : (m.outcomePrices ?? []);
  const yes = Number(raw[0]);
  const no = Number(raw[1]);
  if (!Number.isFinite(yes) || !Number.isFinite(no)) return undefined;
  return { slug, question: m.question ?? slug, yesPrice: yes, noPrice: no, fetchedAt: Date.now() };
}

/**
 * Start polling. Real prices flow into the simulator's odds layer unless a
 * manual goal injection recently shocked them (the simulator owns that
 * suppression window — demo determinism beats live data for a few seconds).
 */
export function startPolymarketFeed(simulator: MatchSimulator, opts: { slug?: string; intervalMs?: number } = {}) {
  const slug = opts.slug ?? process.env.POLYMARKET_SLUG ?? DEFAULT_SLUG;
  const intervalMs = opts.intervalMs ?? Number(process.env.POLYMARKET_POLL_MS ?? 10_000);
  let failures = 0;

  const tick = async () => {
    try {
      const next = await fetchMarket(slug);
      if (!next) throw new Error('market not found / unparseable');
      const prev = current;
      current = next;
      failures = 0;
      simulator.setExternalOdds(next.yesPrice, next.noPrice, `Polymarket: ${next.question}`);
      if (prev && Math.abs(prev.yesPrice - next.yesPrice) >= 0.005) {
        pushLog(
          'system',
          'info',
          `Polymarket reprice: "${next.question}" YES ${prev.yesPrice.toFixed(3)} → ${next.yesPrice.toFixed(3)}`,
        );
      }
    } catch (e) {
      failures += 1;
      if (failures === 3) {
        pushLog('system', 'warning', `Polymarket feed degraded (${(e as Error).message}) — simulator odds take over until it recovers`);
      }
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  pushLog('system', 'info', `Polymarket feed started — mirroring "${slug}" every ${intervalMs / 1000}s (Gamma API, read-only)`);
  return () => clearInterval(timer);
}
