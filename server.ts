import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { mergeUserDirectories } from './src/engine/userVault';
import {
  getMarketStatus,
  INSTRUMENTS,
  roundPrice,
  SymbolCode,
  validatePayoutRequestAgainstRules,
} from './src/engine/tradingEngine';

function readCliFlag(names: string[]): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    for (const name of names) {
      if (arg === name && args[i + 1] && !args[i + 1].startsWith('-')) {
        return args[i + 1];
      }
      if (arg.startsWith(`${name}=`)) {
        return arg.slice(name.length + 1);
      }
    }
  }
  return undefined;
}

const cliPortRaw = readCliFlag(['--port', '-p']);
const envPortRaw =
  process.env.PORT && process.env.PORT !== process.env.NGINX_PORT
    ? process.env.PORT
    : process.env.DEFAULT_APP_PORT;
const PORT = Number(cliPortRaw || envPortRaw) || 3000;
const HOST = readCliFlag(['--host']) || '0.0.0.0';

// When running via `node dist/server.cjs` (production start script), __filename ends with 'server.cjs'.
// When running via `tsx server.ts` (`npm run dev`), it runs in development mode with Vite middleware.
const isBundledProdServer =
  typeof __filename !== 'undefined' && __filename.endsWith('server.cjs');

const isProduction =
  isBundledProdServer || process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Cloud Run & Load Balancer Health Check Endpoints
  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'fundedapex.com',
      supportEmail: 'fundedapexsupport@gmail.com',
      mode: isProduction ? 'production' : 'development',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/healthz', (_req, res) => {
    res.status(200).send('ok');
  });

  // Persistent server-side vault file so user accounts, profiles, orders, and settings survive any web update or reload
  const DATA_DIR = path.resolve(process.cwd(), '.data');
  const VAULT_FILE = path.join(DATA_DIR, 'apex_vault.json');

  let memoryVaultCache: Record<string, any> | null = null;

  function readServerVault(): Record<string, any> {
    if (memoryVaultCache !== null) {
      return memoryVaultCache;
    }
    try {
      if (fs.existsSync(VAULT_FILE)) {
        const raw = fs.readFileSync(VAULT_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          memoryVaultCache = parsed;
          return parsed;
        }
      }
    } catch {
      // ignore read errors
    }
    memoryVaultCache = {};
    return memoryVaultCache;
  }

  function writeServerVault(incoming: Record<string, any>): Record<string, any> {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const existing = readServerVault();
      const mergeById = (arrA: any[] = [], arrB: any[] = [], keyField = 'id') => {
        const map = new Map<string, any>();
        for (const item of arrA) {
          if (item && item[keyField]) map.set(String(item[keyField]), item);
        }
        for (const item of arrB) {
          if (item && item[keyField]) {
            const prev = map.get(String(item[keyField]));
            map.set(String(item[keyField]), prev ? { ...prev, ...item } : item);
          }
        }
        return Array.from(map.values());
      };

      // Normalize incoming purchase requests (support array, single item, and snake_case alias)
      let incomingPurchaseRequests = incoming.purchaseRequests || incoming.purchase_requests || [];
      if (incoming.purchaseRequest && typeof incoming.purchaseRequest === 'object') {
        incomingPurchaseRequests = [incoming.purchaseRequest, ...(Array.isArray(incomingPurchaseRequests) ? incomingPurchaseRequests : [])];
      }

      // Normalize incoming payout requests (support array, single item, and snake_case alias)
      let incomingPayouts = incoming.payouts || incoming.payout_requests || [];
      if (incoming.payoutRequest && typeof incoming.payoutRequest === 'object') {
        incomingPayouts = [
          incoming.payoutRequest,
          ...(Array.isArray(incomingPayouts) ? incomingPayouts : []),
        ];
      }

      // Track deleted payout tombstones so stale clients cannot resurrect deleted payouts
      const incomingDeletedPayoutIds: string[] = Array.isArray(incoming.deletedPayoutIds)
        ? incoming.deletedPayoutIds.map((id: any) => String(id))
        : [];
      const existingDeletedPayoutIds: string[] = Array.isArray(existing.deletedPayoutIds)
        ? existing.deletedPayoutIds.map((id: any) => String(id))
        : [];
      const unarchivedIds = new Set<string>(
        incoming.payoutRequest?.id ? [String(incoming.payoutRequest.id)] : []
      );
      const deletedPayoutSet = new Set<string>(
        [...existingDeletedPayoutIds, ...incomingDeletedPayoutIds].filter(
          (id) => id && !unarchivedIds.has(id)
        )
      );

      const mergedPayouts = mergeById(existing.payouts, incomingPayouts, 'id').filter(
        (p: any) => p?.id && !deletedPayoutSet.has(String(p.id))
      );

      const incomingDeletedCouponIds: string[] = Array.isArray(incoming.deletedCouponIds)
        ? incoming.deletedCouponIds.map((id: any) => String(id))
        : [];
      const existingDeletedCouponIds: string[] = Array.isArray(existing.deletedCouponIds)
        ? existing.deletedCouponIds.map((id: any) => String(id))
        : [];
      const deletedCouponSet = new Set<string>(
        [...existingDeletedCouponIds, ...incomingDeletedCouponIds].filter(Boolean)
      );

      const mergedAdminCoupons = (
        incoming.replaceAdminCoupons && Array.isArray(incoming.adminCoupons)
          ? incoming.adminCoupons
          : mergeById(existing.adminCoupons, incoming.adminCoupons, 'id')
      ).filter((c: any) => c?.id && !deletedCouponSet.has(String(c.id)));

      const merged = {
        ...existing,
        ...incoming,
        users: mergeUserDirectories(existing.users, incoming.users),
        accounts: mergeById(existing.accounts, incoming.accounts || incoming.trading_accounts, 'id'),
        orders: mergeById(existing.orders, incoming.orders, 'id'),
        purchaseRequests: mergeById(existing.purchaseRequests, incomingPurchaseRequests, 'id'),
        coupons: mergeById(existing.coupons, incoming.coupons, 'id'),
        adminCoupons: mergedAdminCoupons,
        deletedCouponIds: Array.from(deletedCouponSet),
        payouts: mergedPayouts,
        deletedPayoutIds: Array.from(deletedPayoutSet),
        emailNotifications: mergeById(
          existing.emailNotifications,
          incoming.emailNotifications,
          'id'
        ),
        paymentSettings: incoming.paymentSettings
          ? { ...(existing.paymentSettings || {}), ...incoming.paymentSettings }
          : existing.paymentSettings,
        updatedAt: new Date().toISOString(),
      };
      memoryVaultCache = merged;
      fs.writeFileSync(VAULT_FILE, JSON.stringify(merged), 'utf-8');
      return merged;
    } catch {
      return incoming;
    }
  }

  app.get('/api/vault/sync', (_req, res) => {
    const data = readServerVault();
    res.status(200).json({ ok: true, vault: data });
  });

  app.post('/api/vault/sync', (req, res) => {
    const merged = writeServerVault(req.body || {});
    res.status(200).json({ ok: true, vault: merged });
  });

  // Dedicated instant save endpoint for atomic updates
  app.post('/api/vault/save', (req, res) => {
    const merged = writeServerVault(req.body || {});
    res.status(200).json({ ok: true, vault: merged });
  });

  // Dedicated instant order purchase request receiver
  app.post('/api/vault/purchase-request', (req, res) => {
    const payload = req.body;
    if (!payload || (!payload.id && !payload.orderNumber)) {
      res.status(400).json({ ok: false, error: 'Invalid purchase request payload.' });
      return;
    }
    const merged = writeServerVault({ purchaseRequest: payload });
    res.status(200).json({
      ok: true,
      message: 'Purchase request received and secured in institutional vault.',
      purchaseRequests: merged.purchaseRequests,
    });
  });

  // Dedicated query endpoint for Admin Panel to fetch all purchase requests
  app.get('/api/vault/purchase-requests', (_req, res) => {
    const data = readServerVault();
    res.status(200).json({
      ok: true,
      purchaseRequests: Array.isArray(data.purchaseRequests) ? data.purchaseRequests : [],
    });
  });

  // Dedicated instant trader payout request receiver with server-side challenge rule validation
  app.post('/api/vault/payout-request', (req, res) => {
    const payload = req.body;
    if (!payload || !payload.id) {
      res.status(400).json({ ok: false, error: 'Invalid payout request payload.' });
      return;
    }

    const amountUsd = Number(payload.amountUsd);
    const destination = String(payload.destination || '').trim();
    const method = String(payload.currency || payload.paymentMethod || 'USDT').trim();
    if (!Number.isFinite(amountUsd) || amountUsd < 20) {
      res.status(400).json({ ok: false, error: 'Minimum payout withdrawal amount is $20.00 USD.' });
      return;
    }
    if (destination.length < 8) {
      res.status(400).json({
        ok: false,
        error: 'Please enter a valid receiving wallet address or bank wire destination (minimum 8 characters).',
      });
      return;
    }

    const existingVault = readServerVault();
    const storedAcc = Array.isArray(existingVault.accounts)
      ? existingVault.accounts.find((a: any) => a && a.id === payload.accountId)
      : null;

    if (storedAcc) {
      const vaultOrders = Array.isArray(existingVault.orders) ? existingVault.orders : [];
      const openOrders = vaultOrders.filter(
        (o: any) => o && o.accountId === storedAcc.id && o.status === 'OPEN'
      );
      const closedOrders = vaultOrders.filter(
        (o: any) => o && o.accountId === storedAcc.id && o.status === 'CLOSED'
      );
      const existingPayouts = Array.isArray(existingVault.payouts) ? existingVault.payouts : [];
      const serverCheck = validatePayoutRequestAgainstRules({
        account: storedAcc,
        amountUsd,
        method,
        destination,
        openOrders,
        closedOrders,
        existingPayouts,
      });
      if (!serverCheck.valid) {
        res.status(400).json({
          ok: false,
          error: serverCheck.error || serverCheck.eligibility.reason,
          eligibility: serverCheck.eligibility,
        });
        return;
      }
    }

    const merged = writeServerVault({ payoutRequest: payload });
    res.status(200).json({
      ok: true,
      message: 'Payout request received and synced to Admin Panel vault.',
      payouts: merged.payouts,
    });
  });

  // Dedicated query endpoint for Admin Panel to fetch all payouts
  app.get('/api/vault/payouts', (_req, res) => {
    const data = readServerVault();
    res.status(200).json({
      ok: true,
      payouts: Array.isArray(data.payouts) ? data.payouts : [],
      deletedPayoutIds: Array.isArray(data.deletedPayoutIds) ? data.deletedPayoutIds : [],
    });
  });

  app.delete('/api/vault/payout/:id', (req, res) => {
    const payoutId = String(req.params.id || '').trim();
    if (!payoutId) {
      res.status(400).json({ ok: false, error: 'Missing payout id.' });
      return;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const existing = readServerVault();
      const nextPayouts = Array.isArray(existing.payouts)
        ? existing.payouts.filter((p: any) => p?.id !== payoutId)
        : [];
      const prevDeleted = Array.isArray(existing.deletedPayoutIds)
        ? existing.deletedPayoutIds.map((id: any) => String(id))
        : [];
      const deletedPayoutIds = Array.from(new Set([...prevDeleted, payoutId]));
      const updated = {
        ...existing,
        payouts: nextPayouts,
        deletedPayoutIds,
        updatedAt: new Date().toISOString(),
      };
      memoryVaultCache = updated;
      fs.writeFileSync(VAULT_FILE, JSON.stringify(updated), 'utf-8');
      res.status(200).json({ ok: true, payouts: nextPayouts, deletedPayoutIds });
    } catch {
      res.status(500).json({ ok: false, error: 'Failed to delete payout.' });
    }
  });

  // Branded FUNDED APEX Email Notification Dispatch & Inbox Endpoints
  app.post('/api/email/dispatch', (req, res) => {
    const mail = req.body;
    if (!mail || !mail.to || !mail.subject) {
      res.status(400).json({ ok: false, error: 'Missing required email fields (to, subject).' });
      return;
    }
    const existing = readServerVault();
    const list = Array.isArray(existing.emailNotifications) ? existing.emailNotifications : [];
    const enriched = {
      ...mail,
      id: mail.id || `mail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sentAt: mail.sentAt || new Date().toISOString(),
      deliveryStatus: 'delivered',
    };
    writeServerVault({ emailNotifications: [enriched, ...list.slice(0, 199)] });
    res.status(200).json({
      ok: true,
      email: enriched,
      provider: 'FUNDED APEX Transactional Mail Relay (fundedapexsupport@gmail.com)',
    });
  });

  app.get('/api/email/inbox', (req, res) => {
    const emailFilter = String(req.query.email || '').trim().toLowerCase();
    const existing = readServerVault();
    const list: any[] = Array.isArray(existing.emailNotifications)
      ? existing.emailNotifications
      : [];
    const filtered = emailFilter
      ? list.filter(
          (m) =>
            String(m.to || '').toLowerCase() === emailFilter ||
            String(m.to || '').toLowerCase() === 'all@fundedapex.com'
        )
      : list;
    res.status(200).json({ ok: true, emails: filtered });
  });

  // Server-side live market quotes proxy with 2.2s TTL cache & in-flight request deduplication
  type ServerSpotQuote = {
    bid: number;
    ask: number;
    change24hPct?: number;
    high24h?: number;
    low24h?: number;
  };

  let cachedQuotesResponse: {
    ts: number;
    payload: { ok: boolean; tickers: any[]; spotQuotes: Record<string, ServerSpotQuote> };
  } | null = null;
  let inFlightQuotesPromise: Promise<{
    ok: boolean;
    tickers: any[];
    spotQuotes: Record<string, ServerSpotQuote>;
  }> | null = null;

  let cachedYahooMeta: {
    ts: number;
    data: Record<
      string,
      { price: number; change24hPct: number; high24h: number; low24h: number }
    >;
  } | null = null;
  let inFlightYahooMetaPromise: Promise<
    Record<string, { price: number; change24hPct: number; high24h: number; low24h: number }>
  > | null = null;

  const yahooMetaPairs: [SymbolCode, string][] = [
    ['XAUUSD', 'GC=F'],
    ['XAGUSD', 'SI=F'],
    ['USOIL', 'CL=F'],
    ['UKOIL', 'BZ=F'],
    ['NAS100', 'NQ=F'],
    ['US30', 'YM=F'],
    ['US500', 'ES=F'],
    ['GER40', '^GDAXI'],
    ['UK100', '^FTSE'],
    ['EURUSD', 'EURUSD=X'],
    ['GBPUSD', 'GBPUSD=X'],
    ['USDJPY', 'JPY=X'],
    ['USDCHF', 'CHF=X'],
    ['AUDUSD', 'AUDUSD=X'],
    ['USDCAD', 'CAD=X'],
    ['NZDUSD', 'NZDUSD=X'],
    ['EURGBP', 'EURGBP=X'],
    ['EURJPY', 'EURJPY=X'],
    ['GBPJPY', 'GBPJPY=X'],
    ['BTCUSD', 'BTC-USD'],
    ['ETHUSD', 'ETH-USD'],
    ['SOLUSD', 'SOL-USD'],
    ['XRPUSD', 'XRP-USD'],
    ['BNBUSD', 'BNB-USD'],
  ];

  const refreshYahooMetaInBackground = (): Promise<
    Record<string, { price: number; change24hPct: number; high24h: number; low24h: number }>
  > => {
    if (inFlightYahooMetaPromise) {
      return inFlightYahooMetaPromise;
    }

    inFlightYahooMetaPromise = (async () => {
      const nextMeta: Record<
        string,
        { price: number; change24hPct: number; high24h: number; low24h: number }
      > = { ...(cachedYahooMeta?.data || {}) };

      await Promise.all(
        yahooMetaPairs.map(async ([sym, ticker]) => {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 1600);
            const r = await fetch(
              `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
                ticker
              )}?interval=15m&range=5d`,
              {
                signal: ctrl.signal,
                headers: { 'User-Agent': 'Mozilla/5.0' },
              }
            );
            clearTimeout(timer);
            if (!r.ok) return;
            const j = await r.json();
            const result = j?.chart?.result?.[0];
            const meta = result?.meta;
            const price = Number(meta?.regularMarketPrice);
            if (!Number.isFinite(price) || price <= 0) return;
            const prev = Number(meta?.chartPreviousClose || meta?.previousClose || price);
            const change24hPct =
              prev > 0 ? Math.round(((price - prev) / prev) * 10000) / 100 : 0;
            const high24h = Number(meta?.regularMarketDayHigh) > 0 ? Number(meta.regularMarketDayHigh) : price;
            const low24h = Number(meta?.regularMarketDayLow) > 0 ? Number(meta.regularMarketDayLow) : price;
            nextMeta[sym] = {
              price,
              change24hPct,
              high24h: Math.max(high24h, price),
              low24h: Math.min(low24h, price),
            };
          } catch {
            // keep existing cached entry if any
          }
        })
      );

      if (Object.keys(nextMeta).length > 0) {
        cachedYahooMeta = { ts: Date.now(), data: nextMeta };
      }
      return nextMeta;
    })().finally(() => {
      inFlightYahooMetaPromise = null;
    });

    return inFlightYahooMetaPromise;
  };

  const fetchYahooMetaSnapshot = async () => {
    const now = Date.now();
    if (cachedYahooMeta) {
      if (now - cachedYahooMeta.ts >= 10000 && !inFlightYahooMetaPromise) {
        void refreshYahooMetaInBackground();
      }
      return cachedYahooMeta.data;
    }
    return refreshYahooMetaInBackground();
  };

  // Warm Yahoo meta cache on server boot so first /api/market/quotes request is sub-second
  void refreshYahooMetaInBackground();

  const fetchMarketQuotesSnapshot = async () => {
    const now = Date.now();
    if (cachedQuotesResponse && now - cachedQuotesResponse.ts < 1500) {
      return cachedQuotesResponse.payload;
    }
    if (inFlightQuotesPromise) {
      return inFlightQuotesPromise;
    }

    const symbolsParam = encodeURIComponent(
      JSON.stringify([
        'BTCUSDT',
        'ETHUSDT',
        'SOLUSDT',
        'XRPUSDT',
        'BNBUSDT',
        'PAXGUSDT',
      ])
    );

    const swissquotePairs: [SymbolCode, string][] = [
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

    const spotQuotes: Record<string, ServerSpotQuote> = {};

    const fetchSwissquote = async () => {
      await Promise.all(
        swissquotePairs.map(async ([sym, sqPath]) => {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 1600);
            const r = await fetch(
              `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${sqPath}`,
              { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }
            );
            clearTimeout(timer);
            if (r.ok) {
              const j = await r.json();
              const prices = j?.[0]?.spreadProfilePrices;
              const best =
                prices?.find((p: any) =>
                  /zero|prime|premium|standard|elite/i.test(p.spreadProfile || '')
                ) || prices?.[0];
              if (best && Number(best.bid) > 0 && Number(best.ask) > 0) {
                spotQuotes[sym] = {
                  bid: Number(best.bid),
                  ask: Number(best.ask),
                };
              }
            }
          } catch {
            // fallback handled below
          }
        })
      );

      if (!spotQuotes.XAUUSD) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 1600);
          const r = await fetch('https://api.gold-api.com/price/XAU', { signal: ctrl.signal });
          clearTimeout(timer);
          if (r.ok) {
            const j = await r.json();
            const price = Number(j?.price);
            if (price > 0) {
              spotQuotes.XAUUSD = { bid: price - 0.18, ask: price + 0.18 };
            }
          }
        } catch {}
      }
    };

    const fetchBinance = async (): Promise<any[]> => {
      for (const host of ['https://data-api.binance.vision', 'https://api.binance.com']) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 1800);
          const r = await fetch(`${host}/api/v3/ticker/24hr?symbols=${symbolsParam}`, {
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data)) return data;
          }
        } catch {
          // try next host
        }
      }
      return [];
    };

    inFlightQuotesPromise = (async () => {
      const [, tickers, yahooMeta] = await Promise.all([
        fetchSwissquote(),
        fetchBinance(),
        fetchYahooMetaSnapshot(),
      ]);

      // Merge Yahoo Finance live prices & 24h metrics into spotQuotes so all 24 symbols have 1:1 market quotes
      for (const [sym] of yahooMetaPairs) {
        const ym = yahooMeta[sym];
        const existingSq = spotQuotes[sym];
        const spec = INSTRUMENTS[sym];
        if (!spec) continue;
        if (existingSq && existingSq.bid > 0) {
          if (ym) {
            existingSq.change24hPct = ym.change24hPct;
            existingSq.high24h = roundPrice(Math.max(existingSq.bid, ym.high24h), sym);
            existingSq.low24h = roundPrice(Math.min(existingSq.bid, ym.low24h), sym);
          }
        } else if (ym && ym.price > 0) {
          const bid = roundPrice(ym.price, sym);
          const ask = roundPrice(bid + spec.spread, sym);
          spotQuotes[sym] = {
            bid,
            ask,
            change24hPct: ym.change24hPct,
            high24h: roundPrice(Math.max(bid, ym.high24h), sym),
            low24h: roundPrice(Math.min(bid, ym.low24h), sym),
          };
        }
      }

      const payload = {
        ok: tickers.length > 0 || Object.keys(spotQuotes).length > 0,
        tickers,
        spotQuotes,
      };
      if (payload.ok) {
        cachedQuotesResponse = { ts: Date.now(), payload };
      }
      return payload;
    })();

    try {
      return await inFlightQuotesPromise;
    } finally {
      inFlightQuotesPromise = null;
    }
  };

  app.get('/api/market/quotes', async (_req, res) => {
    try {
      const result = await fetchMarketQuotesSnapshot();
      res.status(200).json(result);
    } catch {
      res.status(200).json({ ok: false, tickers: [], spotQuotes: {} });
    }
  });

  // Server-side live historical klines proxy with 6s TTL cache per symbol:interval:limit
  const klinesCache = new Map<
    string,
    { ts: number; payload: { ok: boolean; klines: any[]; source?: string; metaPrice?: number } }
  >();

  const aggregateParsedKlineBars = (
    bars: [number, string, string, string, string, string][],
    bucketSec: number
  ): [number, string, string, string, string, string][] => {
    const bucketMap = new Map<number, [number, string, string, string, string, string]>();
    for (const bar of bars) {
      const tsSec = Math.floor(bar[0] / 1000);
      const bucketStartMs = Math.floor(tsSec / bucketSec) * bucketSec * 1000;
      const o = parseFloat(bar[1]);
      const h = parseFloat(bar[2]);
      const l = parseFloat(bar[3]);
      const c = parseFloat(bar[4]);
      const v = parseFloat(bar[5]);
      const existing = bucketMap.get(bucketStartMs);
      if (!existing) {
        bucketMap.set(bucketStartMs, [
          bucketStartMs,
          String(o),
          String(h),
          String(l),
          String(c),
          String(v),
        ]);
      } else {
        existing[2] = String(Math.max(parseFloat(existing[2]), h));
        existing[3] = String(Math.min(parseFloat(existing[3]), l));
        existing[4] = String(c);
        existing[5] = String(parseFloat(existing[5]) + v);
      }
    }
    return Array.from(bucketMap.values());
  };

  app.get('/api/market/klines', async (req, res) => {
    const rawSymbol = String(req.query.symbol || 'XAUUSD').toUpperCase();
    const interval = String(req.query.interval || '15m');
    const limit = Math.min(500, Math.max(20, Number(req.query.limit) || 350));
    const cacheKey = `${rawSymbol}:${interval}:${limit}`;
    const cachedKline = klinesCache.get(cacheKey);
    if (cachedKline && Date.now() - cachedKline.ts < 6000) {
      res.status(200).json(cachedKline.payload);
      return;
    }

    const isDirectCrypto = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'].includes(rawSymbol);

    // 1. For Direct Crypto pairs, try Binance first for native exchange candlesticks
    if (isDirectCrypto) {
      const binanceSymbolMap: Record<string, string> = {
        BTCUSD: 'BTCUSDT',
        ETHUSD: 'ETHUSDT',
        SOLUSD: 'SOLUSDT',
        XRPUSD: 'XRPUSDT',
        BNBUSD: 'BNBUSDT',
      };
      const binanceSymbol = binanceSymbolMap[rawSymbol] || rawSymbol;
      const binanceInterval = interval === '1D' ? '1d' : interval === '1W' ? '1w' : interval;

      for (const host of ['https://data-api.binance.vision', 'https://api.binance.com']) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 2800);
          const r = await fetch(
            `${host}/api/v3/klines?symbol=${encodeURIComponent(
              binanceSymbol
            )}&interval=${encodeURIComponent(binanceInterval)}&limit=${limit}`,
            { signal: ctrl.signal }
          );
          clearTimeout(timer);
          if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data) && data.length >= 15) {
              const lastClose = Number(data[data.length - 1]?.[4]);
              const payloadBin = {
                ok: true,
                klines: data,
                source: 'binance',
                metaPrice: Number.isFinite(lastClose) && lastClose > 0 ? lastClose : undefined,
              };
              klinesCache.set(cacheKey, { ts: Date.now(), payload: payloadBin });
              res.status(200).json(payloadBin);
              return;
            }
          }
        } catch {
          // fallback to Yahoo Finance below if Binance is unreachable
        }
      }
    }

    // 2. Yahoo Finance v8 ticker mapping for all 24 symbols (Gold, Silver, Oil, NatGas, Forex, Indices & Crypto fallback)
    const yahooSymbolMap: Record<string, string> = {
      XAUUSD: 'GC=F',
      GOLD: 'GC=F',
      PAXGUSDT: 'GC=F',
      XAGUSD: 'SI=F',
      USOIL: 'CL=F',
      UKOIL: 'BZ=F',
      NATGAS: 'NG=F',
      EURUSD: 'EURUSD=X',
      GBPUSD: 'GBPUSD=X',
      USDJPY: 'JPY=X',
      USDCHF: 'CHF=X',
      AUDUSD: 'AUDUSD=X',
      USDCAD: 'CAD=X',
      NZDUSD: 'NZDUSD=X',
      EURGBP: 'EURGBP=X',
      EURJPY: 'EURJPY=X',
      GBPJPY: 'GBPJPY=X',
      AUDJPY: 'AUDJPY=X',
      EURAUD: 'EURAUD=X',
      NAS100: 'NQ=F',
      US30: 'YM=F',
      US500: 'ES=F',
      GER40: '^GDAXI',
      UK100: '^FTSE',
      BTCUSD: 'BTC-USD',
      ETHUSD: 'ETH-USD',
      SOLUSD: 'SOL-USD',
      XRPUSD: 'XRP-USD',
      BNBUSD: 'BNB-USD',
    };

    const yahooTicker = yahooSymbolMap[rawSymbol];
    if (yahooTicker) {
      try {
        const normInt = interval === '1M' ? '1mo' : interval.toLowerCase();
        const is3m = normInt === '3m';
        const is2h = normInt === '2h';
        const is4h = normInt === '4h';
        const yfInterval =
          normInt === '1s' || normInt === '1m' || is3m
            ? '1m'
            : normInt === '5m'
            ? '5m'
            : normInt === '15m'
            ? '15m'
            : normInt === '30m'
            ? '30m'
            : normInt === '1h' || is2h || is4h
            ? '60m'
            : normInt === '1w'
            ? '1wk'
            : normInt === '1mo'
            ? '1mo'
            : '1d';
        const yfRange =
          normInt === '1s' || normInt === '1m' || is3m
            ? '5d'
            : normInt === '5m' || normInt === '15m' || normInt === '30m'
            ? '1mo'
            : normInt === '1h' || is2h || is4h
            ? '6mo'
            : normInt === '1w' || normInt === '1mo'
            ? '5y'
            : '2y';

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3500);
        const yfRes = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            yahooTicker
          )}?interval=${yfInterval}&range=${yfRange}`,
          {
            signal: ctrl.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          }
        );
        clearTimeout(timer);

        if (yfRes.ok) {
          const yfJson = await yfRes.json();
          const result = yfJson?.chart?.result?.[0];
          const metaPriceRaw = Number(result?.meta?.regularMarketPrice);
          const metaPrice =
            Number.isFinite(metaPriceRaw) && metaPriceRaw > 0 ? metaPriceRaw : undefined;
          const timestamps: number[] = result?.timestamp || [];
          const quoteObj = result?.indicators?.quote?.[0] || {};
          const opens: (number | null)[] = quoteObj.open || [];
          const highs: (number | null)[] = quoteObj.high || [];
          const lows: (number | null)[] = quoteObj.low || [];
          const closes: (number | null)[] = quoteObj.close || [];
          const volumes: (number | null)[] = quoteObj.volume || [];

          const parsedBars: [number, string, string, string, string, string][] = [];
          for (let i = 0; i < timestamps.length; i++) {
            const o = opens[i];
            const h = highs[i];
            const l = lows[i];
            const c = closes[i];
            if (
              o === null ||
              h === null ||
              l === null ||
              c === null ||
              !Number.isFinite(o) ||
              !Number.isFinite(h) ||
              !Number.isFinite(l) ||
              !Number.isFinite(c) ||
              o <= 0 ||
              c <= 0
            ) {
              continue;
            }
            const rawVol = volumes[i];
            const v =
              rawVol && Number.isFinite(rawVol) && Number(rawVol) > 0
                ? Number(rawVol)
                : Math.max(40, Math.round(((h - l) / Math.max(1e-6, c)) * 35000));
            parsedBars.push([
              timestamps[i] * 1000,
              String(o),
              String(h),
              String(l),
              String(c),
              String(v),
            ]);
          }

          if (parsedBars.length >= 15) {
            const normSym = (rawSymbol === 'GOLD' ? 'XAUUSD' : rawSymbol) as SymbolCode;
            const isOpenNow = getMarketStatus(normSym).isOpen;
            const stepMap: Record<string, number> = {
              '1s': 1,
              '1m': 60,
              '3m': 180,
              '5m': 300,
              '15m': 900,
              '30m': 1800,
              '1h': 3600,
              '2h': 7200,
              '4h': 14400,
              '1d': 86400,
              '1D': 86400,
            };
            const stepSec = stepMap[interval] || stepMap[interval.toLowerCase()] || 0;
            const stepMs = stepSec * 1000;

            // Yahoo Finance appends a trailing real-time quote bar where O=H=L=C at regularMarketTime;
            // merge into prevBar if in the same bucket, or snap its timestamp to the new bucket boundary
            if (parsedBars.length >= 2) {
              const lastBar = parsedBars[parsedBars.length - 1];
              const prevBar = parsedBars[parsedBars.length - 2];
              const lastO = parseFloat(lastBar[1]);
              const lastH = parseFloat(lastBar[2]);
              const lastL = parseFloat(lastBar[3]);
              const lastC = parseFloat(lastBar[4]);
              const prevClose = parseFloat(prevBar[4]);
              const lastBucket =
                stepMs > 0 ? Math.floor(Number(lastBar[0]) / stepMs) * stepMs : Number(lastBar[0]);
              const prevBucket =
                stepMs > 0 ? Math.floor(Number(prevBar[0]) / stepMs) * stepMs : Number(prevBar[0]);

              if (lastO === lastH && lastH === lastL && lastL === lastC) {
                if (lastBucket <= prevBucket) {
                  prevBar[2] = String(Math.max(parseFloat(prevBar[2]), lastC));
                  prevBar[3] = String(Math.min(parseFloat(prevBar[3]), lastC));
                  prevBar[4] = String(lastC);
                  parsedBars.pop();
                } else if (Number.isFinite(prevClose) && prevClose > 0) {
                  lastBar[0] = lastBucket;
                  lastBar[1] = String(prevClose);
                  lastBar[2] = String(Math.max(prevClose, lastC));
                  lastBar[3] = String(Math.min(prevClose, lastC));
                  lastBar[4] = String(lastC);
                }
              } else if (stepMs > 0 && lastBucket === prevBucket) {
                prevBar[2] = String(Math.max(parseFloat(prevBar[2]), lastH));
                prevBar[3] = String(Math.min(parseFloat(prevBar[3]), lastL));
                prevBar[4] = String(lastC);
                parsedBars.pop();
              } else if (stepMs > 0 && Number(lastBar[0]) !== lastBucket) {
                lastBar[0] = lastBucket;
              }
            }

            let finalBars = parsedBars;
            if (is3m) {
              finalBars = aggregateParsedKlineBars(parsedBars, 180);
            } else if (is2h) {
              finalBars = aggregateParsedKlineBars(parsedBars, 7200);
            } else if (is4h) {
              finalBars = aggregateParsedKlineBars(parsedBars, 14400);
            }

            // Synchronize delayed exchange timestamps (e.g. Yahoo 10-15m futures/FX delay) to current real-time bucket when market is open
            if (isOpenNow && stepMs > 0 && finalBars.length > 0) {
              const currentBucketMs = Math.floor(Date.now() / stepMs) * stepMs;
              const lastBarMs = Number(finalBars[finalBars.length - 1][0]);
              const lastBucketMs = Math.floor(lastBarMs / stepMs) * stepMs;
              const deltaMs = currentBucketMs - lastBucketMs;
              if (deltaMs > 0 && deltaMs <= 86400 * 1000 * 3) {
                finalBars = finalBars.map((b) => [
                  Math.floor(Number(b[0]) / stepMs) * stepMs + deltaMs,
                  b[1],
                  b[2],
                  b[3],
                  b[4],
                  b[5],
                ]);
              } else if (deltaMs === 0 && lastBarMs !== currentBucketMs) {
                finalBars[finalBars.length - 1][0] = currentBucketMs;
              }
            }

            const payloadStd = {
              ok: true,
              klines: finalBars.slice(-limit),
              source: 'yahoo',
              metaPrice,
            };
            klinesCache.set(cacheKey, { ts: Date.now(), payload: payloadStd });
            res.status(200).json(payloadStd);
            return;
          }
        }
      } catch {
        // fallback below if applicable
      }
    }

    res.status(200).json({ ok: false, klines: [] });
  });

  const httpServer = http.createServer(app);

  // Real-time WebSocket OHLC subscription server (/ws/ohlc) for TradingTerminalChart
  const ohlcWss = new WebSocketServer({ noServer: true });
  type OhlcSubscription = { symbol: string; interval: string };
  const ohlcSubscribers = new Map<WebSocket, OhlcSubscription>();
  const formingOhlcBars = new Map<
    string,
    { time: number; open: number; high: number; low: number; close: number; volume: number }
  >();
  const lastBroadcastPrices = new Map<string, number>();

  const resolveIntervalSeconds = (intervalRaw: string): number => {
    const key = String(intervalRaw || '15m').trim();
    const map: Record<string, number> = {
      '1s': 1,
      '1m': 60,
      '3m': 180,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '2h': 7200,
      '4h': 14400,
      '1d': 86400,
      '1D': 86400,
      '1w': 604800,
      '1W': 604800,
      '1M': 2592000,
      '1mo': 2592000,
    };
    return map[key] || map[key.toLowerCase()] || 900;
  };

  const resolveLatestBarFromKlineCache = (symbol: string, interval: string) => {
    const cached =
      klinesCache.get(`${symbol}:${interval}:350`) ||
      klinesCache.get(`${symbol}:${interval}:150`) ||
      Array.from(klinesCache.entries()).find(([k]) => k.startsWith(`${symbol}:${interval}:`))?.[1];
    const klines = cached?.payload?.klines;
    if (!Array.isArray(klines) || klines.length === 0) return null;
    const last = klines[klines.length - 1];
    if (!Array.isArray(last) || last.length < 5) return null;
    const rawTs = Number(last[0]);
    const timeSec = rawTs > 1e11 ? Math.floor(rawTs / 1000) : Math.floor(rawTs);
    const open = Number(last[1]);
    const high = Number(last[2]);
    const low = Number(last[3]);
    const close = Number(last[4]);
    const volume = Number(last[5] || 100);
    if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(timeSec)) return null;
    return {
      time: timeSec,
      open: Number.isFinite(open) && open > 0 ? open : close,
      high: Number.isFinite(high) && high > 0 ? Math.max(high, open, close) : close,
      low: Number.isFinite(low) && low > 0 ? Math.min(low, open, close) : close,
      close,
      volume: Number.isFinite(volume) && volume > 0 ? volume : 100,
    };
  };

  const resolvePriceFromSnapshot = (
    symbol: string,
    snapshot: { tickers: any[]; spotQuotes: Record<string, ServerSpotQuote> }
  ): number | null => {
    const spot = snapshot.spotQuotes?.[symbol];
    if (spot && Number(spot.bid) > 0) {
      return Number(spot.bid);
    }
    const binanceMap: Record<string, string> = {
      BTCUSD: 'BTCUSDT',
      ETHUSD: 'ETHUSDT',
      SOLUSD: 'SOLUSDT',
      XRPUSD: 'XRPUSDT',
      BNBUSD: 'BNBUSDT',
      XAUUSD: 'PAXGUSDT',
    };
    const bSym = binanceMap[symbol];
    if (bSym && Array.isArray(snapshot.tickers)) {
      const t = snapshot.tickers.find((x: any) => String(x?.symbol).toUpperCase() === bSym);
      const px = Number(t?.bidPrice || t?.lastPrice || 0);
      if (px > 0) return px;
    }
    return null;
  };

  const buildAndUpdateFormingBar = (
    symbol: string,
    interval: string,
    price: number
  ) => {
    const secStep = resolveIntervalSeconds(interval);
    const nowSec = Math.floor(Date.now() / 1000);
    const bucketSec = Math.floor(nowSec / secStep) * secStep;
    const key = `${symbol}:${interval}`;
    const prev = formingOhlcBars.get(key);
    const cachedKlineBar = resolveLatestBarFromKlineCache(symbol, interval);
    const isCachedSameBasis =
      cachedKlineBar &&
      Math.abs(cachedKlineBar.close - price) / Math.max(1e-9, price) < 0.0015;

    if (!prev || prev.time !== bucketSec) {
      if (cachedKlineBar && cachedKlineBar.time === bucketSec && isCachedSameBasis) {
        const nextBar = {
          time: bucketSec,
          open: cachedKlineBar.open,
          high: Math.max(cachedKlineBar.high, cachedKlineBar.open, price),
          low: Math.min(cachedKlineBar.low, cachedKlineBar.open, price),
          close: price,
          volume: cachedKlineBar.volume,
        };
        formingOhlcBars.set(key, nextBar);
        return nextBar;
      }
      const seedOpen = prev
        ? prev.close
        : isCachedSameBasis && cachedKlineBar
        ? cachedKlineBar.close
        : price;
      const nextBar = {
        time: bucketSec,
        open: seedOpen,
        high: Math.max(seedOpen, price),
        low: Math.min(seedOpen, price),
        close: price,
        volume: 25,
      };
      formingOhlcBars.set(key, nextBar);
      return nextBar;
    }
    const updatedBar = {
      time: bucketSec,
      open: prev.open,
      high: Math.max(prev.high, price),
      low: Math.min(prev.low, price),
      close: price,
      volume: prev.volume + 1,
    };
    formingOhlcBars.set(key, updatedBar);
    return updatedBar;
  };

  let ohlcBroadcastTimer: ReturnType<typeof setInterval> | null = null;

  const ensureOhlcBroadcastLoop = () => {
    if (ohlcBroadcastTimer || ohlcSubscribers.size === 0) return;
    ohlcBroadcastTimer = setInterval(async () => {
      if (ohlcSubscribers.size === 0) {
        if (ohlcBroadcastTimer) {
          clearInterval(ohlcBroadcastTimer);
          ohlcBroadcastTimer = null;
        }
        return;
      }
      try {
        const snapshot = await fetchMarketQuotesSnapshot();
        const serverTime = Date.now();
        ohlcSubscribers.forEach((sub, clientWs) => {
          if (clientWs.readyState !== WebSocket.OPEN) return;
          const normSym = (sub.symbol === 'GOLD' ? 'XAUUSD' : sub.symbol).toUpperCase() as SymbolCode;
          const marketStatus = getMarketStatus(normSym, serverTime);
          const isMarketOpen = marketStatus.isOpen;

          if (!isMarketOpen) {
            const closedBar = resolveLatestBarFromKlineCache(sub.symbol, sub.interval);
            clientWs.send(
              JSON.stringify({
                type: 'ohlc',
                symbol: sub.symbol,
                interval: sub.interval,
                bar: closedBar || undefined,
                marketClosed: true,
                source: 'exchange-closed',
                serverTime,
              })
            );
            return;
          }

          const realPrice = resolvePriceFromSnapshot(sub.symbol, snapshot);
          const bar =
            realPrice && realPrice > 0
              ? buildAndUpdateFormingBar(sub.symbol, sub.interval, realPrice)
              : resolveLatestBarFromKlineCache(sub.symbol, sub.interval);
          if (!bar) return;
          const sigKey = `${sub.symbol}:${sub.interval}:${bar.time}:${bar.close}`;
          if (lastBroadcastPrices.get(sigKey) === bar.close) {
            return;
          }
          lastBroadcastPrices.set(sigKey, bar.close);
          clientWs.send(
            JSON.stringify({
              type: 'ohlc',
              symbol: sub.symbol,
              interval: sub.interval,
              bar,
              marketClosed: false,
              source: snapshot.spotQuotes?.[sub.symbol]
                ? 'swissquote-spot-ws'
                : 'binance-ws',
              serverTime,
            })
          );
        });
      } catch {
        // keep loop resilient across transient upstream timeouts
      }
    }, 650);
  };

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const reqUrl = new URL(request.url || '/', 'http://localhost');
      if (reqUrl.pathname === '/ws/ohlc') {
        ohlcWss.handleUpgrade(request, socket, head, (ws) => {
          ohlcWss.emit('connection', ws, request);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  ohlcWss.on('connection', (ws) => {
    ohlcSubscribers.set(ws, { symbol: 'XAUUSD', interval: '15m' });
    ensureOhlcBroadcastLoop();

    ws.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(String(rawData || '{}'));
        if (msg?.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong', serverTime: Date.now() }));
          }
          return;
        }
        if (msg?.type === 'subscribe') {
          const symbol = String(msg.symbol || 'XAUUSD').toUpperCase();
          const interval = String(msg.interval || '15m');
          const normSym = (symbol === 'GOLD' ? 'XAUUSD' : symbol).toUpperCase() as SymbolCode;
          const isMarketOpen = getMarketStatus(normSym).isOpen;
          ohlcSubscribers.set(ws, { symbol, interval });
          ensureOhlcBroadcastLoop();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'subscribed',
                symbol,
                interval,
                marketClosed: !isMarketOpen,
                serverTime: Date.now(),
              })
            );
            if (!isMarketOpen) {
              const closedBar = resolveLatestBarFromKlineCache(symbol, interval);
              if (closedBar && ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'ohlc',
                    symbol,
                    interval,
                    bar: closedBar,
                    marketClosed: true,
                    source: 'exchange-closed',
                    serverTime: Date.now(),
                  })
                );
              }
              return;
            }
            const snapshot = await fetchMarketQuotesSnapshot().catch(() => null);
            const realPrice = snapshot ? resolvePriceFromSnapshot(symbol, snapshot) : null;
            if (realPrice && realPrice > 0 && ws.readyState === WebSocket.OPEN) {
              const bar = buildAndUpdateFormingBar(symbol, interval, realPrice);
              ws.send(
                JSON.stringify({
                  type: 'ohlc',
                  symbol,
                  interval,
                  bar,
                  marketClosed: false,
                  source: snapshot?.spotQuotes?.[symbol] ? 'swissquote-spot-ws' : 'binance-ws',
                  serverTime: Date.now(),
                })
              );
            }
          }
        }
      } catch {
        // ignore malformed WS frames
      }
    });

    ws.on('close', () => {
      ohlcSubscribers.delete(ws);
      if (ohlcSubscribers.size === 0 && ohlcBroadcastTimer) {
        clearInterval(ohlcBroadcastTimer);
        ohlcBroadcastTimer = null;
      }
    });
  });

  let viteInstance: { close: () => Promise<void> } | null = null;

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        ...(disableHmr ? { watch: null } : {}),
      },
      appType: 'spa',
    });
    viteInstance = vite;
    app.use(vite.middlewares);
  } else {
    const candidateDist = path.resolve(process.cwd(), 'dist');
    const distPath = fs.existsSync(path.join(candidateDist, 'index.html'))
      ? candidateDist
      : process.cwd();

    app.use(
      express.static(distPath, {
        index: false,
        maxAge: '1h',
      })
    );

    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(200).send('FUNDED APEX Platform is running.');
      }
    });
  }

  httpServer.on('error', (err) => {
    console.error('[FUNDED APEX] HTTP server error:', err);
    process.exit(1);
  });

  const shutdown = async () => {
    if (ohlcBroadcastTimer) {
      clearInterval(ohlcBroadcastTimer);
      ohlcBroadcastTimer = null;
    }
    try {
      ohlcWss.clients.forEach((client) => client.close());
      ohlcWss.close();
    } catch {
      // ignore ws close errors
    }
    try {
      if (viteInstance) await viteInstance.close();
    } catch {
      // ignore close errors
    }
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, HOST, () => {
      console.log(
        `[FUNDED APEX] Server listening on http://${HOST}:${PORT} (mode: ${
          isProduction ? 'production' : 'development'
        })`
      );
      resolve();
    });
  });
}

startServer().catch((err) => {
  console.error('[FUNDED APEX] Failed to start server:', err);
  process.exit(1);
});
