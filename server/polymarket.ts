/**
 * Polymarket market board — real World Cup markets over the public Gamma API
 * (read-only, no key). All markets of the configured event(s) are tracked;
 * per-market repricings become trade signals for the agent. Execution still
 * settles on our Sepolia mirror market (mainnet CLOB = roadmap, CTF V2
 * EIP-1271).
 */
import { EventEmitter } from 'node:events';
import { pushLog } from './state';

const GAMMA = 'https://gamma-api.polymarket.com';
const DEFAULT_EVENT_SLUGS = ['world-cup-winner'];

export type MarketQuote = {
  slug: string;
  question: string;
  eventSlug: string;
  yesPrice: number; // 0..1
  noPrice: number;
  volume24h: number;
  /** absolute change of yesPrice since previous poll (or injected) */
  delta: number;
  injected?: boolean; // demo dislocation, not a real quote move
  polymarketUrl: string;
  updatedAt: number;
};

export type MarketSignal = {
  market: MarketQuote;
  kind: 'reprice' | 'injected';
};

const quotes = new Map<string, MarketQuote>();
export const marketSignals = new EventEmitter();

export function getMarketBoard(): MarketQuote[] {
  return [...quotes.values()].sort((a, b) => b.volume24h - a.volume24h);
}

export function getQuote(slug: string): MarketQuote | undefined {
  return quotes.get(slug);
}

/** Demo control: synthetically dislocate one market's quote (labeled). */
export function injectDislocation(slug: string, deltaYes = -0.04): MarketQuote | undefined {
  const q = quotes.get(slug);
  if (!q) return undefined;
  const yes = Math.min(0.99, Math.max(0.01, q.yesPrice + deltaYes));
  const next: MarketQuote = {
    ...q,
    yesPrice: yes,
    noPrice: Math.min(0.99, Math.max(0.01, 1 - yes)),
    delta: yes - q.yesPrice,
    injected: true,
    updatedAt: Date.now(),
  };
  quotes.set(slug, next);
  pushLog('system', 'warning', `⚡ injected dislocation on "${q.question}" — YES ${q.yesPrice.toFixed(3)} → ${yes.toFixed(3)} (demo event)`);
  marketSignals.emit('signal', { market: next, kind: 'injected' } satisfies MarketSignal);
  return next;
}

type GammaMarket = {
  slug?: string;
  question?: string;
  outcomePrices?: string | string[];
  volume24hr?: number | string;
  active?: boolean;
  closed?: boolean;
};

async function fetchEventMarkets(eventSlug: string): Promise<MarketQuote[]> {
  const res = await fetch(`${GAMMA}/events?slug=${encodeURIComponent(eventSlug)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`gamma HTTP ${res.status}`);
  const events = (await res.json()) as Array<{ slug?: string; markets?: GammaMarket[] }>;
  const event = Array.isArray(events) ? events[0] : undefined;
  const out: MarketQuote[] = [];
  for (const m of event?.markets ?? []) {
    if (!m.slug || m.closed || m.active === false) continue;
    const raw = typeof m.outcomePrices === 'string' ? (JSON.parse(m.outcomePrices) as string[]) : (m.outcomePrices ?? []);
    const yes = Number(raw[0]);
    const no = Number(raw[1]);
    if (!Number.isFinite(yes) || !Number.isFinite(no)) continue;
    // skip dead/settled quotes — they make a boring board
    if (yes <= 0.001 || yes >= 0.999) continue;
    out.push({
      slug: m.slug,
      question: m.question ?? m.slug,
      eventSlug,
      yesPrice: yes,
      noPrice: no,
      volume24h: Number(m.volume24hr ?? 0),
      delta: 0,
      polymarketUrl: `https://polymarket.com/event/${eventSlug}/${m.slug}`,
      updatedAt: Date.now(),
    });
  }
  return out;
}

/** signal threshold: absolute yes-price move since last poll */
const REPRICE_THRESHOLD = Number(process.env.POLYMARKET_SIGNAL_DELTA ?? 0.004);

export function startPolymarketFeed(opts: { eventSlugs?: string[]; intervalMs?: number } = {}) {
  const eventSlugs = opts.eventSlugs ?? (process.env.POLYMARKET_EVENTS?.split(',') ?? DEFAULT_EVENT_SLUGS);
  const intervalMs = opts.intervalMs ?? Number(process.env.POLYMARKET_POLL_MS ?? 15_000);
  let failures = 0;

  const tick = async () => {
    try {
      for (const eventSlug of eventSlugs) {
        const fresh = await fetchEventMarkets(eventSlug);
        for (const next of fresh) {
          const prev = quotes.get(next.slug);
          // an injected quote holds until the next REAL move beyond it
          if (prev?.injected && Math.abs(next.yesPrice - prev.yesPrice) < REPRICE_THRESHOLD) continue;
          next.delta = prev ? next.yesPrice - prev.yesPrice : 0;
          quotes.set(next.slug, next);
          if (prev && Math.abs(next.delta) >= REPRICE_THRESHOLD) {
            pushLog(
              'system',
              'info',
              `Polymarket reprice: "${next.question}" YES ${prev.yesPrice.toFixed(3)} → ${next.yesPrice.toFixed(3)} (Δ${next.delta >= 0 ? '+' : ''}${next.delta.toFixed(3)})`,
            );
            marketSignals.emit('signal', { market: next, kind: 'reprice' } satisfies MarketSignal);
          }
        }
      }
      if (quotes.size > 0) marketSignals.emit('board', getMarketBoard());
      failures = 0;
    } catch (e) {
      failures += 1;
      if (failures === 3) {
        pushLog('system', 'warning', `Polymarket feed degraded: ${(e as Error).message}`);
      }
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  pushLog('system', 'info', `Polymarket board live — tracking event(s) ${eventSlugs.join(', ')} every ${intervalMs / 1000}s (Gamma API, read-only)`);
  return () => clearInterval(timer);
}
