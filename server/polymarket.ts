/**
 * Polymarket World Cup data layer — real markets over the public Gamma API
 * (read-only, no key).
 *
 * Two sections:
 *   matches — per-match moneyline events (slug `fifwc-xxx-yyy-YYYY-MM-DD`,
 *             exactly 3 binary markets: home win / away win / draw). The
 *             agent analyses these daily — Max Spend Per Match, Daily
 *             Allowance and Session Expiry guardrails map 1:1.
 *   futures — the championship "World Cup Winner" board (liquid, signal-rich).
 *
 * Per-market repricings emit trade signals. Execution settles on our Sepolia
 * mirror market (mainnet CLOB = roadmap, CTF Exchange V2 EIP-1271).
 */
import { EventEmitter } from 'node:events';
import { pushLog } from './state';

const GAMMA = 'https://gamma-api.polymarket.com';
const WC_TAG_ID = '102232'; // fifa-world-cup
const FUTURES_EVENT_SLUG = 'world-cup-winner';
const MAIN_MATCH_SLUG = /^fifwc-[a-z]{3}-[a-z]{3}-\d{4}-\d{2}-\d{2}$/;
const MAX_TRACKED_MATCHES = Number(process.env.POLYMARKET_MAX_MATCHES ?? 10);

export type MarketQuote = {
  slug: string;
  question: string;
  /** short outcome label: team name or "Draw" (matches) / country (futures) */
  label: string;
  matchSlug?: string; // parent match event (undefined for futures)
  matchTitle?: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  delta: number;
  injected?: boolean;
  polymarketUrl: string;
  updatedAt: number;
};

export type MatchGroup = {
  eventSlug: string;
  title: string; // "Brazil vs. Morocco"
  endDate?: string;
  polymarketUrl: string;
  markets: MarketQuote[]; // [home, draw?, away] as returned
};

export type BoardSnapshot = {
  matches: MatchGroup[];
  futures: MarketQuote[];
};

export type MarketSignal = {
  market: MarketQuote;
  kind: 'reprice' | 'injected';
};

const quotes = new Map<string, MarketQuote>(); // all tracked markets by slug
let matchGroups: MatchGroup[] = [];
let futuresList: MarketQuote[] = [];

export const marketSignals = new EventEmitter();

export function getBoard(): BoardSnapshot {
  return { matches: matchGroups, futures: futuresList };
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
  rebuildViews();
  pushLog('system', 'warning', `⚡ injected dislocation on "${q.question}" — YES ${q.yesPrice.toFixed(3)} → ${yes.toFixed(3)} (demo event)`);
  marketSignals.emit('signal', { market: next, kind: 'injected' } satisfies MarketSignal);
  marketSignals.emit('board', getBoard());
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

type GammaEvent = {
  slug?: string;
  title?: string;
  endDate?: string;
  closed?: boolean;
  active?: boolean;
  markets?: GammaMarket[];
};

async function getJson<T>(url: string): Promise<T> {
  // the local proxy route to gamma-api can be flaky — retry network errors
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`gamma HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastError = e as Error;
      const msg = lastError.message ?? '';
      if (!/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket|terminated/i.test(msg) || attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastError ?? new Error('gamma fetch failed');
}

function parsePrices(m: GammaMarket): { yes: number; no: number } | undefined {
  const raw = typeof m.outcomePrices === 'string' ? (JSON.parse(m.outcomePrices) as string[]) : (m.outcomePrices ?? []);
  const yes = Number(raw[0]);
  const no = Number(raw[1]);
  if (!Number.isFinite(yes) || !Number.isFinite(no)) return undefined;
  return { yes, no };
}

function labelFor(question: string, matchTitle?: string): string {
  if (/draw/i.test(question)) return 'Draw';
  const m = question.match(/^Will (.+?) win/i);
  if (m) return m[1];
  return matchTitle ?? question.slice(0, 24);
}

/** Update the quotes map from a fresh GammaMarket; returns the new quote or
 *  undefined when unparseable. Emits a reprice signal on meaningful moves. */
const REPRICE_THRESHOLD = Number(process.env.POLYMARKET_SIGNAL_DELTA ?? 0.004);

function upsertQuote(m: GammaMarket, base: Omit<MarketQuote, 'slug' | 'question' | 'label' | 'yesPrice' | 'noPrice' | 'volume24h' | 'delta' | 'updatedAt'>, matchTitle?: string): MarketQuote | undefined {
  if (!m.slug || m.closed || m.active === false) return undefined;
  const p = parsePrices(m);
  if (!p) return undefined;
  const prev = quotes.get(m.slug);
  // an injected quote holds until the next REAL move beyond threshold
  if (prev?.injected && Math.abs(p.yes - prev.yesPrice) < REPRICE_THRESHOLD) return prev;
  const next: MarketQuote = {
    ...base,
    slug: m.slug,
    question: m.question ?? m.slug,
    label: labelFor(m.question ?? '', matchTitle),
    yesPrice: p.yes,
    noPrice: p.no,
    volume24h: Number(m.volume24hr ?? 0),
    delta: prev ? p.yes - prev.yesPrice : 0,
    updatedAt: Date.now(),
  };
  quotes.set(m.slug, next);
  if (prev && Math.abs(next.delta) >= REPRICE_THRESHOLD) {
    pushLog(
      'system',
      'info',
      `Polymarket reprice: "${next.question}" YES ${prev.yesPrice.toFixed(3)} → ${next.yesPrice.toFixed(3)} (Δ${next.delta >= 0 ? '+' : ''}${next.delta.toFixed(3)})`,
    );
    marketSignals.emit('signal', { market: next, kind: 'reprice' } satisfies MarketSignal);
  }
  return next;
}

function rebuildViews() {
  matchGroups = matchGroups.map((g) => ({ ...g, markets: g.markets.map((m) => quotes.get(m.slug) ?? m) }));
  futuresList = futuresList.map((m) => quotes.get(m.slug) ?? m);
}

async function refreshMatches() {
  const events = await getJson<GammaEvent[]>(
    `${GAMMA}/events?tag_id=${WC_TAG_ID}&closed=false&active=true&order=endDate&ascending=true&limit=100`,
  );
  const groups: MatchGroup[] = [];
  for (const e of events) {
    if (!e.slug || !MAIN_MATCH_SLUG.test(e.slug)) continue; // moneyline only — props/corners/etc are roadmap
    const url = `https://polymarket.com/event/${e.slug}`;
    const markets: MarketQuote[] = [];
    for (const m of e.markets ?? []) {
      const q = upsertQuote(m, { matchSlug: e.slug, matchTitle: e.title, polymarketUrl: url }, e.title);
      if (q) markets.push(q);
    }
    if (markets.length === 0) continue;
    // home / draw / away presentation order
    markets.sort((a, b) => (a.label === 'Draw' ? 0 : 1) - (b.label === 'Draw' ? 0 : 1));
    const ordered = [...markets.filter((m) => m.label !== 'Draw'), ...markets.filter((m) => m.label === 'Draw')];
    groups.push({ eventSlug: e.slug, title: e.title ?? e.slug, endDate: e.endDate, polymarketUrl: url, markets: ordered });
    if (groups.length >= MAX_TRACKED_MATCHES) break;
  }
  matchGroups = groups;
}

async function refreshFutures() {
  const events = await getJson<GammaEvent[]>(`${GAMMA}/events?slug=${FUTURES_EVENT_SLUG}`);
  const e = events[0];
  if (!e) return;
  const url = `https://polymarket.com/event/${FUTURES_EVENT_SLUG}`;
  const list: MarketQuote[] = [];
  for (const m of e.markets ?? []) {
    const p = parsePrices(m);
    if (!p || p.yes <= 0.001 || p.yes >= 0.999) continue; // hide settled corpses
    const q = upsertQuote(m, { polymarketUrl: `${url}/${m.slug}` });
    if (q) list.push(q);
  }
  futuresList = list.sort((a, b) => b.yesPrice - a.yesPrice);
}

export function startPolymarketFeed(opts: { intervalMs?: number } = {}) {
  const intervalMs = opts.intervalMs ?? Number(process.env.POLYMARKET_POLL_MS ?? 15_000);
  let failures = 0;

  const tick = async () => {
    try {
      await refreshMatches();
      await refreshFutures();
      marketSignals.emit('board', getBoard());
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
  pushLog(
    'system',
    'info',
    `Polymarket board live — WC match moneylines (tag ${WC_TAG_ID}) + championship futures, every ${intervalMs / 1000}s (Gamma API, read-only)`,
  );
  return () => clearInterval(timer);
}
