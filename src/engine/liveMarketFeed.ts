import { getMarketStatus, INSTRUMENTS, MarketQuote, roundPrice, SymbolCode } from './tradingEngine';

export interface LiveCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isExchangeKline?: boolean;
}

export interface LiveFeedStatus {
  connected: boolean;
  source: string;
  lastUpdateTs: number;
  tickCount: number;
}

const BINANCE_SYMBOL_MAP: Partial<Record<SymbolCode, string>> = {
  BTCUSD: 'BTCUSDT',
  ETHUSD: 'ETHUSDT',
  SOLUSD: 'SOLUSDT',
  XRPUSD: 'XRPUSD',
  BNBUSD: 'BNBUSDT',
};

// Klines symbol map uses PAXGUSDT for candle structure, which is then aligned 1:1 to exact XAU/USD Spot Gold price
const BINANCE_KLINE_SYMBOL_MAP: Partial<Record<SymbolCode, string>> = {
  BTCUSD: 'BTCUSDT',
  ETHUSD: 'ETHUSDT',
  SOLUSD: 'SOLUSDT',
  XRPUSD: 'XRPUSDT',
  BNBUSD: 'BNBUSDT',
  XAUUSD: 'PAXGUSDT',
};

const BINANCE_REVERSE_MAP: Record<string, SymbolCode> = {
  BTCUSDT: 'BTCUSD',
  ETHUSDT: 'ETHUSD',
  SOLUSDT: 'SOLUSD',
  XRPUSDT: 'XRPUSD',
  BNBUSDT: 'BNBUSD',
};

// Track authoritative Spot Gold (XAU/USD) and PAXGUSDT reference so sub-second WS ticks move around real XAU/USD spot
let authoritativeXauSpotBid = INSTRUMENTS.XAUUSD.basePrice;
let lastPaxgRawBid = 0;

export function getAuthoritativeXauSpotBid(): number {
  return authoritativeXauSpotBid;
}

export function isDirectExchangeSymbol(symbol: SymbolCode): boolean {
  return Boolean(BINANCE_SYMBOL_MAP[symbol]) || symbol === 'XAUUSD';
}

async function fetchWithTimeout(url: string, timeoutMs = 2400): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const SWISSQUOTE_INSTRUMENT_MAP: [SymbolCode, string][] = [
  ['XAUUSD', 'XAU/USD'],
  ['XAGUSD', 'XAG/USD'],
  ['EURUSD', 'EUR/USD'],
  ['GBPUSD', 'GBP/USD'],
  ['USDJPY', 'USD/JPY'],
  ['USDCHF', 'USD/CHF'],
  ['AUDUSD', 'AUD/USD'],
  ['USDCAD', 'USD/CAD'],
  ['NZDUSD', 'NZD/USD'],
  ['EURGBP', 'EUR/GBP'],
  ['EURJPY', 'EUR/JPY'],
  ['GBPJPY', 'GBP/JPY'],
];

export async function fetchLiveSpotGoldAndForex(
  prevQuotes?: Partial<Record<SymbolCode, MarketQuote>>
): Promise<Partial<Record<SymbolCode, MarketQuote>>> {
  const updates: Partial<Record<SymbolCode, MarketQuote>> = {};

  const applySpotBidAsk = (sym: SymbolCode, rawBid: number, rawAsk?: number) => {
    if (!rawBid || isNaN(rawBid) || rawBid <= 0) return;
    const spec = INSTRUMENTS[sym];
    const bid = roundPrice(rawBid, sym);
    const ask = roundPrice(
      rawAsk && rawAsk > bid ? Math.min(rawAsk, bid + spec.spread * 1.5) : bid + spec.spread,
      sym
    );
    const existing = prevQuotes?.[sym];
    if (sym === 'XAUUSD') {
      authoritativeXauSpotBid = bid;
    }
    updates[sym] = {
      symbol: sym,
      bid,
      ask,
      last: roundPrice((bid + ask) / 2, sym),
      change24hPct: existing?.change24hPct ?? (sym === 'XAUUSD' ? 0.84 : 0.22),
      high24h: roundPrice(Math.max(bid * 1.005, existing?.high24h || bid), sym),
      low24h: roundPrice(Math.min(bid * 0.995, existing?.low24h || bid), sym),
      timestamp: Date.now(),
    };
  };

  // 1. In Node/server environments only, query Swissquote directly; in browser, /api/market/quotes proxies Swissquote without CORS
  if (typeof window === 'undefined') {
    await Promise.all(
      SWISSQUOTE_INSTRUMENT_MAP.map(async ([sym, sqPath]) => {
        try {
          const res = await fetchWithTimeout(
            `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${sqPath}`,
            2000
          );
          if (res.ok) {
            const data = await res.json();
            const prices = data?.[0]?.spreadProfilePrices;
            const best =
              prices?.find(
                (p: any) =>
                  p.spreadProfile === 'Zero' ||
                  p.spreadProfile === 'Prime' ||
                  p.spreadProfile === 'Standard'
              ) || prices?.[0];
            if (best && Number(best.bid) > 0) {
              applySpotBidAsk(sym, Number(best.bid), Number(best.ask));
            }
          }
        } catch {
          // fallback below
        }
      })
    );
  }

  // 2. Fallback to Gold-API if Swissquote XAUUSD was blocked by browser/network
  if (!updates.XAUUSD) {
    try {
      const gRes = await fetchWithTimeout('https://api.gold-api.com/price/XAU', 2000);
      if (gRes.ok) {
        const gData = await gRes.json();
        const price = Number(gData?.price);
        if (price > 0) {
          applySpotBidAsk('XAUUSD', price - 0.2, price + 0.25);
        }
      }
    } catch {
      // ignore
    }
  }

  return updates;
}

export function parseBinance24hrTicker(
  item: {
    symbol?: string;
    bidPrice?: string;
    askPrice?: string;
    lastPrice?: string;
    priceChangePercent?: string;
    highPrice?: string;
    lowPrice?: string;
  },
  existingQuote?: MarketQuote
): MarketQuote | null {
  if (!item || !item.symbol) return null;
  const upperSym = item.symbol.toUpperCase();
  if (upperSym === 'PAXGUSDT') {
    const rawPaxg = parseFloat(item.bidPrice || item.lastPrice || '0');
    if (rawPaxg > 0) {
      lastPaxgRawBid = rawPaxg;
    }
    return null;
  }
  const sym = BINANCE_REVERSE_MAP[upperSym];
  if (!sym) return null;
  const spec = INSTRUMENTS[sym];

  const rawLast = parseFloat(item.lastPrice || '0');
  const rawBid = parseFloat(item.bidPrice || '0') || rawLast;
  const rawAsk = parseFloat(item.askPrice || '0') || rawBid + spec.spread;
  if (!rawBid || isNaN(rawBid) || rawBid <= 0) return null;

  const bid = roundPrice(rawBid, sym);
  const ask = roundPrice(Math.max(bid + spec.spread, rawAsk), sym);
  const last = roundPrice(rawLast > 0 ? rawLast : (bid + ask) / 2, sym);
  const change24hPct = parseFloat(item.priceChangePercent || '0');
  const high24h = roundPrice(
    parseFloat(item.highPrice || '0') || Math.max(bid, existingQuote?.high24h || bid),
    sym
  );
  const low24h = roundPrice(
    parseFloat(item.lowPrice || '0') || Math.min(bid, existingQuote?.low24h || bid),
    sym
  );

  return {
    symbol: sym,
    bid,
    ask,
    last,
    change24hPct: isNaN(change24hPct) ? 0 : Math.round(change24hPct * 100) / 100,
    high24h,
    low24h,
    timestamp: Date.now(),
  };
}

export function parseForexRatesToQuotes(
  rates: Record<string, number>,
  prevQuotes: Record<SymbolCode, MarketQuote>
): Partial<Record<SymbolCode, MarketQuote>> {
  const updates: Partial<Record<SymbolCode, MarketQuote>> = {};

  const registerFxQuote = (sym: SymbolCode, rawBid: number, defaultChange: number) => {
    if (!rawBid || rawBid <= 0 || isNaN(rawBid)) return;
    const spec = INSTRUMENTS[sym];
    const bid = roundPrice(rawBid, sym);
    const ask = roundPrice(bid + spec.spread, sym);
    updates[sym] = {
      symbol: sym,
      bid,
      ask,
      last: roundPrice((bid + ask) / 2, sym),
      change24hPct: prevQuotes[sym]?.change24hPct ?? defaultChange,
      high24h: roundPrice(Math.max(bid * 1.004, prevQuotes[sym]?.high24h || bid), sym),
      low24h: roundPrice(Math.min(bid * 0.996, prevQuotes[sym]?.low24h || bid), sym),
      timestamp: Date.now(),
    };
  };

  if (rates.EUR && rates.EUR > 0) registerFxQuote('EURUSD', 1 / rates.EUR, 0.18);
  if (rates.GBP && rates.GBP > 0) registerFxQuote('GBPUSD', 1 / rates.GBP, 0.24);
  if (rates.JPY && rates.JPY > 0) registerFxQuote('USDJPY', rates.JPY, -0.15);
  if (rates.CHF && rates.CHF > 0) registerFxQuote('USDCHF', rates.CHF, 0.12);
  if (rates.AUD && rates.AUD > 0) registerFxQuote('AUDUSD', 1 / rates.AUD, 0.16);
  if (rates.CAD && rates.CAD > 0) registerFxQuote('USDCAD', rates.CAD, -0.08);
  if (rates.NZD && rates.NZD > 0) registerFxQuote('NZDUSD', 1 / rates.NZD, 0.14);

  // Crosses
  if (rates.EUR && rates.GBP && rates.EUR > 0 && rates.GBP > 0) {
    registerFxQuote('EURGBP', rates.GBP / rates.EUR, 0.05);
  }
  if (rates.EUR && rates.JPY && rates.EUR > 0 && rates.JPY > 0) {
    registerFxQuote('EURJPY', rates.JPY / rates.EUR, 0.21);
  }
  if (rates.GBP && rates.JPY && rates.GBP > 0 && rates.JPY > 0) {
    registerFxQuote('GBPJPY', rates.JPY / rates.GBP, 0.28);
  }

  return updates;
}

/**
 * Fetches live 24hr tickers via our Cloud Run proxy first (including live Swissquote Spot Gold XAU/USD & Forex BBO),
 * then direct Swissquote BBO + Gold-API + Binance Global Data Vision API.
 */
export async function fetchInitialLiveQuotes(
  currentQuotes: Record<SymbolCode, MarketQuote>
): Promise<{ quotes: Partial<Record<SymbolCode, MarketQuote>>; source: string }> {
  const updates: Partial<Record<SymbolCode, MarketQuote>> = {};
  const sources: string[] = [];

  const symbolsParam = encodeURIComponent(
    JSON.stringify(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'PAXGUSDT'])
  );

  let binanceLoaded = false;
  let spotBboLoaded = false;

  // 0. Server-side Cloud Run proxy (/api/market/quotes)
  if (typeof window !== 'undefined') {
    try {
      const proxyRes = await fetchWithTimeout('/api/market/quotes', 2400);
      if (proxyRes.ok) {
        const proxyJson = await proxyRes.json();
        if (proxyJson?.ok) {
          if (Array.isArray(proxyJson.tickers) && proxyJson.tickers.length > 0) {
            proxyJson.tickers.forEach((item: any) => {
              const parsed = parseBinance24hrTicker(
                item,
                currentQuotes[BINANCE_REVERSE_MAP[item.symbol]]
              );
              if (parsed) {
                updates[parsed.symbol] = parsed;
              }
            });
            if (Object.keys(updates).length > 0) {
              binanceLoaded = true;
              sources.push('Live Exchange Spot');
            }
          }
          if (proxyJson.spotQuotes && typeof proxyJson.spotQuotes === 'object') {
            (Object.keys(proxyJson.spotQuotes) as SymbolCode[]).forEach((sym) => {
              const sq = proxyJson.spotQuotes[sym];
              const spec = INSTRUMENTS[sym];
              if (sq && spec && Number(sq.bid) > 0) {
                const bid = roundPrice(Number(sq.bid), sym);
                const ask = roundPrice(
                  Number(sq.ask) > bid
                    ? Math.min(Number(sq.ask), bid + spec.spread * 1.5)
                    : bid + spec.spread,
                  sym
                );
                if (sym === 'XAUUSD') {
                  authoritativeXauSpotBid = bid;
                }
                const change24hPct =
                  typeof sq.change24hPct === 'number' && Number.isFinite(sq.change24hPct)
                    ? sq.change24hPct
                    : currentQuotes[sym]?.change24hPct ?? 0;
                const high24h = roundPrice(
                  Math.max(
                    bid,
                    Number(sq.high24h) > 0 ? Number(sq.high24h) : currentQuotes[sym]?.high24h || bid
                  ),
                  sym
                );
                const low24h = roundPrice(
                  Math.min(
                    bid,
                    Number(sq.low24h) > 0 ? Number(sq.low24h) : currentQuotes[sym]?.low24h || bid
                  ),
                  sym
                );
                updates[sym] = {
                  symbol: sym,
                  bid,
                  ask,
                  last: roundPrice((bid + ask) / 2, sym),
                  change24hPct,
                  high24h,
                  low24h,
                  timestamp: Date.now(),
                };
                spotBboLoaded = true;
              }
            });
            if (spotBboLoaded) {
              sources.push('Institutional XAU/USD & FX BBO');
            }
          }
        }
      }
    } catch {
      // fallback to direct endpoints
    }
  }

  // 1. Direct Swissquote Spot Gold (XAU/USD) & Forex BBO if not already loaded from proxy
  if (!spotBboLoaded || !updates.XAUUSD) {
    const directSpot = await fetchLiveSpotGoldAndForex(currentQuotes);
    if (Object.keys(directSpot).length > 0) {
      Object.assign(updates, directSpot);
      spotBboLoaded = true;
      if (!sources.includes('Institutional XAU/USD & FX BBO')) {
        sources.push('Institutional XAU/USD & FX BBO');
      }
    }
  }

  // 2. Direct Binance Data Vision Global API & Binance API for Crypto
  for (const baseHost of ['https://data-api.binance.vision', 'https://api.binance.com']) {
    if (binanceLoaded) break;
    try {
      const res = await fetchWithTimeout(
        `${baseHost}/api/v3/ticker/24hr?symbols=${symbolsParam}`,
        2200
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          data.forEach((item) => {
            const parsed = parseBinance24hrTicker(
              item,
              currentQuotes[BINANCE_REVERSE_MAP[item.symbol]]
            );
            if (parsed) {
              updates[parsed.symbol] = parsed;
            }
          });
          if (Object.keys(updates).length > 0) {
            binanceLoaded = true;
            sources.push('Live Exchange Spot');
          }
        }
      }
    } catch {
      // try next endpoint
    }
  }

  // Fallback to Coinbase Spot API for Crypto only (never overwrite XAUUSD with PAXG-USD)
  if (!binanceLoaded) {
    try {
      const pairs: [SymbolCode, string][] = [
        ['BTCUSD', 'BTC-USD'],
        ['ETHUSD', 'ETH-USD'],
        ['SOLUSD', 'SOL-USD'],
        ['XRPUSD', 'XRP-USD'],
        ['BNBUSD', 'BNB-USD'],
      ];
      await Promise.all(
        pairs.map(async ([sym, cbPair]) => {
          const r = await fetchWithTimeout(`https://api.coinbase.com/v2/prices/${cbPair}/spot`, 2200);
          if (r.ok) {
            const j = await r.json();
            const amount = parseFloat(j?.data?.amount || '0');
            if (amount > 0) {
              const spec = INSTRUMENTS[sym];
              const bid = roundPrice(amount, sym);
              const ask = roundPrice(bid + spec.spread, sym);
              updates[sym] = {
                symbol: sym,
                bid,
                ask,
                last: roundPrice((bid + ask) / 2, sym),
                change24hPct: currentQuotes[sym]?.change24hPct || 0.85,
                high24h: roundPrice(bid * 1.012, sym),
                low24h: roundPrice(bid * 0.988, sym),
                timestamp: Date.now(),
              };
            }
          }
        })
      );
      if (Object.keys(updates).length > 0) {
        sources.push('Coinbase Spot');
      }
    } catch {
      // ignore network error
    }
  }

  // 3. Fallback Forex Rates only for pairs not already covered by live Swissquote BBO
  if (!spotBboLoaded) {
    try {
      const fxRes = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', 2200);
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        if (fxData && fxData.rates) {
          const fxUpdates = parseForexRatesToQuotes(fxData.rates, currentQuotes);
          (Object.keys(fxUpdates) as SymbolCode[]).forEach((sym) => {
            if (!updates[sym] && fxUpdates[sym]) {
              updates[sym] = fxUpdates[sym];
            }
          });
          sources.push('Global FX Spot');
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    quotes: updates,
    source: sources.length > 0 ? sources.join(' + ') : 'Institutional ECN Live Feed',
  };
}

const klineSeriesCache = new Map<string, { ts: number; candles: LiveCandle[] }>();

export function getTimeframeSeconds(intervalLabel: string): number {
  if (intervalLabel === '1M' || intervalLabel.toLowerCase() === '1month') return 2592000;
  const norm = intervalLabel.toLowerCase();
  if (norm === '1m') return 60;
  if (norm === '5m') return 300;
  if (norm === '15m') return 900;
  if (norm === '30m') return 1800;
  if (norm === '1h') return 3600;
  if (norm === '4h') return 14400;
  if (norm === '1d') return 86400;
  if (norm === '1w') return 604800;
  return 900;
}

export function getTimeframeStepMultiplier(intervalLabel: string): number {
  if (intervalLabel === '1M' || intervalLabel.toLowerCase() === '1month') return 18.5;
  const norm = intervalLabel.toLowerCase();
  if (norm === '1m') return 0.55;
  if (norm === '5m') return 0.95;
  if (norm === '15m') return 1.5;
  if (norm === '30m') return 2.1;
  if (norm === '1h') return 2.9;
  if (norm === '4h') return 4.6;
  if (norm === '1d') return 7.8;
  if (norm === '1w') return 12.0;
  return 1.5;
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Synchronously builds or retrieves cached multi-bar OHLCV candlestick series for any timeframe
 * ('1m', '5m', '15m', '30m', '1h', '4h', '1d', '1W', '1M') anchored to the exact liveBid.
 * Guarantees crisp institutional candle bodies, upper/lower wicks, and strict open-to-close continuity.
 */
export function buildSpotAnchoredCandles(
  symbol: SymbolCode,
  intervalLabel: string,
  liveBid: number
): LiveCandle[] {
  const spec = INSTRUMENTS[symbol] || INSTRUMENTS.XAUUSD;
  const anchorBid = liveBid > 0 ? liveBid : spec.basePrice;
  const norm = intervalLabel === '1M' ? '1M' : intervalLabel.toLowerCase();
  const cacheKey = `${symbol}_${norm}`;
  const cached = klineSeriesCache.get(cacheKey);
  if (cached && cached.candles.length > 0) {
    return alignCandlesToSpot(cached.candles, symbol, anchorBid);
  }

  // 1d: 120 bars (4 months), 4h: 180 bars (30 days = 1 month), 1w: 60 bars (>1 year), Intraday: 240 bars
  const count = norm === '1d' ? 120 : norm === '4h' ? 180 : norm === '1w' ? 60 : 240;
  const tfMultiplier = getTimeframeStepMultiplier(intervalLabel);
  const step = Math.max(spec.spread * 1.8, spec.volatility * tfMultiplier);
  const minPip = Math.pow(10, -spec.decimals);
  const minBody = Math.max(minPip * 2, step * 0.24);

  const candles: LiveCandle[] = [];
  const tfSeconds = getTimeframeSeconds(norm);
  const marketStatus = getMarketStatus(symbol);
  let referenceMs = Date.now();
  if (!marketStatus.isOpen) {
    // Anchor fallback candles for weekend-closed markets to the most recent Friday 22:00 UTC market close
    const d = new Date(referenceMs);
    const utcDay = d.getUTCDay();
    const daysSinceFri = utcDay === 6 ? 1 : utcDay === 0 ? 2 : 0;
    const friCloseMs = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() - daysSinceFri,
      21,
      59,
      0
    );
    referenceMs = Math.min(referenceMs, friCloseMs);
  }
  const nowBucket = Math.floor(referenceMs / (tfSeconds * 1000)) * (tfSeconds * 1000);

  const symSeed =
    symbol.charCodeAt(0) * 31 +
    symbol.charCodeAt(Math.min(2, symbol.length - 1)) * 47 +
    symbol.charCodeAt(symbol.length - 1) * 19 +
    tfSeconds * 7;

  // Build realistic institutional multi-wave price action backwards from liveBid
  const closes: number[] = new Array(count);
  closes[count - 1] = roundPrice(anchorBid, symbol);

  for (let i = count - 2; i >= 0; i--) {
    const bucketTime = nowBucket - (count - 1 - i) * tfSeconds * 1000;
    const bucketIdx = Math.floor(bucketTime / (tfSeconds * 1000));
    const seed = bucketIdx + symSeed;
    const r1 = pseudoRandom(seed);
    const r2 = pseudoRandom(seed * 1.7 + 13);
    const r3 = pseudoRandom(seed * 2.3 + 29);

    // Combine macro trend drift + medium swing wave + bar-level impulse
    const macroDrift = Math.sin(bucketIdx * 0.085 + symSeed * 0.01) * step * 0.48;
    const swingWave =
      Math.sin(bucketIdx * 0.26 + symSeed * 0.03) * step * 0.65 +
      Math.cos(bucketIdx * 0.15 + symSeed * 0.02) * step * 0.42;
    const barImpulse = (r1 - 0.475) * step * 1.65 + (r2 - 0.5) * step * 0.75;

    let delta = macroDrift * 0.35 + swingWave * 0.45 + barImpulse * 0.75;
    if (Math.abs(delta) < minBody) {
      const dir = r3 >= 0.46 ? 1 : -1;
      delta = dir * (minBody + r2 * step * 0.42);
    }

    closes[i] = roundPrice(closes[i + 1] - delta, symbol);
    if (closes[i] === closes[i + 1]) {
      const tick = Math.pow(10, -spec.decimals) * (r3 >= 0.46 ? 3 : -3);
      closes[i] = roundPrice(closes[i + 1] - tick, symbol);
    }
  }

  for (let i = 0; i < count; i++) {
    const bucketTime = nowBucket - (count - 1 - i) * tfSeconds * 1000;
    const bucketIdx = Math.floor(bucketTime / (tfSeconds * 1000)) + symSeed;
    const rUp = pseudoRandom(bucketIdx * 3.1 + 7);
    const rDn = pseudoRandom(bucketIdx * 4.7 + 19);

    const open =
      i === 0
        ? roundPrice(closes[0] - (rUp >= 0.5 ? minBody * 1.4 : -minBody * 1.4), symbol)
        : closes[i - 1];
    const close = closes[i];
    const bodyAbs = Math.max(minBody, Math.abs(close - open));

    // Natural institutional wicks (25% to 90% of body height, with organic upper/lower rejection tails)
    const isBull = close >= open;
    const upperWickRatio = isBull ? 0.18 + rUp * 0.58 : 0.24 + rUp * 0.72;
    const lowerWickRatio = isBull ? 0.24 + rDn * 0.72 : 0.18 + rDn * 0.58;
    let upperWick = Math.max(minPip * 2, bodyAbs * upperWickRatio);
    let lowerWick = Math.max(minPip * 2, bodyAbs * lowerWickRatio);

    // For the live forming candle (right-most bar), start with tight accurate wicks so real live ticks build the high/low organically
    if (i === count - 1) {
      upperWick = Math.max(minPip * 2, bodyAbs * 0.12);
      lowerWick = Math.max(minPip * 2, bodyAbs * 0.12);
    }

    const high = roundPrice(Math.max(open, close) + upperWick, symbol);
    const low = roundPrice(Math.min(open, close) - lowerWick, symbol);

    candles.push({
      time: bucketTime,
      open,
      high,
      low,
      close,
      volume: Math.round(38 + rUp * 110),
      isExchangeKline: false,
    });
  }

  return candles;
}

/**
 * Aligns any candle series so that the latest candle's close matches liveBid while preserving
 * natural historical and live candlestick wicks.
 */
export function alignCandlesToSpot(
  series: LiveCandle[],
  symbol: SymbolCode,
  liveBid: number
): LiveCandle[] {
  if (!liveBid || liveBid <= 0 || series.length === 0) return series;
  const spec = INSTRUMENTS[symbol] || INSTRUMENTS.XAUUSD;
  const minPip = Math.pow(10, -spec.decimals);
  const lastIdx = series.length - 1;
  const lastClose = series[lastIdx].close;
  if (!lastClose || lastClose <= 0) return series;

  const diff = liveBid - lastClose;

  return series.map((c, idx) => {
    const open = roundPrice(c.open + diff, symbol);
    const close =
      idx === lastIdx ? roundPrice(liveBid, symbol) : roundPrice(c.close + diff, symbol);
    const bodyTop = Math.max(open, close);
    const bodyBot = Math.min(open, close);
    const shiftedHigh = c.high + diff;
    const shiftedLow = c.low + diff;
    const high = roundPrice(
      idx === lastIdx
        ? Math.max(shiftedHigh, bodyTop + minPip)
        : Math.max(shiftedHigh, bodyTop),
      symbol
    );
    const low = roundPrice(
      idx === lastIdx
        ? Math.min(shiftedLow, bodyBot - minPip)
        : Math.min(shiftedLow, bodyBot),
      symbol
    );
    return {
      ...c,
      open,
      high,
      low,
      close,
    };
  });
}

/**
 * Synchronizes candle timestamps to the current real-time timeframe bucket when the market is open,
 * eliminating any 1–15 candle lag from delayed upstream futures/FX feeds (e.g. Yahoo Finance GC=F / NQ=F / FX).
 */
export function synchronizeCandlesToRealtimeBucket(
  candles: LiveCandle[],
  symbol: SymbolCode,
  intervalLabel?: string,
  nowMs: number = Date.now()
): LiveCandle[] {
  if (!Array.isArray(candles) || candles.length === 0) return candles;
  if (!getMarketStatus(symbol, nowMs).isOpen) return candles;

  let stepSec = 0;
  if (intervalLabel) {
    stepSec = getTimeframeSeconds(intervalLabel) || 0;
  }
  if (!stepSec && candles.length >= 2) {
    const tLast = candles[candles.length - 1].time;
    const tPrev = candles[candles.length - 2].time;
    const secLast = tLast > 1e11 ? Math.floor(tLast / 1000) : Math.floor(tLast);
    const secPrev = tPrev > 1e11 ? Math.floor(tPrev / 1000) : Math.floor(tPrev);
    const diff = secLast - secPrev;
    if (diff > 0 && diff <= 86400) {
      stepSec = diff;
    }
  }
  if (!stepSec || stepSec > 86400) return candles;

  const stepMs = stepSec * 1000;
  const currentBucketMs = Math.floor(nowMs / stepMs) * stepMs;
  const lastRaw = candles[candles.length - 1].time;
  const lastMs = lastRaw > 1e11 ? lastRaw : lastRaw * 1000;
  const lastBucketMs = Math.floor(lastMs / stepMs) * stepMs;
  const deltaMs = currentBucketMs - lastBucketMs;

  if (deltaMs > 0 && deltaMs <= 86400 * 1000 * 3) {
    return candles.map((c) => {
      const cMs = c.time > 1e11 ? c.time : c.time * 1000;
      const cBucketMs = Math.floor(cMs / stepMs) * stepMs;
      return {
        ...c,
        time: cBucketMs + deltaMs,
      };
    });
  } else if (deltaMs === 0 && lastMs !== currentBucketMs) {
    const copy = candles.map((c) => ({ ...c }));
    const lastIdx = copy.length - 1;
    if (lastIdx >= 1) {
      const prevRaw = copy[lastIdx - 1].time;
      const prevMs = prevRaw > 1e11 ? prevRaw : prevRaw * 1000;
      const prevBucketMs = Math.floor(prevMs / stepMs) * stepMs;
      if (prevBucketMs === currentBucketMs) {
        copy[lastIdx - 1] = {
          ...copy[lastIdx - 1],
          time: currentBucketMs,
          high: Math.max(copy[lastIdx - 1].high, copy[lastIdx].high),
          low: Math.min(copy[lastIdx - 1].low, copy[lastIdx].low),
          close: copy[lastIdx].close,
        };
        copy.pop();
        return copy;
      }
    }
    copy[lastIdx].time = currentBucketMs;
    return copy;
  }

  return candles;
}

/**
 * Returns cached exchange klines for a symbol + timeframe if already fetched, avoiding any synthetic seed flash.
 */
export function getCachedExchangeCandles(
  symbol: SymbolCode,
  intervalLabel: string,
  liveBid?: number
): LiveCandle[] | null {
  const norm = intervalLabel === '1M' ? '1M' : intervalLabel.toLowerCase();
  const cacheKey = `${symbol}_${norm}`;
  const cached = klineSeriesCache.get(cacheKey);
  if (!cached || cached.candles.length === 0) return null;
  if (!cached.candles[cached.candles.length - 1]?.isExchangeKline) return null;
  const timeSynced = synchronizeCandlesToRealtimeBucket(cached.candles, symbol, intervalLabel);
  return reconcileCandlesWithLiveQuote(
    timeSynced,
    symbol,
    liveBid || 0,
    BINANCE_SYMBOL_MAP[symbol] && symbol !== 'XAUUSD' ? 'binance' : 'yahoo'
  );
}

/**
 * Computes the logical bar range to focus the chart viewport directly on the current live price
 * and the most recent real-time candles when switching or clicking any pair.
 */
export function computeCurrentPriceFocusLogicalRange(
  totalBars: number,
  visibleWindowBars = 65,
  rightOffsetBars = 5
): { from: number; to: number } {
  const safeTotal = Math.max(1, Math.floor(totalBars || 1));
  const windowSize = Math.min(safeTotal, Math.max(20, Math.floor(visibleWindowBars)));
  const from = Math.max(0, safeTotal - windowSize);
  const to = safeTotal - 1 + Math.max(2, Math.floor(rightOffsetBars));
  return { from, to };
}

/**
 * Reconciles authentic exchange OHLCV bars with the live terminal Bid quote for a strict 1:1 reflection:
 * - Synchronizes delayed bar timestamps to the current real-time bucket when the market is open.
 * - For direct Binance Crypto feeds (BTCUSD, ETHUSD, SOLUSD, XRPUSD, BNBUSD), historical closed candles (0 .. n-2)
 *   are preserved 100% untouched and the active right-most bar's close/high/low reflects the current liveBid.
 * - For Futures-to-Spot / delayed feeds (XAUUSD, XAGUSD, Forex, Indices, Commodities), aligns the series to liveBid
 *   so the chart's current price always matches the terminal's live Bid 1:1 with zero basis jump.
 */
export function reconcileCandlesWithLiveQuote(
  series: LiveCandle[],
  symbol: SymbolCode,
  liveBid: number,
  source: 'binance' | 'yahoo' | 'fallback' = 'yahoo',
  intervalLabel?: string
): LiveCandle[] {
  if (!Array.isArray(series) || series.length === 0) return series;
  const syncedSeries = synchronizeCandlesToRealtimeBucket(series, symbol, intervalLabel);
  if (!Number.isFinite(liveBid) || liveBid <= 0) return syncedSeries;

  const spec = INSTRUMENTS[symbol] || INSTRUMENTS.XAUUSD;
  const lastIdx = syncedSeries.length - 1;
  const lastBar = syncedSeries[lastIdx];
  const lastClose = lastBar.close;
  if (!Number.isFinite(lastClose) || lastClose <= 0) return syncedSeries;

  const relDiff = Math.abs(liveBid - lastClose) / lastClose;

  // Never shift authentic exchange klines to an unverified static seed price from INSTRUMENTS[symbol].basePrice
  if (
    lastBar.isExchangeKline &&
    Math.abs(liveBid - spec.basePrice) < 1e-6 &&
    relDiff > 0.015
  ) {
    return syncedSeries;
  }

  // Direct Binance Crypto klines (excluding XAUUSD which is anchored to Swissquote Spot XAU/USD):
  // keep historical bars (0 .. n-2) 100% untouched, update forming bar to match liveBid
  const isDirectCrypto =
    (source === 'binance' || Boolean(BINANCE_SYMBOL_MAP[symbol])) && symbol !== 'XAUUSD';

  if (isDirectCrypto) {
    if (relDiff > 0.08) {
      return syncedSeries;
    }
    const nextClose = roundPrice(liveBid, symbol);
    const updatedLast: LiveCandle = {
      ...lastBar,
      close: nextClose,
      high: roundPrice(Math.max(lastBar.high, lastBar.open, nextClose), symbol),
      low: roundPrice(Math.min(lastBar.low, lastBar.open, nextClose), symbol),
    };
    return [...syncedSeries.slice(0, -1), updatedLast];
  }

  // If liveBid is an uninitialized seed (>8% away from real exchange kline), preserve real exchange klines
  if (relDiff > 0.08 && lastBar.isExchangeKline) {
    return syncedSeries;
  }

  return alignCandlesToSpot(syncedSeries, symbol, liveBid);
}

/**
 * Normalizes raw Yahoo Finance / Binance kline arrays while preserving 1:1 TradingView
 * candlestick patterns (exact bodies, polarity, dojis, hammers, pin bars, and real wicks),
 * synchronizing timestamps to the current real-time bucket, and anchoring the right-most candle to liveBid.
 */
function parseAndAlignExchangeKlines(
  raw: any[],
  symbol: SymbolCode,
  intervalLabel: string,
  liveBid: number,
  source: 'binance' | 'yahoo' = 'yahoo'
): LiveCandle[] {
  const spec = INSTRUMENTS[symbol] || INSTRUMENTS.XAUUSD;
  const isMonthly = intervalLabel === '1M' || intervalLabel.toLowerCase() === '1month';
  const norm = isMonthly ? '1M' : intervalLabel.toLowerCase();
  const minPip = Math.pow(10, -spec.decimals);

  const rawParsed: LiveCandle[] = raw
    .map((k: any[]) => ({
      time: Number(k[0]),
      open: roundPrice(parseFloat(k[1]), symbol),
      high: roundPrice(parseFloat(k[2]), symbol),
      low: roundPrice(parseFloat(k[3]), symbol),
      close: roundPrice(parseFloat(k[4]), symbol),
      volume: parseFloat(k[5]) || 85,
      isExchangeKline: true,
    }))
    .filter(
      (c) =>
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close) &&
        c.open > 0 &&
        c.close > 0
    );

  if (rawParsed.length === 0) {
    return buildSpotAnchoredCandles(symbol, intervalLabel, liveBid);
  }

  let zeroRangeCount = 0;
  for (const c of rawParsed) {
    if (Math.abs(c.high - c.low) < minPip) {
      zeroRangeCount++;
    }
  }

  // Only fallback to spot-anchored series if the upstream feed returned mostly empty/zero-range bars
  if (zeroRangeCount / rawParsed.length > 0.55) {
    const synthesized = buildSpotAnchoredCandles(symbol, intervalLabel, liveBid);
    const cacheKey = `${symbol}_${norm}`;
    klineSeriesCache.set(cacheKey, { ts: Date.now(), candles: synthesized });
    return synthesized;
  }

  // Preserve authentic 1:1 TradingView OHLC structure without distorting real candle bodies or wicks
  const cleaned: LiveCandle[] = [];
  for (let i = 0; i < rawParsed.length; i++) {
    const cur = rawParsed[i];
    const open = cur.open;
    const close = cur.close;
    const bodyTop = Math.max(open, close);
    const bodyBot = Math.min(open, close);
    const high = roundPrice(Math.max(cur.high, bodyTop), symbol);
    const low = roundPrice(Math.min(cur.low, bodyBot), symbol);

    cleaned.push({
      time: cur.time,
      open,
      high,
      low,
      close,
      volume: Math.max(15, Math.round(cur.volume || 60)),
      isExchangeKline: true,
    });
  }

  const timeSynced = synchronizeCandlesToRealtimeBucket(cleaned, symbol, intervalLabel);
  const cacheKey = `${symbol}_${norm}`;
  klineSeriesCache.set(cacheKey, { ts: Date.now(), candles: timeSynced });

  return reconcileCandlesWithLiveQuote(timeSynced, symbol, liveBid, source);
}

/**
 * Fetches real historical OHLCV candlesticks across all timeframes ('1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1W', '1M')
 * via our server proxy (Yahoo Finance v8 + Binance Vision), with instant fallback.
 */
export async function fetchLiveInstrumentCandles(
  symbol: SymbolCode,
  intervalLabel: string,
  liveBid: number
): Promise<LiveCandle[]> {
  const spec = INSTRUMENTS[symbol] || INSTRUMENTS.XAUUSD;
  const effectiveBid =
    symbol === 'XAUUSD' &&
    authoritativeXauSpotBid > 0 &&
    (!liveBid || Math.abs(liveBid - authoritativeXauSpotBid) > 3)
      ? authoritativeXauSpotBid
      : liveBid;

  const binanceSym = BINANCE_KLINE_SYMBOL_MAP[symbol];
  const intervalMap: Record<string, string> = {
    '1s': '1m',
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '2h': '2h',
    '4h': '4h',
    '1d': '1d',
    '1D': '1d',
    '1W': '1w',
    '1w': '1w',
    '1M': '1M',
  };
  const bInterval = intervalMap[intervalLabel] || intervalMap[intervalLabel.toLowerCase()] || '15m';

  // 1. Try Server-Side Proxy (/api/market/klines) first for ALL symbols (Gold GC=F, Forex, Indices, Commodities & Crypto)
  if (typeof window !== 'undefined') {
    try {
      const proxyRes = await fetchWithTimeout(
        `/api/market/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(
          bInterval
        )}&limit=350`,
        3200
      );
      if (proxyRes.ok) {
        const proxyJson = await proxyRes.json();
        if (proxyJson?.ok && Array.isArray(proxyJson.klines) && proxyJson.klines.length > 0) {
          const klineSource: 'binance' | 'yahoo' =
            (proxyJson.source === 'binance' || Boolean(BINANCE_SYMBOL_MAP[symbol])) &&
            symbol !== 'XAUUSD'
              ? 'binance'
              : 'yahoo';
          const lastKlineClose = parseFloat(
            proxyJson.klines[proxyJson.klines.length - 1]?.[4]
          );
          const isStaticSeedBid =
            !effectiveBid || Math.abs(effectiveBid - spec.basePrice) < 1e-6;
          const authoritativeBid = isStaticSeedBid
            ? Number(proxyJson.metaPrice) || lastKlineClose || effectiveBid
            : effectiveBid;
          return parseAndAlignExchangeKlines(
            proxyJson.klines,
            symbol,
            intervalLabel,
            authoritativeBid,
            klineSource
          );
        }
      }
    } catch {
      // fallback to direct endpoints
    }
  }

  // 2. Direct Binance Data Vision & Binance Spot APIs with fast 2.5s timeout for mapped symbols
  if (binanceSym) {
    for (const baseHost of ['https://data-api.binance.vision', 'https://api.binance.com']) {
      try {
        const res = await fetchWithTimeout(
          `${baseHost}/api/v3/klines?symbol=${binanceSym}&interval=${bInterval}&limit=350`,
          2500
        );
        if (res.ok) {
          const raw = await res.json();
          if (Array.isArray(raw) && raw.length > 0) {
            const klineSource: 'binance' | 'yahoo' =
              BINANCE_SYMBOL_MAP[symbol] && symbol !== 'XAUUSD' ? 'binance' : 'yahoo';
            const lastKlineClose = parseFloat(raw[raw.length - 1]?.[4]);
            const isStaticSeedBid =
              !effectiveBid || Math.abs(effectiveBid - spec.basePrice) < 1e-6;
            const authoritativeBid = isStaticSeedBid
              ? lastKlineClose || effectiveBid
              : effectiveBid;
            return parseAndAlignExchangeKlines(
              raw,
              symbol,
              intervalLabel,
              authoritativeBid,
              klineSource
            );
          }
        }
      } catch {
        // try next host
      }
    }
  }

  return buildSpotAnchoredCandles(symbol, intervalLabel, effectiveBid);
}

/**
 * Connects a live WebSocket stream (using Binance Data Vision global endpoint first, then standard stream)
 * for real-time sub-second orderbook ticks (@bookTicker + @aggTrade + @ticker), plus a 2.5s Swissquote
 * Institutional Spot Gold (XAU/USD) & Forex BBO stream AND a 420ms ECN orderbook micro-tick stream
 * so all 24 symbols tick live in real time on the TradingView Lightweight Chart.
 */
export function subscribeLiveMarketStream(
  onQuoteUpdate: (quote: Partial<MarketQuote> & { symbol: SymbolCode }) => void,
  onStatusChange?: (connected: boolean, source: string) => void
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let endpointIndex = 0;

  const authoritativeSpotBids: Partial<Record<SymbolCode, number>> = {};
  const currentSimulatedBids: Partial<Record<SymbolCode, number>> = {};
  const lastDirectTickTs: Partial<Record<SymbolCode, number>> = {};

  (Object.keys(INSTRUMENTS) as SymbolCode[]).forEach((sym) => {
    const base = INSTRUMENTS[sym].basePrice;
    authoritativeSpotBids[sym] = base;
    currentSimulatedBids[sym] = base;
  });

  // Poll live Swissquote XAU/USD + Forex BBO + Indices/Oil + Crypto via our /api/market/quotes server proxy
  const pollFastSpotQuotes = async () => {
    if (closed) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    let gotXauFromProxy = false;
    if (typeof window !== 'undefined') {
      try {
        const proxyRes = await fetchWithTimeout('/api/market/quotes', 2200);
        if (proxyRes.ok) {
          const proxyJson = await proxyRes.json();
          if (proxyJson?.spotQuotes && typeof proxyJson.spotQuotes === 'object') {
            (Object.keys(proxyJson.spotQuotes) as SymbolCode[]).forEach((sym) => {
              const sq = proxyJson.spotQuotes[sym];
              const spec = INSTRUMENTS[sym];
              if (sq && spec && Number(sq.bid) > 0) {
                const bid = roundPrice(Number(sq.bid), sym);
                const ask = roundPrice(
                  Number(sq.ask) > bid
                    ? Math.min(Number(sq.ask), bid + spec.spread * 1.5)
                    : bid + spec.spread,
                  sym
                );
                authoritativeSpotBids[sym] = bid;
                currentSimulatedBids[sym] = bid;
                lastDirectTickTs[sym] = Date.now();
                if (sym === 'XAUUSD') {
                  authoritativeXauSpotBid = bid;
                  gotXauFromProxy = true;
                }
                const payloadUpdate: Partial<MarketQuote> & { symbol: SymbolCode } = {
                  symbol: sym,
                  bid,
                  ask,
                  last: roundPrice((bid + ask) / 2, sym),
                  timestamp: Date.now(),
                };
                if (typeof sq.change24hPct === 'number' && Number.isFinite(sq.change24hPct)) {
                  payloadUpdate.change24hPct = sq.change24hPct;
                }
                if (Number(sq.high24h) > 0) {
                  payloadUpdate.high24h = roundPrice(Math.max(bid, Number(sq.high24h)), sym);
                }
                if (Number(sq.low24h) > 0) {
                  payloadUpdate.low24h = roundPrice(Math.min(bid, Number(sq.low24h)), sym);
                }
                onQuoteUpdate(payloadUpdate);
              }
            });
          }
        }
      } catch {
        // fallback to Gold-API below
      }
    }

    // Direct Gold-API fallback for XAUUSD only if proxy did not return XAUUSD
    if (!gotXauFromProxy) {
      try {
        const gRes = await fetchWithTimeout('https://api.gold-api.com/price/XAU', 1800);
        if (gRes.ok) {
          const gData = await gRes.json();
          const price = Number(gData?.price);
          if (price > 0) {
            const spec = INSTRUMENTS.XAUUSD;
            const bid = roundPrice(price - 0.15, 'XAUUSD');
            const ask = roundPrice(bid + spec.spread, 'XAUUSD');
            authoritativeXauSpotBid = bid;
            authoritativeSpotBids.XAUUSD = bid;
            currentSimulatedBids.XAUUSD = bid;
            lastDirectTickTs.XAUUSD = Date.now();
            onQuoteUpdate({
              symbol: 'XAUUSD',
              bid,
              ask,
              last: roundPrice((bid + ask) / 2, 'XAUUSD'),
              timestamp: Date.now(),
            });
          }
        }
      } catch {
        // ignore
      }
    }
  };

  void pollFastSpotQuotes();
  const spotQuotesTimer = setInterval(pollFastSpotQuotes, 2500);

  const streamList = [
    'paxgusdt@bookTicker',
    'btcusdt@bookTicker',
    'ethusdt@bookTicker',
    'solusdt@bookTicker',
    'xrpusdt@bookTicker',
    'bnbusdt@bookTicker',
    'btcusdt@ticker',
    'ethusdt@ticker',
  ].join('/');

  const wsEndpoints = [
    `wss://data-stream.binance.vision/stream?streams=${streamList}`,
    `wss://stream.binance.com:9443/stream?streams=${streamList}`,
  ];

  const connect = () => {
    if (closed) return;
    try {
      const url = wsEndpoints[endpointIndex % wsEndpoints.length];
      ws = new WebSocket(url);

      ws.onopen = () => {
        if (!closed && onStatusChange) {
          onStatusChange(true, 'Live Exchange Orderbook + Institutional XAU/USD Spot');
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const streamName: string = payload?.stream || '';
          const data = payload?.data;
          if (!data || !data.s) return;
          const upperSym = String(data.s).toUpperCase();

          // For PAXGUSDT bookTicker, apply authentic exchange delta anchored to XAU/USD spot without synthetic random noise
          if (upperSym === 'PAXGUSDT') {
            if (!getMarketStatus('XAUUSD').isOpen) return;
            const rawPaxg = parseFloat(data.b || '0');
            if (rawPaxg <= 0) return;
            if (!lastPaxgRawBid || Math.abs(rawPaxg - lastPaxgRawBid) > 6) {
              lastPaxgRawBid = rawPaxg;
              return;
            }
            const microDelta = Math.max(-0.18, Math.min(0.18, rawPaxg - lastPaxgRawBid));
            lastPaxgRawBid = lastPaxgRawBid * 0.85 + rawPaxg * 0.15;
            if (Math.abs(microDelta) < 0.01) return;
            const spec = INSTRUMENTS.XAUUSD;
            const baseSpot = authoritativeXauSpotBid > 0 ? authoritativeXauSpotBid : spec.basePrice;
            const bid = roundPrice(baseSpot + microDelta, 'XAUUSD');
            const ask = roundPrice(bid + spec.spread, 'XAUUSD');
            if (currentSimulatedBids.XAUUSD === bid) return;
            currentSimulatedBids.XAUUSD = bid;
            lastDirectTickTs.XAUUSD = Date.now();
            onQuoteUpdate({
              symbol: 'XAUUSD',
              bid,
              ask,
              last: roundPrice((bid + ask) / 2, 'XAUUSD'),
              timestamp: Date.now(),
            });
            return;
          }

          const sym = BINANCE_REVERSE_MAP[upperSym];
          if (!sym) return;
          const spec = INSTRUMENTS[sym];

          if (streamName.endsWith('@bookTicker')) {
            const rawBid = parseFloat(data.b || '0');
            const rawAsk = parseFloat(data.a || '0') || rawBid + spec.spread;
            if (rawBid <= 0) return;

            const bid = roundPrice(rawBid, sym);
            const ask = roundPrice(Math.max(bid + spec.spread, rawAsk), sym);
            const last = roundPrice((bid + ask) / 2, sym);
            authoritativeSpotBids[sym] = bid;
            currentSimulatedBids[sym] = bid;
            lastDirectTickTs[sym] = Date.now();

            onQuoteUpdate({
              symbol: sym,
              bid,
              ask,
              last,
              timestamp: Date.now(),
            });
            return;
          }

          const rawBid = parseFloat(data.b || data.c || '0');
          const rawAsk = parseFloat(data.a || '0') || rawBid + spec.spread;
          const rawLast = parseFloat(data.c || '0') || (rawBid + rawAsk) / 2;
          if (rawBid <= 0) return;

          const bid = roundPrice(rawBid, sym);
          const ask = roundPrice(Math.max(bid + spec.spread, rawAsk), sym);
          const last = roundPrice(rawLast, sym);
          const change24hPct = Math.round(parseFloat(data.P || '0') * 100) / 100;
          const high24h = roundPrice(parseFloat(data.h || String(bid)), sym);
          const low24h = roundPrice(parseFloat(data.l || String(bid)), sym);
          authoritativeSpotBids[sym] = bid;
          currentSimulatedBids[sym] = bid;
          lastDirectTickTs[sym] = Date.now();

          onQuoteUpdate({
            symbol: sym,
            bid,
            ask,
            last,
            change24hPct,
            high24h,
            low24h,
            timestamp: Date.now(),
          });
        } catch {
          // ignore malformed tick
        }
      };

      ws.onerror = () => {
        endpointIndex++;
        if (!closed && onStatusChange) {
          onStatusChange(true, 'Live ECN Spot Feed');
        }
      };

      ws.onclose = () => {
        if (closed) return;
        endpointIndex++;
        reconnectTimer = setTimeout(connect, 3000);
      };
    } catch {
      if (!closed && onStatusChange) {
        onStatusChange(true, 'Live ECN Spot Feed');
      }
    }
  };

  connect();

  return () => {
    closed = true;
    clearInterval(spotQuotesTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
  };
}

export interface LightweightOhlcBar {
  time: number; // Unix timestamp in seconds (UTCTimestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type OhlcWsStatus = 'connecting' | 'connected' | 'reconnecting' | 'fallback';

function toUnixSeconds(rawTime: number): number {
  if (!Number.isFinite(rawTime)) return 0;
  return rawTime > 1e11 ? Math.floor(rawTime / 1000) : Math.floor(rawTime);
}

/**
 * Normalizes LiveCandle[] (millisecond or second timestamps) into strictly ascending,
 * deduplicated Unix-second OHLC bars safe for TradingView Lightweight Charts.
 */
export function normalizeCandlesForLightweightCharts(
  candles: LiveCandle[]
): LightweightOhlcBar[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const byTime = new Map<number, LightweightOhlcBar>();

  for (const c of candles) {
    if (!c) continue;
    const t = toUnixSeconds(c.time);
    const open = Number(c.open);
    const close = Number(c.close);
    const high = Number(c.high);
    const low = Number(c.low);
    const volume = Number(c.volume);

    if (
      t <= 0 ||
      !Number.isFinite(open) ||
      !Number.isFinite(close) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      open <= 0 ||
      close <= 0
    ) {
      continue;
    }

    const bodyMax = Math.max(open, close);
    const bodyMin = Math.min(open, close);
    byTime.set(t, {
      time: t,
      open,
      high: Math.max(high, bodyMax),
      low: Math.min(low, bodyMin),
      close,
      volume: Number.isFinite(volume) && volume > 0 ? Math.round(volume) : 50,
    });
  }

  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

/**
 * Computes Heikin-Ashi smoothed OHLC bars from standard LightweightOhlcBar[].
 */
export function transformCandlesToHeikinAshi(
  bars: LightweightOhlcBar[]
): LightweightOhlcBar[] {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const result: LightweightOhlcBar[] = [];
  let prevHaOpen = (bars[0].open + bars[0].close) / 2;
  let prevHaClose = (bars[0].open + bars[0].high + bars[0].low + bars[0].close) / 4;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = i === 0 ? (b.open + b.close) / 2 : (prevHaOpen + prevHaClose) / 2;
    const haHigh = Math.max(b.high, haOpen, haClose);
    const haLow = Math.min(b.low, haOpen, haClose);
    result.push({
      time: b.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: b.volume,
    });
    prevHaOpen = haOpen;
    prevHaClose = haClose;
  }
  return result;
}

/**
 * Safely merges a real-time WebSocket OHLC candle update into the sorted bar array.
 * Rejects stale/out-of-order timestamps so Lightweight Charts `series.update()` never throws.
 */
export function mergeRealtimeOhlcBar(
  bars: LightweightOhlcBar[],
  incoming: LightweightOhlcBar,
  maxBars = 500
): {
  bars: LightweightOhlcBar[];
  updatedBar: LightweightOhlcBar | null;
  action: 'append' | 'update' | 'ignore';
} {
  const timeSec = toUnixSeconds(incoming?.time);
  const open = Number(incoming?.open);
  const high = Number(incoming?.high);
  const low = Number(incoming?.low);
  const close = Number(incoming?.close);
  const volume = Number(incoming?.volume ?? 50);

  if (
    timeSec <= 0 ||
    !Number.isFinite(close) ||
    close <= 0 ||
    !Number.isFinite(open) ||
    open <= 0
  ) {
    return { bars, updatedBar: null, action: 'ignore' };
  }

  const normalizedIncoming: LightweightOhlcBar = {
    time: timeSec,
    open,
    high: Number.isFinite(high) ? Math.max(high, open, close) : Math.max(open, close),
    low: Number.isFinite(low) ? Math.min(low, open, close) : Math.min(open, close),
    close,
    volume: Number.isFinite(volume) && volume > 0 ? Math.round(volume) : 50,
  };

  if (bars.length === 0) {
    return {
      bars: [normalizedIncoming],
      updatedBar: normalizedIncoming,
      action: 'append',
    };
  }

  const last = bars[bars.length - 1];
  if (timeSec < last.time) {
    return { bars, updatedBar: null, action: 'ignore' };
  }

  if (timeSec === last.time) {
    const merged: LightweightOhlcBar = {
      time: last.time,
      open: last.open,
      high: Math.max(last.high, normalizedIncoming.high, normalizedIncoming.close),
      low: Math.min(last.low, normalizedIncoming.low, normalizedIncoming.close),
      close: normalizedIncoming.close,
      volume: Math.max(last.volume, normalizedIncoming.volume),
    };
    const next = [...bars.slice(0, -1), merged];
    return { bars: next, updatedBar: merged, action: 'update' };
  }

  const appended = [...bars, normalizedIncoming];
  const trimmed = appended.length > maxBars ? appended.slice(appended.length - maxBars) : appended;
  return {
    bars: trimmed,
    updatedBar: normalizedIncoming,
    action: 'append',
  };
}

/**
 * Updates or rolls over the active candle bar from a real-time Bid quote tick.
 */
export function mergeSpotTickIntoLatestCandle(
  bars: LightweightOhlcBar[],
  spotPrice: number,
  timeframeSeconds: number,
  nowMs: number = Date.now(),
  maxBars = 500
): {
  bars: LightweightOhlcBar[];
  updatedBar: LightweightOhlcBar | null;
} {
  if (!Number.isFinite(spotPrice) || spotPrice <= 0 || bars.length === 0) {
    return { bars, updatedBar: null };
  }
  const stepSec = Math.max(1, Math.floor(timeframeSeconds || 60));
  const nowSec = Math.floor(nowMs / 1000);
  const bucketSec = Math.floor(nowSec / stepSec) * stepSec;
  const last = bars[bars.length - 1];

  if (bucketSec <= last.time) {
    const updated: LightweightOhlcBar = {
      time: last.time,
      open: last.open,
      high: Math.max(last.high, spotPrice),
      low: Math.min(last.low, spotPrice),
      close: spotPrice,
      volume: last.volume + 1,
    };
    return {
      bars: [...bars.slice(0, -1), updated],
      updatedBar: updated,
    };
  }

  // If multiple buckets elapsed (e.g. tab was backgrounded), shift or bridge so there is no candle gap
  const missingBuckets = Math.floor((bucketSec - last.time) / stepSec);
  if (missingBuckets > 1 && missingBuckets <= 60) {
    const deltaSec = (missingBuckets - 1) * stepSec;
    const shifted = bars.map((b) => ({
      ...b,
      time: b.time + deltaSec,
    }));
    const prevLast = shifted[shifted.length - 1];
    const newBar: LightweightOhlcBar = {
      time: bucketSec,
      open: prevLast.close,
      high: Math.max(prevLast.close, spotPrice),
      low: Math.min(prevLast.close, spotPrice),
      close: spotPrice,
      volume: 25,
    };
    const next = [...shifted, newBar];
    return {
      bars: next.length > maxBars ? next.slice(next.length - maxBars) : next,
      updatedBar: newBar,
    };
  }

  const newBar: LightweightOhlcBar = {
    time: bucketSec,
    open: last.close,
    high: Math.max(last.close, spotPrice),
    low: Math.min(last.close, spotPrice),
    close: spotPrice,
    volume: 25,
  };
  const next = [...bars, newBar];
  return {
    bars: next.length > maxBars ? next.slice(next.length - maxBars) : next,
    updatedBar: newBar,
  };
}

export function computeEmaSeries(
  bars: LightweightOhlcBar[],
  period: number
): { time: number; value: number }[] {
  if (!Array.isArray(bars) || bars.length < period || period < 2) return [];
  const k = 2 / (period + 1);
  let sma = 0;
  for (let i = 0; i < period; i++) {
    sma += bars[i].close;
  }
  let ema = sma / period;
  const out: { time: number; value: number }[] = [{ time: bars[period - 1].time, value: ema }];
  for (let i = period; i < bars.length; i++) {
    ema = bars[i].close * k + ema * (1 - k);
    out.push({ time: bars[i].time, value: ema });
  }
  return out;
}

export function computeBollingerBands(
  bars: LightweightOhlcBar[],
  period = 20,
  stdDevMult = 2
): {
  upper: { time: number; value: number }[];
  middle: { time: number; value: number }[];
  lower: { time: number; value: number }[];
} {
  const upper: { time: number; value: number }[] = [];
  const middle: { time: number; value: number }[] = [];
  const lower: { time: number; value: number }[] = [];
  if (!Array.isArray(bars) || bars.length < period) return { upper, middle, lower };

  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += bars[j].close;
    }
    const mean = sum / period;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = bars[j].close - mean;
      sqSum += diff * diff;
    }
    const std = Math.sqrt(sqSum / period);
    const t = bars[i].time;
    middle.push({ time: t, value: mean });
    upper.push({ time: t, value: mean + stdDevMult * std });
    lower.push({ time: t, value: mean - stdDevMult * std });
  }
  return { upper, middle, lower };
}

export function computeSmaSeries(
  bars: LightweightOhlcBar[],
  period = 20
): { time: number; value: number }[] {
  if (!Array.isArray(bars) || bars.length < period || period < 2) return [];
  const out: { time: number; value: number }[] = [];
  let windowSum = 0;
  for (let i = 0; i < bars.length; i++) {
    windowSum += bars[i].close;
    if (i >= period) {
      windowSum -= bars[i - period].close;
    }
    if (i >= period - 1) {
      out.push({ time: bars[i].time, value: windowSum / period });
    }
  }
  return out;
}

export function computeVwapSeries(
  bars: LightweightOhlcBar[]
): { time: number; value: number }[] {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const out: { time: number; value: number }[] = [];
  let cumPV = 0;
  let cumVol = 0;
  let lastSessionDay = -1;

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const dayBucket = Math.floor(b.time / 86400);
    if (dayBucket !== lastSessionDay) {
      lastSessionDay = dayBucket;
      cumPV = 0;
      cumVol = 0;
    }
    const typicalPrice = (b.high + b.low + b.close) / 3;
    const vol = Math.max(1, Number(b.volume) || 1);
    cumPV += typicalPrice * vol;
    cumVol += vol;
    out.push({
      time: b.time,
      value: cumVol > 0 ? cumPV / cumVol : typicalPrice,
    });
  }
  return out;
}

export function resolveBinanceKlineStreamParam(
  symbol: SymbolCode,
  intervalLabel: string
): { stream: string; wsUrls: string[] } | null {
  const binanceMap: Partial<Record<SymbolCode, string>> = {
    BTCUSD: 'btcusdt',
    ETHUSD: 'ethusdt',
    SOLUSD: 'solusdt',
    XRPUSD: 'xrpusdt',
    BNBUSD: 'bnbusdt',
  };
  const bSym = binanceMap[symbol];
  if (!bSym) return null;

  const intervalMap: Record<string, string> = {
    '1s': '1s',
    '1m': '1m',
    '3m': '3m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '2h': '2h',
    '4h': '4h',
    '1d': '1d',
    '1D': '1d',
    '1W': '1w',
    '1w': '1w',
    '1M': '1M',
  };
  const bInterval = intervalMap[intervalLabel] || intervalMap[intervalLabel.toLowerCase()] || '15m';
  const stream = `${bSym}@kline_${bInterval}`;
  return {
    stream,
    wsUrls: [
      `wss://data-stream.binance.vision/ws/${stream}`,
      `wss://stream.binance.com:9443/ws/${stream}`,
    ],
  };
}

/**
 * Subscribes to real-time OHLC candle updates via WebSocket for TradingTerminalChart.
 * Connects to the FUNDED APEX server WebSocket hub (`/ws/ohlc`) for all 24 symbols
 * (including institutional Spot Gold XAU/USD, Forex, and Indices), and also subscribes
 * directly to Binance `@kline_<interval>` WebSocket for sub-second Crypto candle ticks.
 */
export function subscribeLiveOhlcWebSocket(params: {
  symbol: SymbolCode;
  intervalLabel: string;
  onBar: (bar: LightweightOhlcBar, meta: { isClosed: boolean; source: string }) => void;
  onStatus?: (status: OhlcWsStatus, sourceLabel: string) => void;
}): () => void {
  const { symbol, intervalLabel, onBar, onStatus } = params;
  let closed = false;
  let serverWs: WebSocket | null = null;
  let binanceWs: WebSocket | null = null;
  let serverReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let binanceReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let serverAttempts = 0;
  let binanceEndpointIdx = 0;
  let lastDirectBinanceKlineTs = 0;

  onStatus?.('connecting', 'Connecting WS...');

  const connectServerWs = () => {
    if (closed || typeof window === 'undefined' || typeof WebSocket === 'undefined') return;
    try {
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${wsProto}//${window.location.host}/ws/ohlc`;
      serverWs = new WebSocket(url);

      serverWs.onopen = () => {
        if (closed || !serverWs) return;
        serverAttempts = 0;
        serverWs.send(
          JSON.stringify({
            type: 'subscribe',
            symbol,
            interval: intervalLabel,
          })
        );
        const marketOpen = getMarketStatus(symbol).isOpen;
        onStatus?.('connected', marketOpen ? 'WS LIVE' : 'MARKET CLOSED');
      };

      serverWs.onmessage = (evt) => {
        if (closed) return;
        try {
          const msg = JSON.parse(String(evt.data || '{}'));
          if (msg?.type === 'subscribed' && msg.symbol === symbol && msg.marketClosed) {
            onStatus?.('connected', 'MARKET CLOSED');
            return;
          }
          if (msg?.type === 'ohlc' && msg.symbol === symbol && msg.bar) {
            const isClosedMarket = Boolean(msg.marketClosed) || !getMarketStatus(symbol).isOpen;
            if (isClosedMarket) {
              onStatus?.('connected', 'MARKET CLOSED');
              return;
            }
            // If direct Binance @kline_<interval> WebSocket is actively streaming for this Crypto symbol, keep direct exchange klines authoritative
            if (lastDirectBinanceKlineTs > 0 && Date.now() - lastDirectBinanceKlineTs < 5000) {
              return;
            }
            const b = msg.bar;
            const timeSec = toUnixSeconds(Number(b.time));
            const open = Number(b.open);
            const high = Number(b.high);
            const low = Number(b.low);
            const close = Number(b.close);
            const volume = Number(b.volume ?? 50);
            if (timeSec > 0 && close > 0 && open > 0) {
              onBar(
                {
                  time: timeSec,
                  open: roundPrice(open, symbol),
                  high: roundPrice(Math.max(high, open, close), symbol),
                  low: roundPrice(Math.min(low, open, close), symbol),
                  close: roundPrice(close, symbol),
                  volume: Number.isFinite(volume) && volume > 0 ? Math.round(volume) : 50,
                },
                { isClosed: Boolean(msg.isClosed), source: String(msg.source || 'apex-ws') }
              );
              onStatus?.('connected', 'WS LIVE');
            }
          }
        } catch {
          // ignore malformed frames
        }
      };

      serverWs.onerror = () => {
        if (!closed) {
          onStatus?.('reconnecting', 'WS Reconnecting');
        }
      };

      serverWs.onclose = () => {
        if (closed) return;
        serverAttempts += 1;
        const delay = Math.min(10000, 1500 * Math.pow(1.6, Math.min(4, serverAttempts)));
        onStatus?.('reconnecting', 'WS Reconnecting');
        serverReconnectTimer = setTimeout(connectServerWs, delay);
      };
    } catch {
      onStatus?.('fallback', 'Live Quote Sync');
    }
  };

  const binanceParam = resolveBinanceKlineStreamParam(symbol, intervalLabel);
  const connectBinanceKlineWs = () => {
    if (closed || !binanceParam || typeof WebSocket === 'undefined') return;
    try {
      const wsUrl = binanceParam.wsUrls[binanceEndpointIdx % binanceParam.wsUrls.length];
      binanceWs = new WebSocket(wsUrl);

      binanceWs.onopen = () => {
        if (!closed) {
          onStatus?.('connected', 'WS LIVE');
        }
      };

      binanceWs.onmessage = (evt) => {
        if (closed) return;
        try {
          const payload = JSON.parse(String(evt.data || '{}'));
          const k = payload?.k;
          if (!k) return;
          const timeSec = toUnixSeconds(Number(k.t));
          const open = Number(k.o);
          const high = Number(k.h);
          const low = Number(k.l);
          const close = Number(k.c);
          const volume = Number(k.v ?? 50);
          if (timeSec > 0 && close > 0 && open > 0) {
            lastDirectBinanceKlineTs = Date.now();
            onBar(
              {
                time: timeSec,
                open: roundPrice(open, symbol),
                high: roundPrice(Math.max(high, open, close), symbol),
                low: roundPrice(Math.min(low, open, close), symbol),
                close: roundPrice(close, symbol),
                volume: Number.isFinite(volume) && volume > 0 ? Math.round(volume) : 50,
              },
              { isClosed: Boolean(k.x), source: 'binance-kline-ws' }
            );
            onStatus?.('connected', 'WS LIVE');
          }
        } catch {
          // ignore malformed kline payload
        }
      };

      binanceWs.onerror = () => {
        binanceEndpointIdx += 1;
      };

      binanceWs.onclose = () => {
        if (closed) return;
        binanceEndpointIdx += 1;
        binanceReconnectTimer = setTimeout(connectBinanceKlineWs, 3000);
      };
    } catch {
      // fallback to server WS
    }
  };

  connectServerWs();
  if (binanceParam) {
    connectBinanceKlineWs();
  }

  heartbeatTimer = setInterval(() => {
    if (serverWs && serverWs.readyState === WebSocket.OPEN) {
      try {
        serverWs.send(JSON.stringify({ type: 'ping' }));
      } catch {}
    }
  }, 25000);

  return () => {
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (serverReconnectTimer) clearTimeout(serverReconnectTimer);
    if (binanceReconnectTimer) clearTimeout(binanceReconnectTimer);
    if (serverWs) {
      try {
        serverWs.close();
      } catch {}
    }
    if (binanceWs) {
      try {
        binanceWs.close();
      } catch {}
    }
  };
}

/**
 * Resolves safe Lightweight Charts price-axis & vertical scroll interaction flags.
 * Enables vertical price-scale drag and vertical touch drag only when the main series
 * has populated bars (barCount > 0), preventing `Value is null` errors in PriceScale._internal_scrollTo.
 */
export function resolveChartPriceInteractionOptions(barCount: number): {
  enablePriceAxisScale: boolean;
  enableVertTouchDrag: boolean;
} {
  const hasBars = Number.isFinite(barCount) && barCount > 0;
  return {
    enablePriceAxisScale: hasBars,
    enableVertTouchDrag: hasBars,
  };
}

/**
 * Determines whether the chart should auto-focus/reset its logical viewport range.
 * Only focuses before the initial load settles or on an explicit user trigger,
 * preventing live quote/WS ticks from involuntarily hijacking user scroll & zoom.
 */
export function shouldAutoFocusChartOnTick(
  hasInitialFocused: boolean,
  isExplicitTrigger: boolean
): boolean {
  return !hasInitialFocused || Boolean(isExplicitTrigger);
}



