import React, { useState, useMemo, useEffect, useRef } from 'react';
import { usePlatform } from '../context/PlatformContext';
import {
  INSTRUMENTS,
  SymbolCode,
  OrderSide,
  OrderType,
  ChallengeType,
  evaluateAccountRiskMetrics,
  resolveChallengeRulesForAccount,
  exportOrdersToCsv,
  TradeOrderRecord,
  validateAndComputeSlTpPreview,
  computeSlTpPresets,
  formatCandleCountdown,
  resolveChartPriceOrderType,
  getMarketStatus,
  calculateRequiredMargin,
  formatAccountRulesSummary,
} from '../engine/tradingEngine';
import type { ChartTypeMode } from './ApexLiveCandlestickChart';
import { TradingTerminalChart } from './TradingTerminalChart';
import { FundedApexLogo } from './FundedApexLogo';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Home,
  Search,
  Sliders,
  X,
  ShieldCheck,
  Activity,
  Layers,
  Bell,
  Maximize2,
  Columns,
} from 'lucide-react';

const TIMEFRAMES = [
  { label: '1s', tv: '1S', seconds: 1, core: false },
  { label: '1m', tv: '1', seconds: 60, core: true },
  { label: '3m', tv: '3', seconds: 180, core: false },
  { label: '5m', tv: '5', seconds: 300, core: true },
  { label: '15m', tv: '15', seconds: 900, core: true },
  { label: '30m', tv: '30', seconds: 1800, core: true },
  { label: '1h', tv: '60', seconds: 3600, core: true },
  { label: '2h', tv: '120', seconds: 7200, core: false },
  { label: '4h', tv: '240', seconds: 14400, core: true },
  { label: '1d', tv: '1D', seconds: 86400, core: true },
  { label: '1W', tv: '1W', seconds: 604800, core: true },
  { label: '1M', tv: '1M', seconds: 2592000, core: false },
];

const LOT_PRESETS = ['0.01', '0.05', '0.10', '0.25', '0.50', '1.00', '2.00', '5.00'];

const INSTRUMENT_CATEGORIES: { id: string; label: string }[] = [
  { id: 'ALL', label: 'All (24)' },
  { id: 'Metals', label: 'Gold & Metals' },
  { id: 'Forex', label: 'Forex' },
  { id: 'Crypto', label: 'Crypto' },
  { id: 'Indices', label: 'Indices' },
];

interface PriceAlertItem {
  id: string;
  symbol: SymbolCode;
  condition: 'ABOVE' | 'BELOW';
  targetPrice: number;
  enabled: boolean;
  triggered: boolean;
  triggeredAt?: string;
  createdAt: string;
}

const ALERTS_STORAGE_KEY = 'funded_apex_price_alerts_v1';

export const TradingTerminalView: React.FC = () => {
  const {
    user,
    quotes,
    challenges,
    accounts,
    activeAccount,
    setActiveAccountId,
    openStripeCheckout,
    orders,
    submitOrder,
    modifyOrder,
    closePosition,
    cancelPendingOrder,
    navigate,
    isTerminalUnlocked,
    unlockTerminal,
    lockTerminal,
    quotesRef,
    payouts,
    pushNotification,
  } = usePlatform();

  const [userIdInput, setUserIdInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');
  const [showTerminalPass, setShowTerminalPass] = useState(false);

  useEffect(() => {
    if (
      activeAccount &&
      (activeAccount.status === 'active' || activeAccount.status === 'passed') &&
      activeAccount.terminalPassword
    ) {
      setUserIdInput(activeAccount.terminalUserId || 'APEX-MASTER');
      setPassInput(activeAccount.terminalPassword);
      setPassError('');
    } else if (activeAccount?.status === 'failed') {
      setPassInput('');
    }
  }, [activeAccount?.id, activeAccount?.status, activeAccount?.terminalUserId, activeAccount?.terminalPassword]);

  // Active Symbol & Timeframe
  const [symbol, setSymbol] = useState<SymbolCode>('XAUUSD');
  const [secondarySymbol, setSecondarySymbol] = useState<SymbolCode>('EURUSD');
  const [chartFocusTrigger, setChartFocusTrigger] = useState<number>(1);
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[4]); // 15m default
  const [showAllTimeframes, setShowAllTimeframes] = useState(false);
  const [volume, setVolume] = useState<string>('0.01');
  const [showLotDropdown, setShowLotDropdown] = useState(false);

  const handleSelectPair = (nextSymbol: SymbolCode) => {
    setSymbol(nextSymbol);
    setChartFocusTrigger((prev) => prev + 1);
    setShowPairModal(false);
  };

  // Chart Type & Multi-Chart Layout
  const [chartType, setChartType] = useState<ChartTypeMode>('candles');
  const [splitChartLayout, setSplitChartLayout] = useState<'single' | 'dual'>('single');

  // Modals & Drawers
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairCategoryFilter, setPairCategoryFilter] = useState('ALL');
  const [pairSearchQuery, setPairSearchQuery] = useState('');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showPositionsDrawer, setShowPositionsDrawer] = useState(false);
  const [showAdvancedOrderTicket, setShowAdvancedOrderTicket] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [showAccountRulesModal, setShowAccountRulesModal] = useState(false);

  // Price Alerts State
  const [priceAlerts, setPriceAlerts] = useState<PriceAlertItem[]>(() => {
    try {
      const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [newAlertPrice, setNewAlertPrice] = useState<string>('');
  const [newAlertCondition, setNewAlertCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE');

  const priceAlertsRef = useRef<PriceAlertItem[]>(priceAlerts);
  priceAlertsRef.current = priceAlerts;

  useEffect(() => {
    try {
      localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(priceAlerts));
    } catch {}
  }, [priceAlerts]);

  // Candle countdown timer
  const [candleCountdown, setCandleCountdown] = useState<string>('02:41');

  // Order Ticket state
  const [advSide, setAdvSide] = useState<OrderSide>('BUY');
  const [advOrderType, setAdvOrderType] = useState<'MARKET' | 'LIMIT' | 'STOP'>('MARKET');
  const [advEntryPrice, setAdvEntryPrice] = useState<string>('');
  const [advSl, setAdvSl] = useState<string>('');
  const [advTp, setAdvTp] = useState<string>('');
  const [advOrderError, setAdvOrderError] = useState<string | null>(null);

  // Modify Order state
  const [editingOrder, setEditingOrder] = useState<TradeOrderRecord | null>(null);
  const [editSl, setEditSl] = useState<string>('');
  const [editTp, setEditTp] = useState<string>('');
  const [editEntry, setEditEntry] = useState<string>('');
  const [editOrderError, setEditOrderError] = useState<string | null>(null);

  // Blotter tab
  const [blotterTab, setBlotterTab] = useState<'positions' | 'pending' | 'history'>('positions');

  // Performance Refs for 60fps Header, P&L, Drawdown & Target Updates
  const balanceRef = useRef<HTMLElement>(null);
  const equityRef = useRef<HTMLElement>(null);
  const pnlRef = useRef<HTMLElement>(null);
  const ddPctRef = useRef<HTMLSpanElement>(null);
  const ddBarRef = useRef<HTMLDivElement>(null);
  const ddTextRef = useRef<HTMLDivElement>(null);
  const targetPctRef = useRef<HTMLSpanElement>(null);
  const targetBarRef = useRef<HTMLDivElement>(null);
  const targetTextRef = useRef<HTMLDivElement>(null);
  const bidRef = useRef<HTMLSpanElement>(null);
  const askRef = useRef<HTMLSpanElement>(null);

  const spec = INSTRUMENTS[symbol] || INSTRUMENTS.XAUUSD;

  const currentQuote = quotes[symbol] || {
    symbol,
    bid: spec.basePrice,
    ask: Number((spec.basePrice + spec.spread).toFixed(spec.decimals)),
    high24h: Number((spec.basePrice * 1.006).toFixed(spec.decimals)),
    low24h: Number((spec.basePrice * 0.994).toFixed(spec.decimals)),
    change24hPct: 0.42,
    timestamp: Date.now(),
  };

  // Real-time TradingView-style Price Up/Down Tick Animation State
  const [tickDirection, setTickDirection] = useState<'up' | 'down' | 'neutral'>('neutral');
  const [symbolTickMap, setSymbolTickMap] = useState<Record<string, 'up' | 'down'>>({});
  const prevMidPriceRef = useRef<number>((currentQuote.bid + currentQuote.ask) / 2);
  const prevAllBidsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const liveMid = (currentQuote.bid + currentQuote.ask) / 2;
    if (prevMidPriceRef.current !== liveMid) {
      if (liveMid > prevMidPriceRef.current) {
        setTickDirection('up');
      } else if (liveMid < prevMidPriceRef.current) {
        setTickDirection('down');
      }
      prevMidPriceRef.current = liveMid;
      const timer = setTimeout(() => {
        setTickDirection('neutral');
      }, 550);
      return () => clearTimeout(timer);
    }
  }, [currentQuote.bid, currentQuote.ask]);

  useEffect(() => {
    if (showPairModal) {
      const nextMap: Record<string, 'up' | 'down'> = {};
      let changed = false;
      Object.keys(quotes).forEach((sym) => {
        const q = quotes[sym];
        if (!q) return;
        const prev = prevAllBidsRef.current[sym];
        if (prev !== undefined && prev !== q.bid) {
          nextMap[sym] = q.bid > prev ? 'up' : 'down';
          changed = true;
        }
        prevAllBidsRef.current[sym] = q.bid;
      });
      if (changed) {
        setSymbolTickMap((prev) => ({ ...prev, ...nextMap }));
      }
    }

    // Evaluate active price alerts against verified live quotes only when alerts exist
    if (priceAlertsRef.current.length === 0) return;
    setPriceAlerts((prevAlerts) => {
      if (prevAlerts.length === 0) return prevAlerts;
      let alertUpdated = false;
      const nextAlerts = prevAlerts.map((al) => {
        if (!al.enabled || al.triggered) return al;
        const q = quotes[al.symbol];
        if (!q) return al;
        const hit =
          (al.condition === 'ABOVE' && q.bid >= al.targetPrice) ||
          (al.condition === 'BELOW' && q.bid <= al.targetPrice);
        if (hit) {
          alertUpdated = true;
          pushNotification(
            `Price Alert Triggered: ${al.symbol}`,
            `${al.symbol} crossed ${al.condition} ${al.targetPrice} (Current Bid: ${q.bid})`,
            'success'
          );
          return {
            ...al,
            triggered: true,
            enabled: false,
            triggeredAt: new Date().toLocaleTimeString(),
          };
        }
        return al;
      });
      return alertUpdated ? nextAlerts : prevAlerts;
    });
  }, [quotes, showPairModal, pushNotification]);

  const [marketClockMs, setMarketClockMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMarketClockMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const marketStatus = useMemo(
    () => getMarketStatus(symbol, marketClockMs),
    [symbol, marketClockMs]
  );

  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      if (!getMarketStatus(symbol, now).isOpen) {
        setCandleCountdown('CLOSED');
        return;
      }
      setCandleCountdown(formatCandleCountdown(now, timeframe.seconds));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [symbol, timeframe.seconds]);

  const [previewChallengeType, setPreviewChallengeType] = useState<ChallengeType>('two_step');
  const [previewAccountSize, setPreviewAccountSize] = useState<number>(3000);
  const [terminalTopBanner, setTerminalTopBanner] = useState<{
    id: string;
    title: string;
    detail: string;
    tone: 'emerald' | 'rose' | 'aqua';
  } | null>(null);

  useEffect(() => {
    if (!terminalTopBanner) return;
    const clearTimer = setTimeout(() => setTerminalTopBanner(null), 2600);
    return () => clearTimeout(clearTimer);
  }, [terminalTopBanner]);

  useEffect(() => {
    const onBannerEvent = (ev: Event) => {
      const custom = ev as CustomEvent<{
        title?: string;
        detail?: string;
        subtitle?: string;
        tone?: 'emerald' | 'rose' | 'aqua' | 'red';
      }>;
      if (custom.detail?.title) {
        const rawTone = custom.detail.tone;
        setTerminalTopBanner({
          id: `${Date.now()}-${Math.random()}`,
          title: custom.detail.title,
          detail: custom.detail.detail || custom.detail.subtitle || '',
          tone: rawTone === 'red' ? 'rose' : rawTone || 'aqua',
        });
      }
    };
    window.addEventListener('apex-terminal-banner', onBannerEvent as EventListener);
    return () => window.removeEventListener('apex-terminal-banner', onBannerEvent as EventListener);
  }, []);

  const effectiveAccount = useMemo(() => {
    const ownedAcc = activeAccount || (accounts.length > 0 ? accounts[0] : null);
    if (ownedAcc) {
      const rules = resolveChallengeRulesForAccount(ownedAcc);
      const closedForOwned = orders.filter(
        (o) => o.accountId === ownedAcc.id && o.status === 'CLOSED'
      );
      const realizedOwnedPnl = closedForOwned.reduce((sum, o) => sum + (o.netPnl || 0), 0);
      const withdrawnGross = payouts
        .filter((p) => p.accountId === ownedAcc.id && p.status !== 'Rejected')
        .reduce(
          (sum, p) =>
            sum + (p.grossProfitDeducted || p.amountUsd / ((rules.profitSplitPct || 80) / 100)),
          0
        );
      const reconciledBalance =
        ownedAcc.status === 'failed'
          ? Math.round(ownedAcc.balance * 100) / 100
          : Math.round((ownedAcc.startingBalance + realizedOwnedPnl - withdrawnGross) * 100) / 100;

      return {
        ...ownedAcc,
        balance: reconciledBalance,
        dailyDrawdownPct: rules.dailyDrawdownPct,
        maxDrawdownPct: rules.maxDrawdownPct,
        profitTargetPct: rules.profitTargetPct,
        leverage: rules.leverage,
        profitSplitPct: rules.profitSplitPct,
        minTradingDays: rules.minTradingDays,
        currentStep: rules.currentStep,
        totalSteps: rules.totalSteps,
      };
    }

    const matchedChallenge =
      challenges.find(
        (c) => c.type === previewChallengeType && c.accountSize === previewAccountSize
      ) ||
      challenges.find((c) => c.accountSize === previewAccountSize);

    const resolvedSize = previewAccountSize || matchedChallenge?.accountSize || 3000;
    const resolvedType = matchedChallenge?.type || previewChallengeType || 'two_step';
    const challengeSlug =
      matchedChallenge?.id ||
      `${resolvedType.replace('_', '-')}-${resolvedSize}`;
    const previewId = `preview-${challengeSlug}`;

    const realizedPnl = orders
      .filter((o) => o.accountId === previewId && o.status === 'CLOSED')
      .reduce((sum, o) => sum + (o.netPnl || 0), 0);
    const computedBal = Math.round((resolvedSize + realizedPnl) * 100) / 100;

    const rules = resolveChallengeRulesForAccount({
      challengeId: challengeSlug,
      challengeType: resolvedType,
      currentStep: 1,
    });

    const typeLabel =
      resolvedType === 'instant'
        ? 'Instant Funded'
        : resolvedType === 'one_step'
        ? '1-Step Evaluation'
        : resolvedType === 'two_step'
        ? '2-Step Evaluation'
        : '3-Step Evaluation';

    return {
      id: previewId,
      accountNumber: `APEX-${resolvedSize >= 1000 ? `${resolvedSize / 1000}K` : resolvedSize}`,
      userId: user?.uid || 'guest-trader',
      challengeId: challengeSlug,
      challengeTitle:
        matchedChallenge?.title || `${typeLabel} ($${resolvedSize.toLocaleString()})`,
      challengeType: resolvedType,
      accountSize: resolvedSize,
      startingBalance: resolvedSize,
      balance: computedBal,
      equity: computedBal,
      usedMargin: 0,
      freeMargin: computedBal,
      profitTargetPct: rules.profitTargetPct,
      dailyDrawdownPct: rules.dailyDrawdownPct,
      maxDrawdownPct: rules.maxDrawdownPct,
      minTradingDays: rules.minTradingDays,
      tradingDaysCount: 1,
      leverage: rules.leverage,
      profitSplitPct: rules.profitSplitPct,
      currentStep: rules.currentStep,
      totalSteps: rules.totalSteps,
      peakEquity: resolvedSize,
      dailyStartingEquity: resolvedSize,
      lastDailyResetDate: new Date().toISOString().split('T')[0],
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [activeAccount, accounts, challenges, user, previewChallengeType, previewAccountSize, orders, payouts]);

  const accountOrders = useMemo(
    () => orders.filter((o) => o.accountId === effectiveAccount.id),
    [orders, effectiveAccount.id]
  );

  const openPositions = useMemo(
    () => accountOrders.filter((o) => o.status === 'OPEN'),
    [accountOrders]
  );

  const currentSymbolPositions = useMemo(
    () => openPositions.filter((p) => p.symbol === symbol),
    [openPositions, symbol]
  );

  const pendingOrders = useMemo(
    () => accountOrders.filter((o) => o.status === 'PENDING'),
    [accountOrders]
  );

  const tradeHistory = useMemo(
    () => accountOrders.filter((o) => o.status === 'CLOSED' || o.status === 'CANCELLED'),
    [accountOrders]
  );

  const riskMetrics = useMemo(
    () => evaluateAccountRiskMetrics(effectiveAccount, openPositions),
    [effectiveAccount, openPositions]
  );

  useEffect(() => {
    if (!isTerminalUnlocked) return;
    if (effectiveAccount.status === 'failed' || riskMetrics.nextStatus === 'failed') {
      openPositions.forEach((pos) => {
        closePosition(pos.id);
      });
      lockTerminal();
    }
  }, [
    isTerminalUnlocked,
    effectiveAccount.status,
    riskMetrics.nextStatus,
    openPositions,
    closePosition,
    lockTerminal,
  ]);

  const phaseLabel = useMemo(() => {
    if (effectiveAccount.status === 'failed' || riskMetrics.nextStatus === 'failed') return 'BREACHED';
    if (riskMetrics.nextStatus === 'passed') return 'FUNDED • PASSED';
    if (effectiveAccount.challengeType === 'instant') return 'INSTANT FUNDED';
    const total = effectiveAccount.totalSteps ?? 2;
    const curr = effectiveAccount.currentStep ?? 1;
    if (total <= 1) return '1-STEP EVAL';
    return `PHASE ${curr} OF ${total}`;
  }, [
    effectiveAccount.status,
    riskMetrics.nextStatus,
    effectiveAccount.challengeType,
    effectiveAccount.totalSteps,
    effectiveAccount.currentStep,
  ]);

  const allSymbols = useMemo(() => Object.keys(INSTRUMENTS) as SymbolCode[], []);
  const filteredSymbols = useMemo(() => {
    return allSymbols.filter((sym) => {
      const instr = INSTRUMENTS[sym];
      const matchesCategory =
        pairCategoryFilter === 'ALL' ||
        instr.category === pairCategoryFilter ||
        (pairCategoryFilter === 'Metals' && instr.category === 'Commodities');
      const matchesQuery =
        pairSearchQuery.trim() === '' ||
        sym.toLowerCase().includes(pairSearchQuery.toLowerCase()) ||
        instr.name.toLowerCase().includes(pairSearchQuery.toLowerCase()) ||
        instr.shortName.toLowerCase().includes(pairSearchQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [allSymbols, pairCategoryFilter, pairSearchQuery]);

  const parsedVolume = parseFloat(volume) || 0.01;

  const handleCloseWithBanner = (orderId: string) => {
    const targetPos = openPositions.find((p) => p.id === orderId);
    const res = closePosition(orderId);
    if (res.ok && targetPos) {
      const pnlVal = targetPos.netPnl || 0;
      setTerminalTopBanner({
        id: `${Date.now()}-close`,
        title: `Order Closed • ${targetPos.symbol}`,
        detail: `${targetPos.side} ${targetPos.volume.toFixed(2)} Lot closed (${pnlVal >= 0 ? '+' : ''}$${pnlVal.toFixed(2)})`,
        tone: pnlVal >= 0 ? 'emerald' : 'rose',
      });
    } else if (!res.ok && res.error) {
      setTerminalTopBanner({
        id: `${Date.now()}-close-err`,
        title: `Close Blocked • ${targetPos?.symbol || symbol}`,
        detail: res.error,
        tone: 'rose',
      });
    }
    return res;
  };

  const handleQuickTrade = (orderSide: OrderSide, targetSymbol: SymbolCode = symbol) => {
    setAdvOrderError(null);
    const targetMarket = getMarketStatus(targetSymbol);
    if (!targetMarket.isOpen) {
      setAdvOrderError(targetMarket.reason);
      setTerminalTopBanner({
        id: `${Date.now()}-closed`,
        title: `Market Closed • ${targetSymbol}`,
        detail: targetMarket.reason,
        tone: 'rose',
      });
      pushNotification('Market Closed (Sat–Sun)', targetMarket.reason, 'warning');
      return;
    }

    const targetSpec = INSTRUMENTS[targetSymbol] || spec;
    const sl = parseFloat(advSl) || undefined;
    const tp = parseFloat(advTp) || undefined;
    const res = submitOrder({
      accountId: effectiveAccount.id,
      symbol: targetSymbol,
      side: orderSide,
      orderType: 'MARKET',
      volume: parsedVolume > 0 ? parsedVolume : 0.01,
      stopLoss: sl,
      takeProfit: tp,
    });
    if (res.ok && res.order) {
      setTerminalTopBanner({
        id: res.order.id,
        title: `${res.order.side} Order Executed • ${res.order.symbol}`,
        detail: `${res.order.volume.toFixed(2)} Lot @ ${res.order.entryPrice.toFixed(targetSpec.decimals)}`,
        tone: res.order.side === 'BUY' ? 'emerald' : 'rose',
      });
    } else if (res.error) {
      setAdvOrderError(res.error);
      setTerminalTopBanner({
        id: `${Date.now()}-err`,
        title: `Order Rejected • ${targetSymbol}`,
        detail: res.error,
        tone: 'rose',
      });
    }
  };

  const handleChartPendingOrderAtPrice = (
    orderSide: OrderSide,
    targetPrice: number,
    targetSymbol: SymbolCode = symbol
  ) => {
    const targetMarket = getMarketStatus(targetSymbol);
    if (!targetMarket.isOpen) {
      setTerminalTopBanner({
        id: `${Date.now()}-closed`,
        title: `Market Closed • ${targetSymbol}`,
        detail: targetMarket.reason,
        tone: 'rose',
      });
      pushNotification('Market Closed (Sat–Sun)', targetMarket.reason, 'warning');
      return;
    }

    const targetSpec = INSTRUMENTS[targetSymbol] || spec;
    const q = quotesRef.current[targetSymbol] || currentQuote;
    const orderType = resolveChartPriceOrderType(orderSide, targetPrice, q.bid, q.ask);
    const res = submitOrder({
      accountId: effectiveAccount.id,
      symbol: targetSymbol,
      side: orderSide,
      orderType,
      volume: parsedVolume > 0 ? parsedVolume : 0.01,
      entryPrice: targetPrice,
    });
    if (res.ok && res.order) {
      setTerminalTopBanner({
        id: res.order.id,
        title: `${res.order.orderType.replace('_', ' ')} Placed • ${res.order.symbol}`,
        detail: `${res.order.side} ${res.order.volume.toFixed(2)} Lot @ ${res.order.entryPrice.toFixed(targetSpec.decimals)}`,
        tone: res.order.side === 'BUY' ? 'emerald' : 'rose',
      });
    } else if (res.error) {
      setTerminalTopBanner({
        id: `${Date.now()}-err`,
        title: `Order Rejected • ${targetSymbol}`,
        detail: res.error,
        tone: 'rose',
      });
    }
  };

  const handleAdvOrder = () => {
    setAdvOrderError(null);
    const currentMarket = getMarketStatus(symbol);
    if (!currentMarket.isOpen) {
      setAdvOrderError(currentMarket.reason);
      setTerminalTopBanner({
        id: `${Date.now()}-closed`,
        title: `Market Closed • ${symbol}`,
        detail: currentMarket.reason,
        tone: 'rose',
      });
      pushNotification('Market Closed (Sat–Sun)', currentMarket.reason, 'warning');
      return;
    }

    const entry = parseFloat(advEntryPrice) || undefined;
    const sl = parseFloat(advSl) || undefined;
    const tp = parseFloat(advTp) || undefined;
    const resolvedOrderType: OrderType =
      advOrderType === 'MARKET'
        ? 'MARKET'
        : advOrderType === 'LIMIT'
        ? advSide === 'BUY'
          ? 'BUY_LIMIT'
          : 'SELL_LIMIT'
        : advSide === 'BUY'
        ? 'BUY_STOP'
        : 'SELL_STOP';

    const res = submitOrder({
      accountId: effectiveAccount.id,
      symbol,
      side: advSide,
      orderType: resolvedOrderType,
      volume: parsedVolume > 0 ? parsedVolume : 0.01,
      entryPrice: resolvedOrderType === 'MARKET' ? undefined : entry,
      stopLoss: sl,
      takeProfit: tp,
    });
    if (res.ok && res.order) {
      setTerminalTopBanner({
        id: res.order.id,
        title: `${res.order.orderType.replace('_', ' ')} Placed • ${res.order.symbol}`,
        detail: `${res.order.side} ${res.order.volume.toFixed(2)} Lot @ ${res.order.entryPrice.toFixed(spec.decimals)}`,
        tone: res.order.side === 'BUY' ? 'emerald' : 'rose',
      });
      setShowAdvancedOrderTicket(false);
      setAdvOrderError(null);
      setAdvSl('');
      setAdvTp('');
      setAdvEntryPrice('');
    } else if (res.error) {
      setAdvOrderError(res.error);
    }
  };

  const handlePartialClose = (pos: TradeOrderRecord, ratio: number) => {
    const posMarket = getMarketStatus(pos.symbol);
    if (!posMarket.isOpen) {
      setTerminalTopBanner({
        id: `${Date.now()}-closed`,
        title: `Market Closed • ${pos.symbol}`,
        detail: posMarket.reason,
        tone: 'rose',
      });
      pushNotification('Market Closed (Sat–Sun)', posMarket.reason, 'warning');
      return;
    }

    if (ratio >= 0.99 || pos.volume <= 0.01) {
      handleCloseWithBanner(pos.id);
      return;
    }
    const closeVolume = Math.max(0.01, Math.round(pos.volume * ratio * 100) / 100);
    const remainVolume = Math.max(0.01, Math.round((pos.volume - closeVolume) * 100) / 100);
    const closeRes = closePosition(pos.id);
    if (!closeRes.ok) return;
    submitOrder({
      accountId: effectiveAccount.id,
      symbol: pos.symbol,
      side: pos.side,
      orderType: 'MARKET',
      volume: remainVolume,
      stopLoss: pos.stopLoss > 0 ? pos.stopLoss : undefined,
      takeProfit: pos.takeProfit > 0 ? pos.takeProfit : undefined,
    });
    setTerminalTopBanner({
      id: `${Date.now()}-partial`,
      title: `Partial Order Closed • ${pos.symbol}`,
      detail: `Closed ${closeVolume.toFixed(2)} Lot (${Math.round(ratio * 100)}%) • Open: ${remainVolume.toFixed(2)} Lot`,
      tone: 'aqua',
    });
    pushNotification(
      'Partial Close Executed',
      `Closed ${closeVolume.toFixed(2)} Lot of ${pos.symbol} (${Math.round(ratio * 100)}%). Remaining open: ${remainVolume.toFixed(2)} Lot.`,
      'info'
    );
  };

  const handleExportCsv = () => {
    const csvContent = exportOrdersToCsv(tradeHistory);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `APEX_Trades_${effectiveAccount.accountNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const ddUsedUsd = riskMetrics.overallDropUsd;
  const ddLimitUsd =
    riskMetrics.maxLossLimitUsd > 0
      ? riskMetrics.maxLossLimitUsd
      : Math.round(effectiveAccount.startingBalance * (effectiveAccount.maxDrawdownPct / 100) * 100) / 100;
  const ddUsedPct =
    ddLimitUsd > 0 ? Math.min(100, Math.max(0, (ddUsedUsd / ddLimitUsd) * 100)) : 0;

  const isInstantAccount =
    effectiveAccount.challengeType === 'instant' || riskMetrics.profitTargetPct === 0;
  const targetLimitUsd = isInstantAccount
    ? 0
    : riskMetrics.profitTargetUsd > 0
    ? riskMetrics.profitTargetUsd
    : Math.round(effectiveAccount.startingBalance * ((effectiveAccount.profitTargetPct || 8) / 100) * 100) / 100;

  const liveMidPrice = (currentQuote.bid + currentQuote.ask) / 2;
  const rawSpread = Math.max(
    Math.pow(10, -spec.decimals),
    Math.abs(currentQuote.ask - currentQuote.bid)
  );

  const accountRulesSummary = useMemo(
    () => formatAccountRulesSummary(effectiveAccount),
    [effectiveAccount]
  );

  const currentLotMarginUsd = useMemo(
    () =>
      calculateRequiredMargin(
        symbol,
        parsedVolume > 0 ? parsedVolume : 0.01,
        currentQuote.ask || spec.basePrice,
        effectiveAccount.leverage || 100
      ),
    [symbol, parsedVolume, currentQuote.ask, spec.basePrice, effectiveAccount.leverage]
  );

  const maxAffordableLots = useMemo(() => {
    const unitMargin = calculateRequiredMargin(
      symbol,
      1,
      currentQuote.ask || spec.basePrice,
      effectiveAccount.leverage || 100
    );
    if (unitMargin <= 0) return 50;
    const rawMax = Math.floor(((riskMetrics.freeMargin * 0.95) / unitMargin) * 100) / 100;
    return Math.max(0.01, Math.min(100, rawMax));
  }, [symbol, currentQuote.ask, spec.basePrice, effectiveAccount.leverage, riskMetrics.freeMargin]);

  const handleChartModifySlTp = (orderId: string, nextSl: number, nextTp: number) => {
    const res = modifyOrder(orderId, {
      stopLoss: nextSl,
      takeProfit: nextTp,
      allowAutoClamp: true,
    });
    if (res.ok) {
      const slLabel = nextSl > 0 ? `SL ${nextSl.toFixed(spec.decimals)}` : 'SL OFF';
      const tpLabel = nextTp > 0 ? `TP ${nextTp.toFixed(spec.decimals)}` : 'TP OFF';
      setTerminalTopBanner({
        id: `${Date.now()}-sltp`,
        title: `Chart SL / TP Updated • ${symbol}`,
        detail: `${slLabel} · ${tpLabel}`,
        tone: 'aqua',
      });
    } else if (res.error) {
      setTerminalTopBanner({
        id: `${Date.now()}-sltp-err`,
        title: `SL / TP Update Rejected`,
        detail: res.error,
        tone: 'rose',
      });
    }
  };

  // Sync Balance, Equity, P&L, Max Drawdown (DD), and Profit Target (TARGET) with dirty-checking so DOM only mutates when values change
  useEffect(() => {
    let lastBalance = NaN;
    let lastEquity = NaN;
    let lastBid = NaN;
    let lastAsk = NaN;
    let lastQuoteSig = '';

    const updateHeader = () => {
      if (!balanceRef.current || !equityRef.current || !effectiveAccount) {
        return;
      }

      const latestQuotes = quotesRef.current;
      const symbolQuote = latestQuotes[symbol];
      const primaryTs = symbolQuote?.timestamp || 0;
      let openPosSig = '';
      if (openPositions.length > 0) {
        for (let i = 0; i < openPositions.length; i++) {
          openPosSig += `${latestQuotes[openPositions[i].symbol]?.timestamp || 0},`;
        }
      }
      const nextQuoteSig = `${effectiveAccount.balance}:${openPositions.length}:${primaryTs}:${openPosSig}`;
      if (nextQuoteSig === lastQuoteSig) {
        return;
      }
      lastQuoteSig = nextQuoteSig;

      if (effectiveAccount.balance !== lastBalance) {
        lastBalance = effectiveAccount.balance;
        balanceRef.current.textContent = `$${effectiveAccount.balance.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      }

      let totalFloatingPnl = 0;

      for (let i = 0; i < openPositions.length; i++) {
        const pos = openPositions[i];
        const quote = latestQuotes[pos.symbol];
        if (quote) {
          const markPrice = pos.side === 'BUY' ? quote.bid : quote.ask;
          const priceDiff =
            pos.side === 'BUY' ? markPrice - pos.entryPrice : pos.entryPrice - markPrice;
          const posSpec = INSTRUMENTS[pos.symbol];
          if (posSpec) {
            const grossPnl = priceDiff * posSpec.contractSize * pos.volume;
            totalFloatingPnl += grossPnl - pos.commission;
          }
        }
      }

      const liveEquity = Math.round((effectiveAccount.balance + totalFloatingPnl) * 100) / 100;
      if (liveEquity !== lastEquity) {
        lastEquity = liveEquity;
        equityRef.current.textContent = `$${liveEquity.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

        const liveNetPnl = Math.round((liveEquity - effectiveAccount.startingBalance) * 100) / 100;
        if (pnlRef.current) {
          const sign = liveNetPnl >= 0 ? '+' : '-';
          pnlRef.current.textContent = `${sign}$${Math.abs(liveNetPnl).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;
          pnlRef.current.className =
            liveNetPnl >= 0
              ? 'text-[#28D6B0] font-sans font-bold tabular-nums text-xs sm:text-sm'
              : 'text-[#F01650] font-sans font-bold tabular-nums text-xs sm:text-sm';
        }

        const liveDdUsed =
          liveEquity < effectiveAccount.startingBalance
            ? Math.max(0, Math.round((effectiveAccount.startingBalance - liveEquity) * 100) / 100)
            : 0;
        const liveDdPct =
          ddLimitUsd > 0 ? Math.min(100, Math.max(0, (liveDdUsed / ddLimitUsd) * 100)) : 0;

        if (ddPctRef.current) {
          ddPctRef.current.textContent = `${liveDdPct.toFixed(0)}%`;
        }
        if (ddBarRef.current) {
          ddBarRef.current.style.width = `${Math.min(100, liveDdPct)}%`;
        }
        if (ddTextRef.current) {
          ddTextRef.current.textContent = `$${liveDdUsed.toFixed(0)} / $${ddLimitUsd.toFixed(0)}`;
        }

        const phaseBase =
          effectiveAccount.phaseStartingBalance && effectiveAccount.phaseStartingBalance > 0
            ? effectiveAccount.phaseStartingBalance
            : effectiveAccount.startingBalance;
        const liveGainUsd =
          liveEquity > phaseBase
            ? Math.max(0, Math.round((liveEquity - phaseBase) * 100) / 100)
            : 0;
        const liveTargetPct = isInstantAccount
          ? 0
          : targetLimitUsd > 0
          ? Math.min(100, Math.max(0, (liveGainUsd / targetLimitUsd) * 100))
          : 0;

        if (targetPctRef.current) {
          targetPctRef.current.textContent = isInstantAccount ? 'N/A' : `${liveTargetPct.toFixed(0)}%`;
        }
        if (targetBarRef.current) {
          targetBarRef.current.style.width = `${Math.min(100, liveTargetPct)}%`;
        }
        if (targetTextRef.current) {
          targetTextRef.current.textContent = isInstantAccount
            ? 'Funded account'
            : `$${liveGainUsd.toFixed(0)} / $${targetLimitUsd.toFixed(0)}`;
        }
      }

      if (symbolQuote) {
        if (symbolQuote.bid !== lastBid && bidRef.current) {
          lastBid = symbolQuote.bid;
          bidRef.current.textContent = symbolQuote.bid.toLocaleString('en-US', {
            minimumFractionDigits: spec.decimals,
            maximumFractionDigits: spec.decimals,
          });
        }
        if (symbolQuote.ask !== lastAsk && askRef.current) {
          lastAsk = symbolQuote.ask;
          askRef.current.textContent = symbolQuote.ask.toLocaleString('en-US', {
            minimumFractionDigits: spec.decimals,
            maximumFractionDigits: spec.decimals,
          });
        }
      }
    };

    updateHeader();
    const timer = setInterval(updateHeader, 250);
    return () => clearInterval(timer);
  }, [
    effectiveAccount,
    openPositions,
    quotes,
    quotesRef,
    symbol,
    spec.decimals,
    ddLimitUsd,
    targetLimitUsd,
    isInstantAccount,
  ]);

  // Terminal Lock Screen
  if (!isTerminalUnlocked) {
    const isSelectedAccountBreached =
      activeAccount?.status === 'failed' || riskMetrics.nextStatus === 'failed';

    return (
      <main className="min-h-screen bg-transparent flex items-center justify-center px-4 py-12 text-center">
        <div className="w-full max-w-md space-y-5 apex-fade-up">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(user ? 'dashboard' : 'home')}
              className="flex items-center gap-2 text-xs font-semibold text-[#A5B5AE] hover:text-[#28D6B0] bg-[#0C1411] border border-[#28D6B0]/20 px-4 py-2.5 rounded-[14px] transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-[#28D6B0]" />
              <span>{user ? 'Back to Dashboard' : 'Back to Home'}</span>
            </button>
            <FundedApexLogo size="sm" />
          </div>

          <div className="bg-[#0C1411]/95 backdrop-blur-xl border border-[#28D6B0]/25 rounded-[22px] p-7 space-y-6 shadow-[0_28px_80px_rgba(0,0,0,0.96)]">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#090F0D] border border-[#28D6B0]/30 text-[#28D6B0] text-xs font-bold">
                <span className="h-2 w-2 rounded-full bg-[#28D6B0] animate-pulse" />
                <span>FUNDED APEX LIVE TERMINAL</span>
              </div>
              <h1 className="font-display text-2xl font-extrabold text-[#F4F8F6] tracking-tight">
                Institutional Trading Terminal
              </h1>
              <p className="text-xs text-[#8B9A92]">
                Authenticate with your challenge credentials or master preview access to trade live quotes.
              </p>
            </div>

            {accounts.length > 0 && (
              <div className="p-4 rounded-[16px] bg-[#080D0B] border border-white/10 text-left space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#8B9A92]">Selected Account:</span>
                  <span className="font-bold text-[#F4F8F6]">
                    #{effectiveAccount.accountNumber} (${effectiveAccount.accountSize.toLocaleString()})
                  </span>
                </div>
                {accounts.length > 1 && (
                  <div className="pt-1.5 border-t border-white/5 space-y-1.5">
                    <span className="text-[10px] font-bold text-[#8B9A92] uppercase block">
                      Switch Challenge Account:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {accounts.map((acc) => {
                        const isCurr = acc.id === effectiveAccount.id;
                        const isBreached = acc.status === 'failed';
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => setActiveAccountId(acc.id)}
                            className={`px-3 py-1 rounded-[10px] text-[11px] font-bold border transition-all cursor-pointer ${
                              isCurr
                                ? isBreached
                                  ? 'bg-red-500/20 border-red-500 text-red-200'
                                  : 'bg-[#28D6B0] border-[#28D6B0] text-[#04100C]'
                                : isBreached
                                ? 'bg-[#090F0D] border-red-500/30 text-red-400'
                                : 'bg-[#090F0D] border-white/15 text-[#28D6B0] hover:border-[#28D6B0]/50'
                            }`}
                          >
                            #{acc.accountNumber} ({isBreached ? 'BREACHED' : 'ACTIVE'})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {passError && (
              <div className="p-3.5 rounded-[14px] bg-red-950/60 border border-red-500/50 text-xs font-medium text-red-300">
                {passError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPassError('');
                const ok = unlockTerminal(userIdInput, passInput);
                if (!ok) {
                  setPassError(
                    isSelectedAccountBreached
                      ? 'Account is Breached — Terminal Password has been removed. Please select an active account or buy a new evaluation.'
                      : 'Invalid Terminal User ID or Password. Check your Dashboard or Admin email notification.'
                  );
                }
              }}
              className="space-y-4 text-left"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#A5B5AE] block">
                  1. Terminal User ID
                </label>
                <input
                  type="text"
                  required
                  value={userIdInput}
                  onChange={(e) => setUserIdInput(e.target.value)}
                  placeholder="e.g. APEX-MASTER"
                  className="w-full px-4 py-3 rounded-[14px] bg-[#080D0B] border border-white/15 text-sm font-bold text-[#F4F8F6] focus:outline-none focus:border-[#28D6B0]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#A5B5AE] block">
                  2. Terminal Password
                </label>
                <div className="relative">
                  <input
                    type={showTerminalPass ? 'text' : 'password'}
                    required
                    value={passInput}
                    onChange={(e) => setPassInput(e.target.value)}
                    placeholder="e.g. APEX2026"
                    className="w-full px-4 py-3 rounded-[14px] bg-[#080D0B] border border-white/15 text-sm font-bold text-[#F4F8F6] focus:outline-none focus:border-[#28D6B0]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTerminalPass(!showTerminalPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B9A92] hover:text-white p-1"
                  >
                    {showTerminalPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => navigate(user ? 'dashboard' : 'home')}
                  className="py-3 px-4 rounded-[14px] apex-secondary-btn text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-[14px] apex-glow-btn text-xs cursor-pointer"
                >
                  Unlock Trading Terminal →
                </button>
              </div>
            </form>

            <div className="pt-3 border-t border-white/10 text-[11px] text-[#8B9A92] space-y-1">
              <div>
                Master Preview ID: <strong className="text-[#28D6B0]">APEX-MASTER</strong> • Pass: <strong className="text-[#28D6B0]">APEX2026</strong>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const displayedTimeframes = showAllTimeframes ? TIMEFRAMES : TIMEFRAMES.filter((t) => t.core);
  const secondaryQuote = quotes[secondarySymbol] || {
    bid: INSTRUMENTS[secondarySymbol].basePrice,
    ask: INSTRUMENTS[secondarySymbol].basePrice + INSTRUMENTS[secondarySymbol].spread,
  };

  return (
    <div className="fixed inset-0 w-screen h-[100dvh] z-[9999] bg-[#050807] text-[#F4F8F6] flex flex-col overflow-hidden selection:bg-[#28D6B0]/30 selection:text-[#28D6B0] font-sans">
      {/* 1. COMPACT TOP HEADER BAR (Account Switch + Attached Equity/Balance in 1 Compact Pill | LIVE | Logout) */}
      <header className="shrink-0 bg-[#090F0D] border-b border-[#28D6B0]/14 px-2.5 py-1.5 sm:px-4 select-none relative">
        <div className="w-full flex items-center justify-between gap-1.5">
          {/* Left: Compact Account Switch with Equity & Balance Attached Right Inside */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="hidden lg:flex items-center pr-2 border-r border-white/10 shrink-0">
              <FundedApexLogo size="sm" variant="compact" />
            </div>

            <button
              type="button"
              data-testid="terminal-account-switch-btn"
              onClick={() => setShowAccountDropdown(!showAccountDropdown)}
              className="inline-flex items-center gap-1.5 sm:gap-2.5 px-2.5 py-1 rounded-full bg-[#0C1411] hover:bg-[#121F1A] border border-[#28D6B0]/30 text-[11px] sm:text-xs transition-colors cursor-pointer min-w-0 overflow-hidden"
            >
              <span className="inline-flex items-center gap-1 font-bold text-[#28D6B0] shrink-0">
                <span>Acc #{effectiveAccount.accountNumber.slice(-4)}</span>
                <span className="text-[9px] text-[#8B9A92]">▼</span>
              </span>

              <span className="h-3 w-px bg-white/15 shrink-0" />

              <span className="inline-flex items-baseline gap-1 text-[#A5B5AE] font-medium shrink-0">
                <span className="text-[10px] uppercase tracking-tight text-[#8B9A92]">Eq</span>
                <strong
                  ref={equityRef}
                  data-testid="terminal-equity-val"
                  className="text-[#F4F8F6] font-extrabold tabular-nums text-xs sm:text-[13px]"
                >
                  $
                  {riskMetrics.equity.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </span>

              <span className="hidden xs:inline-flex sm:inline-flex items-baseline gap-1 text-[#A5B5AE] font-medium shrink-0 border-l border-white/10 pl-1.5 sm:pl-2">
                <span className="text-[10px] uppercase tracking-tight text-[#8B9A92]">Bal</span>
                <strong
                  ref={balanceRef}
                  data-testid="terminal-balance-val"
                  className="text-[#D4E2DD] font-bold tabular-nums text-[11px] sm:text-xs"
                >
                  $
                  {effectiveAccount.balance.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </span>

              <span className="hidden md:inline-flex items-baseline gap-1 text-[#A5B5AE] shrink-0 border-l border-white/10 pl-2">
                <span className="text-[10px] text-[#8B9A92]">P&amp;L</span>
                <strong
                  ref={pnlRef}
                  data-testid="terminal-pnl-val"
                  className={
                    riskMetrics.totalNetPnl >= 0
                      ? 'text-[#28D6B0] font-bold tabular-nums text-[11px]'
                      : 'text-[#F01650] font-bold tabular-nums text-[11px]'
                  }
                >
                  {riskMetrics.totalNetPnl >= 0 ? '+' : '-'}$
                  {Math.abs(riskMetrics.totalNetPnl).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </span>
            </button>
          </div>

          {/* Right: Compact LIVE Pill + Workspace Controls + Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              title="Price Alerts"
              onClick={() => {
                setNewAlertPrice(currentQuote.bid.toFixed(spec.decimals));
                setShowAlertsModal(true);
              }}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0C1411] hover:bg-[#121F1A] border border-[#28D6B0]/25 text-[11px] font-semibold text-[#A5B5AE] hover:text-[#28D6B0] cursor-pointer"
            >
              <Bell className="w-3 h-3 text-[#28D6B0]" />
              <span>Alerts ({priceAlerts.filter((a) => a.enabled).length})</span>
            </button>

            <button
              type="button"
              title="Toggle Single / Dual Chart Layout"
              onClick={() => setSplitChartLayout((v) => (v === 'single' ? 'dual' : 'single'))}
              className={`hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-semibold cursor-pointer ${
                splitChartLayout === 'dual'
                  ? 'bg-[#28D6B0] text-[#04100C] border-[#28D6B0]'
                  : 'bg-[#0C1411] text-[#A5B5AE] border-white/10 hover:text-white'
              }`}
            >
              <Columns className="w-3 h-3" />
              <span>{splitChartLayout === 'dual' ? '2x1' : '1x1'}</span>
            </button>

            <button
              type="button"
              title="Toggle Fullscreen"
              onClick={handleToggleFullscreen}
              className="hidden md:inline-flex p-1 rounded-full bg-[#0C1411] border border-white/10 text-[#A5B5AE] hover:text-[#28D6B0] cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            <div
              data-testid="terminal-market-status-badge"
              title={marketStatus.reason}
              className={`px-2.5 py-0.5 rounded-full border font-bold text-[10.5px] tracking-wide flex items-center gap-1 ${
                marketStatus.isOpen
                  ? 'border-[#00B87C]/65 bg-[#00B87C]/10 text-[#28D6B0]'
                  : 'border-[#F23645]/65 bg-[#F23645]/10 text-[#F23645]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  marketStatus.isOpen ? 'bg-[#00B87C] animate-pulse' : 'bg-[#F23645]'
                }`}
              />
              <span>{marketStatus.sessionLabel}</span>
            </div>

            <button
              type="button"
              data-testid="terminal-back-btn"
              onClick={() => {
                lockTerminal();
                navigate(user ? 'dashboard' : 'home');
              }}
              className="px-2 py-0.5 rounded-[10px] text-[11px] sm:text-xs text-[#8B9A92] hover:text-[#F4F8F6] font-semibold transition-colors cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Account Switcher Dropdown */}
        {showAccountDropdown && (
          <div className="absolute left-2.5 right-2.5 sm:left-4 sm:right-auto sm:w-[420px] top-11 z-50 bg-[#070C0A] border border-[#28D6B0]/30 rounded-[20px] p-4 shadow-[0_24px_64px_rgba(0,0,0,0.95)]">
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
              <div>
                <span className="text-xs font-display font-bold text-[#28D6B0] uppercase tracking-wider block">
                  Select Challenge Account ({phaseLabel})
                </span>
                <span className="text-[11px] text-[#A5B5AE]">
                  Switch active evaluation or configure challenge model
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAccountDropdown(false)}
                className="p-1.5 rounded-[10px] bg-[#0C1411] text-[#A5B5AE] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-2.5 space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar">
              <div className="text-[10px] font-bold text-[#8B9A92] uppercase px-1">
                Your Active Accounts ({accounts.length})
              </div>
              {accounts.length === 0 ? (
                <div className="p-3 text-center text-xs text-[#A5B5AE] bg-[#0C1411] rounded-[14px] border border-white/10">
                  No purchased accounts yet. Select a Challenge Type &amp; Capital below to test with institutional rules.
                </div>
              ) : (
                accounts.map((acc) => {
                  const isCurrent = acc.id === effectiveAccount.id;
                  const accRules = resolveChallengeRulesForAccount(acc);
                  const isAccBreached = acc.status === 'failed';
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setActiveAccountId(acc.id);
                        setShowAccountDropdown(false);
                      }}
                      className={`w-full p-3 rounded-[14px] text-left border transition-all cursor-pointer ${
                        isAccBreached
                          ? 'bg-red-950/30 border-red-500/40 text-red-200'
                          : isCurrent
                          ? 'bg-[#101B17] border-[#28D6B0] text-white'
                          : 'bg-[#0C1411] border-white/10 hover:border-[#28D6B0]/45 text-[#A5B5AE]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-white">#{acc.accountNumber}</span>
                        <span className={isAccBreached ? 'text-red-400' : 'text-[#28D6B0]'}>
                          ${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#A5B5AE] font-medium truncate mt-0.5">
                        {acc.challengeTitle} • {isAccBreached ? 'BREACHED' : acc.status.toUpperCase()}
                      </div>
                      <div className="text-[10px] text-[#8B9A92] mt-0.5">
                        Daily DD {accRules.dailyDrawdownPct}% • Max DD {accRules.maxDrawdownPct}% •{' '}
                        {acc.challengeType === 'instant' || accRules.profitTargetPct === 0
                          ? 'Funded Account'
                          : `Target +${accRules.profitTargetPct}%`}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="pt-2.5 border-t border-white/10 space-y-2">
              <div className="text-[10px] font-bold text-[#28D6B0] uppercase px-1">
                Challenge Model Rules
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'instant', label: 'Instant Funded (No Target)' },
                    { id: 'two_step', label: '2-Step (5% DD / 8% Target)' },
                    { id: 'one_step', label: '1-Step (4% DD / 10% Target)' },
                    { id: 'three_step', label: '3-Step (5% DD / 6% Target)' },
                  ] as { id: ChallengeType; label: string }[]
                ).map((ct) => (
                  <button
                    key={ct.id}
                    type="button"
                    onClick={() => {
                      setActiveAccountId('');
                      setPreviewChallengeType(ct.id);
                    }}
                    className={`py-2 px-2.5 rounded-[12px] text-[11px] font-semibold border text-left transition-all cursor-pointer ${
                      previewChallengeType === ct.id && !activeAccount
                        ? 'bg-[#28D6B0] text-[#04100C] border-[#28D6B0] font-bold'
                        : 'bg-[#0C1411] border-white/10 text-[#A5B5AE] hover:border-[#28D6B0]/45'
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>

              <div className="text-[10px] font-bold text-[#28D6B0] uppercase px-1 pt-1">
                Challenge Account Capital
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[3000, 5000, 10000, 25000, 50000, 100000, 200000].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => {
                      setActiveAccountId('');
                      setPreviewAccountSize(sz);
                      setShowAccountDropdown(false);
                    }}
                    className={`py-1.5 px-2 rounded-[10px] text-xs font-bold border transition-all cursor-pointer ${
                      previewAccountSize === sz && !activeAccount
                        ? 'bg-[#28D6B0] text-[#04100C] border-[#28D6B0] font-extrabold'
                        : 'bg-[#0C1411] border-white/10 text-[#A5B5AE] hover:border-[#28D6B0]/45'
                    }`}
                  >
                    ${(sz / 1000).toFixed(0)}K
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 mt-2 border-t border-white/10 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAccountDropdown(false);
                  setShowAdvancedOrderTicket(true);
                }}
                className="flex-1 py-2.5 rounded-[12px] apex-secondary-btn text-xs cursor-pointer"
              >
                SL / TP Order Ticket
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAccountDropdown(false);
                  openStripeCheckout(effectiveAccount.challengeId || 'two-step-5000');
                }}
                className="flex-1 py-2.5 rounded-[12px] apex-glow-btn text-xs cursor-pointer"
              >
                + Buy Challenge
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 2. PROMINENT ROUNDED FAST EXECUTION STRIP (LARGER SELL | BUY | GOLD ▼) */}
      <section className="shrink-0 bg-[#090F0D] px-2.5 py-1.5 sm:px-4 select-none">
        <div className="w-full flex sm:grid sm:grid-cols-12 gap-1.5 sm:gap-2.5 items-stretch">
          {/* Prominent Crimson Rose SELL Button (#F01650) */}
          <button
            type="button"
            data-testid="terminal-sell-btn"
            data-no-global-processing="true"
            onClick={() => handleQuickTrade('SELL')}
            className={`flex-1 min-w-0 sm:col-span-5 bg-gradient-to-r from-[#F01650] to-[#E11D48] hover:brightness-110 active:scale-[0.985] transition-all rounded-[14px] sm:rounded-[16px] py-2 sm:py-3.5 px-2.5 sm:px-4 flex items-center justify-between text-white shadow-[0_6px_20px_rgba(240,22,80,0.32)] border border-white/15 cursor-pointer ${
              !marketStatus.isOpen
                ? 'opacity-70 grayscale-[20%]'
                : tickDirection === 'down'
                ? 'ring-1 ring-white/85 brightness-110'
                : ''
            }`}
          >
            <div className="flex flex-col items-start leading-tight">
              <div className="flex items-center gap-1">
                <span className="text-[11px] sm:text-sm font-black tracking-wider uppercase">
                  SELL
                </span>
                <span className="w-2.5 text-center text-[10px] text-white">
                  {marketStatus.isOpen && tickDirection === 'down' ? '▼' : ''}
                </span>
              </div>
              <span className="text-[8.5px] sm:text-[10px] font-semibold text-white/80 uppercase tracking-wider">
                {marketStatus.isOpen ? 'Market Bid' : 'Market Closed'}
              </span>
            </div>
            <span
              ref={bidRef}
              className="text-[15px] sm:text-xl font-black tracking-tight tabular-nums leading-none"
            >
              {currentQuote.bid.toLocaleString('en-US', {
                minimumFractionDigits: spec.decimals,
                maximumFractionDigits: spec.decimals,
              })}
            </span>
          </button>

          {/* Prominent Aqua-Emerald BUY Button (#00B87C) */}
          <button
            type="button"
            data-testid="terminal-buy-btn"
            data-no-global-processing="true"
            onClick={() => handleQuickTrade('BUY')}
            className={`flex-1 min-w-0 sm:col-span-5 bg-gradient-to-r from-[#00B87C] to-[#12A982] hover:brightness-110 active:scale-[0.985] transition-all rounded-[14px] sm:rounded-[16px] py-2 sm:py-3.5 px-2.5 sm:px-4 flex items-center justify-between text-white shadow-[0_6px_20px_rgba(0,184,124,0.32)] border border-white/15 cursor-pointer ${
              !marketStatus.isOpen
                ? 'opacity-70 grayscale-[20%]'
                : tickDirection === 'up'
                ? 'ring-1 ring-white/85 brightness-110'
                : ''
            }`}
          >
            <div className="flex flex-col items-start leading-tight">
              <div className="flex items-center gap-1">
                <span className="text-[11px] sm:text-sm font-black tracking-wider uppercase">
                  BUY
                </span>
                <span className="w-2.5 text-center text-[10px] text-white">
                  {marketStatus.isOpen && tickDirection === 'up' ? '▲' : ''}
                </span>
              </div>
              <span className="text-[8.5px] sm:text-[10px] font-semibold text-white/80 uppercase tracking-wider">
                {marketStatus.isOpen ? 'Market Ask' : 'Market Closed'}
              </span>
            </div>
            <span
              ref={askRef}
              className="text-[15px] sm:text-xl font-black tracking-tight tabular-nums leading-none"
            >
              {currentQuote.ask.toLocaleString('en-US', {
                minimumFractionDigits: spec.decimals,
                maximumFractionDigits: spec.decimals,
              })}
            </span>
          </button>

          {/* Right Rounded Instrument Selector Button (GOLD ▼) */}
          <button
            type="button"
            data-testid="terminal-pair-selector-btn"
            onClick={() => setShowPairModal(true)}
            className="shrink-0 sm:col-span-2 bg-[#0C1411] hover:bg-[#121F1A] border border-white/15 active:scale-[0.99] transition-all rounded-[14px] sm:rounded-[16px] py-2 sm:py-3.5 px-2.5 sm:px-2 flex items-center justify-center gap-1 text-[#F4F8F6] font-extrabold text-xs sm:text-sm cursor-pointer"
          >
            <span className="whitespace-nowrap">{spec.shortName}</span>
            <span className="text-[10px] text-[#28D6B0]">▾</span>
          </button>
        </div>
      </section>

      {/* 3. COMPACT LOT SELECTOR + DD BAR + TARGET BAR */}
      <section className="shrink-0 bg-[#090F0D] border-b border-white/5 px-2.5 pb-1 pt-0.5 sm:px-4 select-none">
        <div className="grid grid-cols-12 gap-2 items-center">
          {/* Left: Compact Rounded Pill Lot Selector (Lot 0.01 ▾) */}
          <div className="col-span-4 relative">
            <div className="w-full bg-[#0C1411] border border-white/15 rounded-full px-2.5 py-1 flex items-center justify-between gap-1">
              <span className="text-[11px] text-[#8B9A92] font-semibold">Lot</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                aria-label="Trading Lot Size"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                className="w-12 bg-transparent text-center font-bold text-[#F4F8F6] text-xs outline-none tabular-nums"
              />
              <button
                type="button"
                aria-label="Lot presets"
                onClick={() => setShowLotDropdown(!showLotDropdown)}
                className="text-[#8B9A92] hover:text-[#28D6B0] cursor-pointer p-0.5 shrink-0"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {showLotDropdown && (
              <div className="absolute left-0 top-9 z-40 bg-[#070C0A] border border-[#28D6B0]/30 rounded-[18px] p-3 w-56 shadow-2xl space-y-2.5">
                <div className="px-2 py-1.5 rounded-[10px] bg-[#0C1411] border border-white/10 text-[10px] space-y-1">
                  <div className="flex items-center justify-between text-[#8B9A92]">
                    <span>Req. Margin ({effectiveAccount.leverage}x)</span>
                    <span className="font-mono font-bold text-[#28D6B0] tabular-nums">
                      ${currentLotMarginUsd.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#8B9A92]">
                    <span>Max Lot Capacity</span>
                    <button
                      type="button"
                      onClick={() => {
                        setVolume(maxAffordableLots.toFixed(2));
                        setShowLotDropdown(false);
                      }}
                      className="font-mono font-bold text-white hover:text-[#28D6B0] underline cursor-pointer tabular-nums"
                    >
                      {maxAffordableLots.toFixed(2)} Lot
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.max(0.01, Math.round((parsedVolume - 0.01) * 100) / 100);
                      setVolume(next.toFixed(2));
                    }}
                    className="flex-1 py-1.5 rounded-[10px] bg-[#0C1411] hover:bg-[#121F1A] border border-white/10 font-bold text-xs text-white cursor-pointer"
                  >
                    -0.01
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.min(100, Math.round((parsedVolume + 0.01) * 100) / 100);
                      setVolume(next.toFixed(2));
                    }}
                    className="flex-1 py-1.5 rounded-[10px] bg-[#0C1411] hover:bg-[#121F1A] border border-white/10 font-bold text-xs text-white cursor-pointer"
                  >
                    +0.01
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {LOT_PRESETS.map((lp) => (
                    <button
                      key={lp}
                      type="button"
                      onClick={() => {
                        setVolume(lp);
                        setShowLotDropdown(false);
                      }}
                      className="py-1.5 px-2 text-xs font-bold rounded-[10px] bg-[#0C1411] hover:bg-[#28D6B0] hover:text-[#04100C] text-white border border-white/5 cursor-pointer transition-colors"
                    >
                      {lp}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Middle: Compact DD Progress Column (Click to inspect Account & Challenge Rules) */}
          <div
            data-testid="terminal-daily-dd-card"
            onClick={() => setShowAccountRulesModal(true)}
            title="Click to inspect Daily & Max Drawdown Rules"
            className="col-span-4 space-y-0.5 cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[10px] font-bold leading-none">
              <span className="text-[#F01650] group-hover:underline">DD</span>
              <span
                ref={ddTextRef}
                data-testid="terminal-dd-text"
                className="text-[#8B9A92] font-semibold tabular-nums truncate"
              >
                ${ddUsedUsd.toFixed(0)}/${ddLimitUsd.toFixed(0)}
              </span>
              <span
                ref={ddPctRef}
                data-testid="terminal-dd-pct"
                className="text-[#F01650] tabular-nums"
              >
                {ddUsedPct.toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-[#14221D] rounded-full h-1.5 overflow-hidden">
              <div
                ref={ddBarRef}
                className="bg-[#F01650] h-1.5 rounded-full transition-all duration-150"
                style={{ width: `${Math.min(100, ddUsedPct)}%` }}
              />
            </div>
          </div>

          {/* Right: Compact TARGET Progress Column (Click to inspect Account & Challenge Rules) */}
          <div
            data-testid="terminal-profit-target-card"
            onClick={() => setShowAccountRulesModal(true)}
            title="Click to inspect Challenge Profit Target & Phase Rules"
            className="col-span-4 space-y-0.5 cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[10px] font-bold leading-none">
              <span className="text-[#00B87C] group-hover:underline">TARGET</span>
              <span
                ref={targetTextRef}
                data-testid="terminal-target-text"
                className="text-[#8B9A92] font-semibold tabular-nums truncate"
              >
                {isInstantAccount
                  ? 'Funded'
                  : `$${riskMetrics.netGainUsd.toFixed(0)}/$${targetLimitUsd.toFixed(0)}`}
              </span>
              <span
                ref={targetPctRef}
                data-testid="terminal-target-pct"
                className="text-[#00B87C] tabular-nums"
              >
                {isInstantAccount ? 'N/A' : `${riskMetrics.profitProgressPct.toFixed(0)}%`}
              </span>
            </div>
            <div className="w-full bg-[#14221D] rounded-full h-1.5 overflow-hidden">
              <div
                ref={targetBarRef}
                className="bg-[#00B87C] h-1.5 rounded-full transition-all duration-150"
                style={{
                  width: `${isInstantAccount ? 0 : Math.min(100, Math.max(0, riskMetrics.profitProgressPct))}%`,
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 4. COMPACT TIMEFRAME PILLS + CANDLE COUNTDOWN + LIVE SPOT PRICE + SL/TP ORDER BUTTON */}
      <section className="shrink-0 bg-[#090F0D] px-2.5 py-1 sm:px-4 border-b border-white/10 select-none">
        <div className="w-full flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto no-scrollbar max-w-full">
            {displayedTimeframes.map((tf) => {
              const isActive = timeframe.label === tf.label;
              return (
                <button
                  key={tf.label}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-2 sm:px-2.5 py-0.5 rounded-[9px] text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-[#14221D] text-[#F4F8F6] border border-[#28D6B0]/35 font-bold shadow-sm'
                      : 'bg-transparent text-[#8B9A92] hover:text-[#F4F8F6]'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setShowAllTimeframes((v) => !v)}
              className="px-1.5 py-0.5 rounded-[8px] text-[10.5px] font-semibold text-[#8B9A92] hover:text-[#28D6B0] cursor-pointer shrink-0"
              title="Show 1s, 3m, 2h, 1M timeframes"
            >
              {showAllTimeframes ? 'Less' : '+All'}
            </button>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto shrink-0 text-[11px] font-semibold tabular-nums">
            <button
              type="button"
              data-testid="terminal-live-price-with-timer"
              onClick={() => setChartFocusTrigger((prev) => prev + 1)}
              title="Click to focus chart on current live price"
              className={`inline-flex flex-col items-start sm:items-end justify-center min-w-[118px] whitespace-nowrap px-2 py-0.5 rounded-[8px] font-bold leading-tight transition-colors duration-150 cursor-pointer ${
                !marketStatus.isOpen
                  ? 'bg-[#F23645]/10 text-[#F23645]'
                  : tickDirection === 'up'
                  ? 'bg-[#28D6B0]/20 text-[#28D6B0]'
                  : tickDirection === 'down'
                  ? 'bg-[#F01650]/20 text-[#F01650]'
                  : 'text-[#00B87C]'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <span>{spec.shortName}</span>
                <span>
                  {liveMidPrice.toLocaleString('en-US', {
                    minimumFractionDigits: spec.decimals,
                    maximumFractionDigits: spec.decimals,
                  })}
                </span>
                <span className="text-[9px]">
                  {!marketStatus.isOpen
                    ? '•'
                    : tickDirection === 'up'
                    ? '▲'
                    : tickDirection === 'down'
                    ? '▼'
                    : '•'}
                </span>
              </span>
              <span
                data-testid="terminal-header-countdown"
                className={`text-[9.5px] font-semibold tabular-nums leading-none mt-0.5 ${
                  !marketStatus.isOpen ? 'text-[#F23645]' : 'text-[#D1D4DC] opacity-90'
                }`}
              >
                {marketStatus.isOpen ? candleCountdown : 'CLOSED · Sun 22:00 UTC'}
              </span>
            </button>

            <button
              type="button"
              data-testid="terminal-account-rules-btn"
              onClick={() => setShowAccountRulesModal(true)}
              className="px-2 py-1 rounded-[8px] bg-[#0C1411] border border-white/15 text-[10.5px] font-bold text-[#D1D4DC] hover:border-[#28D6B0]/40 hover:text-[#28D6B0] cursor-pointer"
              title="Inspect Active Account & Challenge Rules"
            >
              Rules
            </button>

            <button
              type="button"
              data-testid="terminal-sltp-order-btn"
              onClick={() => setShowAdvancedOrderTicket(true)}
              className="px-2 py-1 rounded-[8px] bg-[#0C1411] border border-[#28D6B0]/25 text-[10.5px] font-bold text-[#28D6B0] hover:bg-[#121F1A] cursor-pointer"
            >
              +SL/TP Order
            </button>
          </div>
        </div>
      </section>

      {/* 5. MAIN WORKSPACE: LEFT WATCHLIST (XL+) + CENTER CHART(S) + RIGHT ORDER PANEL (2XL+) */}
      <section className="flex-1 min-h-0 relative bg-[#131722] w-full overflow-hidden flex">
        {/* Desktop Left Market Watch Sidebar */}
        <aside className="hidden xl:flex w-64 shrink-0 bg-[#090F0D] border-r border-white/10 flex-col select-none">
          <div className="p-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-bold text-[#28D6B0]">
              Market Watch
            </span>
            <span className="text-[11px] font-semibold text-[#8B9A92]">24 Pairs</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/5">
            {allSymbols.map((sym) => {
              const itemSpec = INSTRUMENTS[sym];
              const pairMarket = getMarketStatus(sym, marketClockMs);
              const q = quotes[sym] || { bid: itemSpec.basePrice, ask: itemSpec.basePrice + itemSpec.spread, change24hPct: 0 };
              const isSelected = symbol === sym;
              const isPos = q.change24hPct >= 0;
              const symDir = symbolTickMap[sym] || (isPos ? 'up' : 'down');
              return (
                <button
                  key={sym}
                  type="button"
                  data-testid={`watchlist-pair-${sym}`}
                  onClick={() => handleSelectPair(sym)}
                  className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#0C1411] border-l-2 border-l-[#28D6B0]'
                      : 'hover:bg-[#0C1411]/60'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-[#F4F8F6] flex items-center gap-1.5">
                      <span>{itemSpec.shortName}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded-[6px] font-bold ${
                          !pairMarket.isOpen
                            ? 'bg-[#F23645]/15 text-[#F23645]'
                            : pairMarket.sessionLabel === '24/7 LIVE'
                            ? 'bg-[#089981]/20 text-[#28D6B0]'
                            : 'bg-[#101B17] text-[#8B9A92]'
                        }`}
                      >
                        {!pairMarket.isOpen
                          ? 'CLOSED'
                          : pairMarket.sessionLabel === '24/7 LIVE'
                          ? '24/7'
                          : itemSpec.category === 'Commodities'
                          ? 'GOLD'
                          : itemSpec.category}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#8B9A92] truncate max-w-[115px]">{itemSpec.name}</div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-xs font-bold tabular-nums inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[7px] transition-colors duration-200 ${
                        !pairMarket.isOpen
                          ? 'text-[#787B86] bg-white/5'
                          : symDir === 'up'
                          ? 'text-[#28D6B0] bg-[#28D6B0]/12'
                          : 'text-[#F01650] bg-[#F01650]/12'
                      }`}
                    >
                      <span className="text-[8px]">{pairMarket.isOpen ? (symDir === 'up' ? '▲' : '▼') : '•'}</span>
                      <span>{q.bid.toFixed(itemSpec.decimals)}</span>
                    </div>
                    <div className={`text-[10px] font-semibold tabular-nums mt-0.5 ${isPos ? 'text-[#28D6B0]' : 'text-[#F01650]'}`}>
                      {isPos ? '+' : ''}{q.change24hPct}%
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center Live Candlestick Chart Viewport (Single or Dual Split) */}
        <div
          className={`flex-1 min-w-0 h-full relative ${
            splitChartLayout === 'dual' ? 'grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/10' : ''
          }`}
        >
          {terminalTopBanner && (
            <div className="pointer-events-none fixed top-2.5 inset-x-2.5 sm:inset-x-4 z-[70] flex justify-center">
              <div
                key={terminalTopBanner.id}
                data-testid="terminal-top-1s-banner"
                className={`pointer-events-auto w-full max-w-[500px] rounded-[14px] px-3.5 py-2.5 border shadow-[0_14px_38px_rgba(0,0,0,0.85)] flex items-start justify-between gap-2.5 apex-terminal-1s-banner ${
                  terminalTopBanner.tone === 'emerald'
                    ? 'bg-[#061812] border-[#00B87C]/70 text-white'
                    : terminalTopBanner.tone === 'rose'
                    ? 'bg-[#1A070D] border-[#F01650]/70 text-white'
                    : 'bg-[#071512] border-[#28D6B0]/70 text-white'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <span
                    className={`w-2.5 h-2.5 mt-1 rounded-full shrink-0 ${
                      terminalTopBanner.tone === 'emerald'
                        ? 'bg-[#00B87C] shadow-[0_0_10px_#00B87C]'
                        : terminalTopBanner.tone === 'rose'
                        ? 'bg-[#F01650] shadow-[0_0_10px_#F01650]'
                        : 'bg-[#28D6B0] shadow-[0_0_10px_#28D6B0]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-extrabold tracking-tight leading-snug break-words">
                      {terminalTopBanner.title}
                    </div>
                    {terminalTopBanner.detail && (
                      <div className="text-[11px] font-semibold text-[#C8D8D1] leading-snug break-words tabular-nums mt-0.5">
                        {terminalTopBanner.detail}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss terminal message"
                  onClick={() => setTerminalTopBanner(null)}
                  className="text-[#8B9A92] hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="w-full h-full relative">
            <TradingTerminalChart
              symbol={symbol}
              timeframeLabel={timeframe.label}
              timeframeSeconds={timeframe.seconds}
              candleCountdown={candleCountdown}
              currentBid={currentQuote.bid}
              currentAsk={currentQuote.ask}
              focusTrigger={chartFocusTrigger}
              chartType={chartType}
              onChartTypeChange={setChartType}
              tradeVolume={volume}
              onTradeVolumeChange={setVolume}
              onExecuteMarketOrder={(side, sym) => handleQuickTrade(side, sym)}
              onPlacePendingOrderAtPrice={(side, price, sym) =>
                handleChartPendingOrderAtPrice(side, price, sym)
              }
              openPositions={currentSymbolPositions}
              pendingOrders={pendingOrders.filter((o) => o.symbol === symbol)}
              onClosePosition={handleCloseWithBanner}
              onCancelPendingOrder={cancelPendingOrder}
              onModifyPositionSlTp={handleChartModifySlTp}
              onEditPositionModal={(pos) => {
                setEditingOrder(pos);
                setEditOrderError(null);
                setEditSl(pos.stopLoss ? String(pos.stopLoss) : '');
                setEditTp(pos.takeProfit ? String(pos.takeProfit) : '');
                setEditEntry(pos.status === 'PENDING' ? String(pos.entryPrice) : '');
              }}
              onQuickCreateAlert={(price) => {
                setNewAlertPrice(price.toFixed(spec.decimals));
                setNewAlertCondition(price >= currentQuote.bid ? 'ABOVE' : 'BELOW');
                setShowAlertsModal(true);
              }}
              draftSl={parseFloat(advSl) || 0}
              draftTp={parseFloat(advTp) || 0}
              draftSide={advSide}
              draftEntryPrice={parseFloat(advEntryPrice) || 0}
              draftLots={parsedVolume > 0 ? parsedVolume : 0.01}
            />
          </div>

          {splitChartLayout === 'dual' && (
            <div className="w-full h-full relative">
              <div className="absolute top-11 right-2.5 z-20">
                <select
                  aria-label="Secondary Chart Symbol"
                  value={secondarySymbol}
                  onChange={(e) => {
                    setSecondarySymbol(e.target.value as SymbolCode);
                    setChartFocusTrigger((prev) => prev + 1);
                  }}
                  className="px-2.5 py-1 rounded-[8px] bg-[#080D0B]/95 border border-white/15 text-xs font-bold text-[#D1D4DC] outline-none cursor-pointer shadow-lg"
                >
                  {allSymbols.map((s) => (
                    <option key={s} value={s}>
                      {INSTRUMENTS[s].shortName} ({s})
                    </option>
                  ))}
                </select>
              </div>
              <TradingTerminalChart
                symbol={secondarySymbol}
                timeframeLabel={timeframe.label}
                timeframeSeconds={timeframe.seconds}
                candleCountdown={candleCountdown}
                currentBid={secondaryQuote.bid}
                currentAsk={secondaryQuote.ask}
                focusTrigger={chartFocusTrigger}
                chartType={chartType}
                showDrawingToolbar={false}
                tradeVolume={volume}
                onTradeVolumeChange={setVolume}
                onExecuteMarketOrder={(side, sym) => handleQuickTrade(side, sym)}
                onPlacePendingOrderAtPrice={(side, price, sym) =>
                  handleChartPendingOrderAtPrice(side, price, sym)
                }
                openPositions={openPositions.filter((p) => p.symbol === secondarySymbol)}
                pendingOrders={pendingOrders.filter((o) => o.symbol === secondarySymbol)}
                onClosePosition={handleCloseWithBanner}
                onCancelPendingOrder={cancelPendingOrder}
                onModifyPositionSlTp={(orderId, sl, tp) =>
                  modifyOrder(orderId, { stopLoss: sl, takeProfit: tp, allowAutoClamp: true })
                }
              />
            </div>
          )}
        </div>

        {/* Desktop Right Institutional Order Panel & Risk Telemetry */}
        <aside className="hidden 2xl:flex w-72 shrink-0 bg-[#090F0D] border-l border-white/10 p-4 flex-col justify-between select-none overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <span className="text-xs font-display font-bold text-[#F4F8F6]">
                Order Execution Panel
              </span>
              <span className="text-xs font-bold text-[#28D6B0]">{symbol}</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-[14px] bg-[#0C1411] border border-white/10">
              {(['MARKET', 'LIMIT', 'STOP'] as const).map((ot) => (
                <button
                  key={ot}
                  type="button"
                  onClick={() => setAdvOrderType(ot)}
                  className={`py-1.5 rounded-[10px] text-[11px] font-bold cursor-pointer transition-colors ${
                    advOrderType === ot
                      ? 'bg-[#28D6B0] text-[#04100C]'
                      : 'text-[#8B9A92] hover:text-white'
                  }`}
                >
                  {ot}
                </button>
              ))}
            </div>

            {advOrderType !== 'MARKET' && (
              <div>
                <label className="block text-[11px] font-semibold text-[#A5B5AE] mb-1">
                  Trigger Price
                </label>
                <input
                  type="number"
                  step="any"
                  value={advEntryPrice}
                  onChange={(e) => setAdvEntryPrice(e.target.value)}
                  placeholder={String(currentQuote.bid)}
                  className="w-full px-3 py-2 rounded-[12px] bg-[#0C1411] border border-white/15 text-xs font-bold text-white"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#A5B5AE] mb-1">Stop Loss</label>
                <input
                  type="number"
                  step="any"
                  value={advSl}
                  onChange={(e) => setAdvSl(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2.5 py-2 rounded-[12px] bg-[#0C1411] border border-white/15 text-xs font-bold text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#A5B5AE] mb-1">Take Profit</label>
                <input
                  type="number"
                  step="any"
                  value={advTp}
                  onChange={(e) => setAdvTp(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2.5 py-2 rounded-[12px] bg-[#0C1411] border border-white/15 text-xs font-bold text-white"
                />
              </div>
            </div>

            {advOrderType === 'MARKET' ? (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleQuickTrade('SELL')}
                  className="py-2.5 rounded-[12px] bg-[#F01650] hover:bg-[#E11D48] text-white text-xs font-extrabold cursor-pointer"
                >
                  SELL {volume}L
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickTrade('BUY')}
                  className="py-2.5 rounded-[12px] bg-[#00B87C] hover:bg-[#12A982] text-white text-xs font-extrabold cursor-pointer"
                >
                  BUY {volume}L
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAdvSide('SELL');
                    setTimeout(handleAdvOrder, 0);
                  }}
                  className="py-2.5 rounded-[12px] bg-[#F01650] text-white text-xs font-extrabold cursor-pointer"
                >
                  {advOrderType} SELL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdvSide('BUY');
                    setTimeout(handleAdvOrder, 0);
                  }}
                  className="py-2.5 rounded-[12px] bg-[#00B87C] text-white text-xs font-extrabold cursor-pointer"
                >
                  {advOrderType} BUY
                </button>
              </div>
            )}

            {/* Account Risk & Margin Telemetry Box */}
            <div className="p-3.5 rounded-[16px] bg-[#0C1411] border border-white/10 space-y-2 text-[11px]">
              <div className="text-[#28D6B0] font-bold">Account Risk Telemetry</div>
              <div className="flex justify-between">
                <span className="text-[#8B9A92]">Used Margin</span>
                <span className="text-white font-bold tabular-nums">${riskMetrics.usedMargin.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8B9A92]">Free Margin</span>
                <span className="text-white font-bold tabular-nums">${riskMetrics.freeMargin.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8B9A92]">Daily Drawdown</span>
                <span className="text-[#F01650] font-bold tabular-nums">
                  {riskMetrics.dailyDrawdownUsedPct.toFixed(1)}% ({effectiveAccount.dailyDrawdownPct}% Max)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8B9A92]">Max Drawdown</span>
                <span className="text-[#F01650] font-bold tabular-nums">
                  {riskMetrics.maxDrawdownUsedPct.toFixed(1)}% ({effectiveAccount.maxDrawdownPct}% Max)
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 text-[10px] text-[#8B9A92] space-y-1">
            <div className="flex items-center gap-1.5 text-[#A5B5AE] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-[#28D6B0]" />
              <span>Simulated Prop Execution</span>
            </div>
            <p>All orders execute against real-time institutional market quotes in a simulated evaluation environment.</p>
          </div>
        </aside>
      </section>

      {/* 6. BOTTOM NAVIGATION BAR (Home | Charts | Position — Matching Uploaded Screenshot) */}
      <nav className="shrink-0 bg-[#090F0D] border-t border-white/10 px-6 py-2 select-none z-30">
        <div className="w-full flex items-center justify-around">
          <button
            type="button"
            data-testid="terminal-bottom-home"
            onClick={() => navigate(user ? 'dashboard' : 'home')}
            className="flex flex-col items-center gap-0.5 text-[#8B9A92] hover:text-[#28D6B0] transition-colors cursor-pointer py-0.5"
          >
            <Home className="w-5 h-5" />
            <span className="text-xs font-medium">Home</span>
          </button>

          <button
            type="button"
            data-testid="terminal-bottom-charts"
            onClick={() => {
              setShowPositionsDrawer(false);
              setChartFocusTrigger((prev) => prev + 1);
            }}
            className="flex flex-col items-center gap-0.5 text-[#28D6B0] transition-colors cursor-pointer py-0.5"
          >
            <Activity className="w-5 h-5" />
            <span className="text-xs font-semibold">Charts</span>
          </button>

          <button
            type="button"
            data-testid="terminal-bottom-position"
            onClick={() => setShowPositionsDrawer(true)}
            className="flex flex-col items-center gap-0.5 text-[#8B9A92] hover:text-[#28D6B0] transition-colors cursor-pointer py-0.5 relative"
          >
            <div className="relative flex items-center justify-center h-5">
              <Layers className="w-5 h-5" />
              {openPositions.length > 0 && (
                <span className="absolute -top-1.5 -right-3 px-1.5 py-0.2 rounded-full bg-[#28D6B0] text-[#04100C] text-[10px] font-extrabold">
                  {openPositions.length}
                </span>
              )}
            </div>
            <span className="text-xs font-medium">Position</span>
          </button>
        </div>
      </nav>

      {/* 7. ALL PAIRS SELECTOR MODAL */}
      {showPairModal && (
        <div className="fixed inset-0 z-50 bg-[#050807]/90 apex-backdrop-enter flex items-center justify-center p-3 sm:p-5">
          <div className="w-full max-w-2xl bg-[#070C0A] border border-[#28D6B0]/25 rounded-[22px] p-5 sm:p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col apex-scale-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-display text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>Select Market Instrument</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#0C1411] border border-[#28D6B0]/30 text-[#28D6B0] font-bold">
                    24 Live Pairs
                  </span>
                </h3>
                <p className="text-xs text-[#8B9A92] mt-0.5">
                  Forex, Gold (XAUUSD), Indices &amp; Crypto with live simulated execution
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPairModal(false)}
                className="p-2 rounded-[12px] bg-[#0C1411] text-[#8B9A92] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-[#8B9A92] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search GOLD, XAUUSD, EURUSD, GBPUSD, BTCUSD, NAS100..."
                value={pairSearchQuery}
                onChange={(e) => setPairSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-[14px] bg-[#0C1411] border border-white/15 text-xs font-semibold text-white placeholder-[#8B9A92] focus:border-[#28D6B0] outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {INSTRUMENT_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setPairCategoryFilter(cat.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    pairCategoryFilter === cat.id
                      ? 'bg-[#28D6B0] text-[#04100C] font-bold'
                      : 'bg-[#0C1411] text-[#A5B5AE] hover:text-white border border-white/10'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {filteredSymbols.map((sym) => {
                const itemSpec = INSTRUMENTS[sym];
                const pairMarket = getMarketStatus(sym, marketClockMs);
                const q = quotes[sym] || {
                  bid: itemSpec.basePrice,
                  ask: itemSpec.basePrice + itemSpec.spread,
                  change24hPct: 0,
                };
                const isSelected = symbol === sym;
                const isPositive = q.change24hPct >= 0;
                const symDir = symbolTickMap[sym] || (isPositive ? 'up' : 'down');

                return (
                  <button
                    key={sym}
                    type="button"
                    data-testid={`pair-item-${sym}`}
                    onClick={() => handleSelectPair(sym)}
                    className={`w-full p-3.5 rounded-[16px] border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#101B17] border-[#28D6B0]'
                        : 'bg-[#0C1411] border-white/10 hover:border-[#28D6B0]/45'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[12px] bg-[#080D0B] border border-[#28D6B0]/25 flex items-center justify-center font-bold text-xs text-[#28D6B0]">
                        {itemSpec.shortName.slice(0, 4)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white">
                            {itemSpec.shortName}
                          </span>
                          <span className="text-xs text-[#8B9A92]">({sym})</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#080D0B] text-[#8B9A92] font-semibold">
                            {itemSpec.category}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              !pairMarket.isOpen
                                ? 'bg-[#F23645]/15 text-[#F23645]'
                                : pairMarket.sessionLabel === '24/7 LIVE'
                                ? 'bg-[#089981]/20 text-[#28D6B0]'
                                : 'bg-[#089981]/15 text-[#28D6B0]'
                            }`}
                          >
                            {pairMarket.sessionLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#8B9A92]">{itemSpec.name}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`text-sm font-bold tabular-nums inline-flex items-center gap-1 px-2 py-0.5 rounded-[8px] transition-colors duration-200 ${
                          !pairMarket.isOpen
                            ? 'text-[#787B86] bg-white/5'
                            : symDir === 'up'
                            ? 'text-[#28D6B0] bg-[#28D6B0]/14'
                            : 'text-[#F01650] bg-[#F01650]/14'
                        }`}
                      >
                        <span className="text-[9px]">{pairMarket.isOpen ? (symDir === 'up' ? '▲' : '▼') : '•'}</span>
                        <span>{q.bid.toFixed(itemSpec.decimals)}</span>
                      </div>
                      <div className="flex items-center justify-end gap-1.5 text-[11px] mt-0.5">
                        <span className="text-[#8B9A92] tabular-nums">
                          Ask: {q.ask.toFixed(itemSpec.decimals)}
                        </span>
                        <span
                          className={`font-bold tabular-nums ${
                            isPositive ? 'text-[#28D6B0]' : 'text-[#F01650]'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {q.change24hPct}%
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 8. POSITIONS, PENDING ORDERS & TRADING HISTORY BLOTTER DRAWER */}
      {showPositionsDrawer && (
        <div className="fixed inset-0 z-50 bg-[#050807]/88 apex-backdrop-enter flex items-end sm:items-center justify-center">
          <div className="w-full sm:max-w-4xl bg-[#070C0A] border-t sm:border border-[#28D6B0]/25 rounded-t-[24px] sm:rounded-[24px] p-5 sm:p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col apex-sheet-up sm:apex-scale-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <h3 className="font-display text-base sm:text-lg font-bold text-white">
                  Positions, Pending Orders &amp; History Blotter
                </h3>
                <span className="text-xs px-3 py-0.5 rounded-full bg-[#0C1411] border border-[#28D6B0]/30 font-bold text-[#28D6B0]">
                  #{effectiveAccount.accountNumber}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPositionsDrawer(false)}
                className="p-2 rounded-[12px] bg-[#0C1411] text-[#8B9A92] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 bg-[#0C1411] p-1 rounded-[14px] border border-white/10">
                <button
                  type="button"
                  onClick={() => setBlotterTab('positions')}
                  className={`px-3.5 py-1.5 rounded-[10px] text-xs font-bold transition-all cursor-pointer ${
                    blotterTab === 'positions'
                      ? 'bg-[#28D6B0] text-[#04100C] font-extrabold'
                      : 'text-[#8B9A92] hover:text-white'
                  }`}
                >
                  Open Positions ({openPositions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBlotterTab('pending')}
                  className={`px-3.5 py-1.5 rounded-[10px] text-xs font-bold transition-all cursor-pointer ${
                    blotterTab === 'pending'
                      ? 'bg-[#28D6B0] text-[#04100C] font-extrabold'
                      : 'text-[#8B9A92] hover:text-white'
                  }`}
                >
                  Pending Orders ({pendingOrders.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBlotterTab('history')}
                  className={`px-3.5 py-1.5 rounded-[10px] text-xs font-bold transition-all cursor-pointer ${
                    blotterTab === 'history'
                      ? 'bg-[#28D6B0] text-[#04100C] font-extrabold'
                      : 'text-[#8B9A92] hover:text-white'
                  }`}
                >
                  Trading History ({tradeHistory.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOrderTicket(true)}
                  className="px-3.5 py-1.5 rounded-[12px] bg-[#0C1411] hover:bg-[#121F1A] border border-[#28D6B0]/30 text-xs font-bold text-[#28D6B0] flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Limit / Stop Order</span>
                </button>

                {blotterTab === 'history' && (
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="px-3.5 py-1.5 rounded-[12px] bg-[#0C1411] hover:bg-[#121F1A] border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#28D6B0]" />
                    <span>Export CSV</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px] custom-scrollbar">
              {blotterTab === 'positions' &&
                (openPositions.length === 0 ? (
                  <div className="text-center py-12 text-xs text-[#8B9A92] space-y-1">
                    <p className="font-bold text-[#A5B5AE]">
                      No open positions on #{effectiveAccount.accountNumber}.
                    </p>
                    <p>Tap SELL or BUY to execute a simulated position on the live chart.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {openPositions.map((pos) => (
                      <div
                        key={pos.id}
                        className="p-4 rounded-[16px] bg-[#0C1411] border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-3 py-1 rounded-[10px] font-extrabold ${
                              pos.side === 'BUY' ? 'bg-[#00B87C] text-white' : 'bg-[#F01650] text-white'
                            }`}
                          >
                            {pos.side} {pos.volume}
                          </span>
                          <div>
                            <div className="font-bold text-white">{pos.symbol}</div>
                            <div className="text-[11px] text-[#A5B5AE] tabular-nums">
                              Entry: {pos.entryPrice} → Current: {pos.currentPrice}
                            </div>
                            <div className="text-[10px] text-[#8B9A92] mt-0.5 flex items-center gap-2 tabular-nums">
                              <span className="text-[#F01650] font-semibold">
                                SL: {pos.stopLoss > 0 ? pos.stopLoss : 'None'}
                              </span>
                              <span>•</span>
                              <span className="text-[#28D6B0] font-semibold">
                                TP: {pos.takeProfit > 0 ? pos.takeProfit : 'None'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-sm font-extrabold tabular-nums ${
                              pos.netPnl >= 0 ? 'text-[#28D6B0]' : 'text-[#F01650]'
                            }`}
                          >
                            {pos.netPnl >= 0 ? '+' : ''}${pos.netPnl.toFixed(2)}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingOrder(pos);
                              setEditOrderError(null);
                              setEditSl(pos.stopLoss ? String(pos.stopLoss) : '');
                              setEditTp(pos.takeProfit ? String(pos.takeProfit) : '');
                              setEditEntry('');
                            }}
                            className="px-2.5 py-1.5 rounded-[10px] bg-[#080D0B] border border-white/15 text-[#A5B5AE] hover:text-white font-bold cursor-pointer"
                          >
                            Edit SL/TP
                          </button>

                          {pos.volume >= 0.02 && (
                            <button
                              type="button"
                              onClick={() => handlePartialClose(pos, 0.5)}
                              className="px-2.5 py-1.5 rounded-[10px] bg-[#14221D] border border-[#28D6B0]/30 text-[#28D6B0] font-bold cursor-pointer"
                              title="Partial Close 50% of Position"
                            >
                              Close 50%
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCloseWithBanner(pos.id)}
                            className="px-3.5 py-1.5 rounded-[10px] bg-[#F01650] text-white font-bold cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

              {blotterTab === 'pending' &&
                (pendingOrders.length === 0 ? (
                  <div className="text-center py-12 text-xs text-[#8B9A92]">
                    No pending limit or stop orders.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pendingOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-4 rounded-[16px] bg-[#0C1411] border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-bold text-white">
                            {ord.symbol} · {ord.orderType} {ord.side} ({ord.volume} Lot)
                          </span>
                          <div className="text-[#A5B5AE] tabular-nums">
                            Trigger @ {ord.entryPrice} · SL: {ord.stopLoss > 0 ? ord.stopLoss : 'None'} · TP:{' '}
                            {ord.takeProfit > 0 ? ord.takeProfit : 'None'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingOrder(ord);
                              setEditOrderError(null);
                              setEditSl(ord.stopLoss ? String(ord.stopLoss) : '');
                              setEditTp(ord.takeProfit ? String(ord.takeProfit) : '');
                              setEditEntry(String(ord.entryPrice));
                            }}
                            className="px-2.5 py-1.5 rounded-[10px] bg-[#080D0B] border border-white/15 text-[#A5B5AE] hover:text-white font-bold cursor-pointer"
                          >
                            Edit SL/TP
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelPendingOrder(ord.id)}
                            className="px-3.5 py-1.5 rounded-[10px] bg-[#F01650]/20 text-[#F01650] font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

              {blotterTab === 'history' &&
                (tradeHistory.length === 0 ? (
                  <div className="text-center py-12 text-xs text-[#8B9A92]">
                    No closed trades recorded yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tradeHistory.map((h) => (
                      <div
                        key={h.id}
                        className="p-3.5 rounded-[16px] bg-[#0C1411] border border-white/10 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-white">
                            {h.symbol} {h.side} {h.volume} Lot
                          </span>
                          <div className="text-[11px] text-[#A5B5AE] tabular-nums">
                            {h.entryPrice} → {h.exitPrice || h.currentPrice}
                          </div>
                        </div>
                        <span
                          className={`font-extrabold tabular-nums ${
                            h.netPnl >= 0 ? 'text-[#28D6B0]' : 'text-[#F01650]'
                          }`}
                        >
                          {h.netPnl >= 0 ? '+' : ''}${h.netPnl.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 9. MODIFY SL/TP MODAL (With Risk/Reward Calculator, Presets & Mobile Viewport Fit) */}
      {editingOrder && (() => {
        const orderSpec = INSTRUMENTS[editingOrder.symbol] || spec;
        const orderQuote = quotes[editingOrder.symbol] || currentQuote;
        const refEntry =
          editingOrder.status === 'PENDING' && editEntry && Number.isFinite(parseFloat(editEntry))
            ? parseFloat(editEntry)
            : editingOrder.entryPrice;
        const parsedSlNum = editSl.trim() ? parseFloat(editSl) : 0;
        const parsedTpNum = editTp.trim() ? parseFloat(editTp) : 0;
        const preview = validateAndComputeSlTpPreview({
          symbol: editingOrder.symbol,
          side: editingOrder.side,
          volume: editingOrder.volume,
          referencePrice: refEntry,
          liveBid: orderQuote.bid,
          liveAsk: orderQuote.ask,
          stopLoss: Number.isFinite(parsedSlNum) ? parsedSlNum : 0,
          takeProfit: Number.isFinite(parsedTpNum) ? parsedTpNum : 0,
          isOpenPosition: editingOrder.status === 'OPEN',
          allowAutoClamp: false,
        });
        const presets = computeSlTpPresets({
          symbol: editingOrder.symbol,
          side: editingOrder.side,
          volume: editingOrder.volume,
          entryPrice: refEntry,
          liveBid: orderQuote.bid,
          liveAsk: orderQuote.ask,
          currentSl: Number.isFinite(parsedSlNum) && parsedSlNum > 0 ? parsedSlNum : undefined,
          isOpenPosition: editingOrder.status === 'OPEN',
        });

        const isSlProfitLocked =
          editingOrder.status === 'OPEN' &&
          Number.isFinite(parsedSlNum) &&
          parsedSlNum > 0 &&
          ((editingOrder.side === 'BUY' && parsedSlNum >= editingOrder.entryPrice) ||
            (editingOrder.side === 'SELL' && parsedSlNum <= editingOrder.entryPrice));
        const slProfitLockUsd =
          isSlProfitLocked
            ? Math.max(
                0,
                (editingOrder.side === 'BUY'
                  ? parsedSlNum - editingOrder.entryPrice
                  : editingOrder.entryPrice - parsedSlNum) *
                  orderSpec.contractSize *
                  editingOrder.volume
              )
            : 0;

        return (
          <div className="fixed inset-0 z-[60] bg-[#050807]/90 apex-backdrop-enter flex items-center justify-center p-3 sm:p-4">
            <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto custom-scrollbar bg-[#070C0A] border border-[#28D6B0]/35 rounded-[20px] p-4 sm:p-6 space-y-4 shadow-2xl apex-scale-in">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h3 className="font-display text-sm sm:text-base font-bold text-white">
                    Modify SL / TP ({editingOrder.symbol})
                  </h3>
                  <div className="text-[11px] font-mono text-[#A5B5AE] tabular-nums mt-0.5">
                    {editingOrder.side} {editingOrder.volume.toFixed(2)}L · Entry{' '}
                    {editingOrder.entryPrice.toFixed(orderSpec.decimals)} · Bid{' '}
                    {orderQuote.bid.toFixed(orderSpec.decimals)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingOrder(null);
                    setEditOrderError(null);
                  }}
                  className="text-[#8B9A92] hover:text-white cursor-pointer p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {(editOrderError || (!preview.valid && preview.error)) && (
                <div
                  data-testid="sltp-modal-error"
                  className="p-2.5 rounded-[12px] bg-[#F01650]/15 border border-[#F01650]/45 text-xs font-semibold text-rose-200 leading-snug break-words"
                >
                  {editOrderError || preview.error}
                </div>
              )}

              {editingOrder.status === 'PENDING' && (
                <div>
                  <label className="block text-xs font-medium text-[#A5B5AE] mb-1">
                    Pending Trigger Price
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={editEntry}
                    onChange={(e) => {
                      setEditEntry(e.target.value);
                      setEditOrderError(null);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#0C1411] border border-white/15 text-xs font-bold text-white tabular-nums"
                  />
                </div>
              )}

              {/* Quick SL & R:R Presets */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[#8B9A92]">
                  Quick Protection &amp; Risk:Reward Presets
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {presets.breakevenSl && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditSl(presets.breakevenSl!.toFixed(orderSpec.decimals));
                        setEditOrderError(null);
                      }}
                      className="px-2.5 py-1 rounded-[8px] bg-[#28D6B0]/15 hover:bg-[#28D6B0]/25 border border-[#28D6B0]/40 text-[11px] font-bold text-[#28D6B0] cursor-pointer"
                    >
                      Breakeven
                    </button>
                  )}
                  {presets.riskUsdPresets.map((rp) => (
                    <button
                      key={rp.riskUsd}
                      type="button"
                      onClick={() => {
                        setEditSl(rp.slPrice.toFixed(orderSpec.decimals));
                        setEditOrderError(null);
                      }}
                      className="px-2.5 py-1 rounded-[8px] bg-[#0C1411] hover:bg-[#14221D] border border-[#F01650]/35 text-[11px] font-bold text-rose-300 cursor-pointer"
                    >
                      SL -${rp.riskUsd}
                    </button>
                  ))}
                  {presets.rrPresets.map((rr) => (
                    <button
                      key={rr.ratio}
                      type="button"
                      onClick={() => {
                        if (!editSl.trim()) {
                          setEditSl(rr.slPrice.toFixed(orderSpec.decimals));
                        }
                        setEditTp(rr.tpPrice.toFixed(orderSpec.decimals));
                        setEditOrderError(null);
                      }}
                      className="px-2.5 py-1 rounded-[8px] bg-[#0C1411] hover:bg-[#14221D] border border-[#28D6B0]/35 text-[11px] font-bold text-[#28D6B0] cursor-pointer"
                    >
                      TP {rr.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-[#A5B5AE]">Stop Loss (SL)</label>
                    {editSl && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditSl('');
                          setEditOrderError(null);
                        }}
                        className="text-[10px] font-bold text-[#F01650] hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    data-testid="edit-sl-input"
                    type="number"
                    step="any"
                    value={editSl}
                    onChange={(e) => {
                      setEditSl(e.target.value);
                      setEditOrderError(null);
                    }}
                    placeholder="None (0)"
                    className="w-full px-3 py-2.5 rounded-[12px] bg-[#0C1411] border border-white/15 text-xs font-bold text-white tabular-nums"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-[#A5B5AE]">Take Profit (TP)</label>
                    {editTp && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditTp('');
                          setEditOrderError(null);
                        }}
                        className="text-[10px] font-bold text-[#F01650] hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    data-testid="edit-tp-input"
                    type="number"
                    step="any"
                    value={editTp}
                    onChange={(e) => {
                      setEditTp(e.target.value);
                      setEditOrderError(null);
                    }}
                    placeholder="None (0)"
                    className="w-full px-3 py-2.5 rounded-[12px] bg-[#0C1411] border border-white/15 text-xs font-bold text-white tabular-nums"
                  />
                </div>
              </div>

              {/* Live Risk / Reward Readout */}
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-[12px] bg-[#0C1411] border border-white/10 text-center">
                <div>
                  <div className="text-[10px] text-[#8B9A92]">
                    {isSlProfitLocked ? 'SL Profit Lock' : 'Est. SL Risk'}
                  </div>
                  <div
                    className={`text-xs font-extrabold tabular-nums ${
                      isSlProfitLocked ? 'text-[#28D6B0]' : 'text-[#F01650]'
                    }`}
                  >
                    {isSlProfitLocked
                      ? `+$${slProfitLockUsd.toFixed(2)}`
                      : preview.riskUsd > 0
                      ? `-$${preview.riskUsd.toFixed(2)}`
                      : 'OFF'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8B9A92]">R:R Ratio</div>
                  <div className="text-xs font-extrabold text-white tabular-nums">
                    {preview.rrRatio ? `1 : ${preview.rrRatio}` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8B9A92]">Est. TP Target</div>
                  <div className="text-xs font-extrabold text-[#28D6B0] tabular-nums">
                    {preview.rewardUsd > 0 ? `+$${preview.rewardUsd.toFixed(2)}` : 'OFF'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const res = modifyOrder(editingOrder.id, {
                      stopLoss: 0,
                      takeProfit: 0,
                    });
                    if (res.ok) {
                      setEditingOrder(null);
                      setEditOrderError(null);
                    } else if (res.error) {
                      setEditOrderError(res.error);
                    }
                  }}
                  className="px-3.5 py-2.5 rounded-[12px] bg-[#F01650]/15 hover:bg-[#F01650] border border-[#F01650]/40 text-red-300 hover:text-white font-bold text-xs cursor-pointer transition-colors"
                >
                  Remove Both SL &amp; TP
                </button>

                <button
                  type="button"
                  data-testid="save-sltp-btn"
                  onClick={() => {
                    const res = modifyOrder(editingOrder.id, {
                      stopLoss: editSl.trim() ? parseFloat(editSl) : 0,
                      takeProfit: editTp.trim() ? parseFloat(editTp) : 0,
                      entryPrice: editEntry.trim() ? parseFloat(editEntry) : undefined,
                    });
                    if (res.ok) {
                      setEditingOrder(null);
                      setEditOrderError(null);
                    } else if (res.error) {
                      setEditOrderError(res.error);
                    }
                  }}
                  className="px-5 py-2.5 rounded-[12px] apex-glow-btn text-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 10. ADVANCED ORDER TICKET MODAL */}
      {showAdvancedOrderTicket && (() => {
        const refEntry =
          advOrderType === 'MARKET'
            ? advSide === 'BUY'
              ? currentQuote.ask
              : currentQuote.bid
            : parseFloat(advEntryPrice) || (advSide === 'BUY' ? currentQuote.ask : currentQuote.bid);
        const advVol = parsedVolume > 0 ? parsedVolume : 0.01;
        const advPreview = validateAndComputeSlTpPreview({
          symbol,
          side: advSide,
          volume: advVol,
          referencePrice: refEntry,
          liveBid: currentQuote.bid,
          liveAsk: currentQuote.ask,
          stopLoss: advSl.trim() ? parseFloat(advSl) : 0,
          takeProfit: advTp.trim() ? parseFloat(advTp) : 0,
          isOpenPosition: advOrderType === 'MARKET',
          allowAutoClamp: false,
        });
        const advPresets = computeSlTpPresets({
          symbol,
          side: advSide,
          volume: advVol,
          entryPrice: refEntry,
          liveBid: currentQuote.bid,
          liveAsk: currentQuote.ask,
          currentSl: advSl.trim() ? parseFloat(advSl) : undefined,
          isOpenPosition: advOrderType === 'MARKET',
        });

        return (
          <div className="fixed inset-0 z-[60] bg-[#050807]/90 apex-backdrop-enter flex items-center justify-center p-3 sm:p-4">
            <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto custom-scrollbar bg-[#070C0A] border border-[#28D6B0]/35 rounded-[20px] p-4 sm:p-6 space-y-4 shadow-2xl apex-scale-in">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <h3 className="font-display text-sm sm:text-base font-bold text-white">
                    Advanced Order Ticket ({symbol})
                  </h3>
                  <div className="text-[11px] font-mono text-[#A5B5AE] tabular-nums">
                    Bid {currentQuote.bid.toFixed(spec.decimals)} / Ask {currentQuote.ask.toFixed(spec.decimals)} ·{' '}
                    {advVol.toFixed(2)} Lots
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdvancedOrderTicket(false);
                    setAdvOrderError(null);
                  }}
                  className="text-[#8B9A92] hover:text-white cursor-pointer p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {advOrderError && (
                <div className="p-2.5 rounded-[12px] bg-[#F01650]/15 border border-[#F01650]/45 text-xs font-semibold text-rose-200 leading-snug break-words">
                  {advOrderError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdvSide('BUY');
                    setAdvOrderError(null);
                  }}
                  className={`py-2.5 rounded-[12px] text-xs font-extrabold cursor-pointer ${
                    advSide === 'BUY' ? 'bg-[#00B87C] text-white' : 'bg-[#0C1411] text-[#8B9A92] border border-white/10'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdvSide('SELL');
                    setAdvOrderError(null);
                  }}
                  className={`py-2.5 rounded-[12px] text-xs font-extrabold cursor-pointer ${
                    advSide === 'SELL' ? 'bg-[#F01650] text-white' : 'bg-[#0C1411] text-[#8B9A92] border border-white/10'
                  }`}
                >
                  SELL
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(['MARKET', 'LIMIT', 'STOP'] as const).map((ot) => (
                  <button
                    key={ot}
                    type="button"
                    onClick={() => {
                      setAdvOrderType(ot);
                      setAdvOrderError(null);
                    }}
                    className={`py-2 rounded-[12px] text-xs font-bold cursor-pointer ${
                      advOrderType === ot
                        ? 'bg-[#101B17] text-[#28D6B0] border border-[#28D6B0]/45'
                        : 'bg-[#0C1411] text-[#8B9A92] border border-white/10'
                    }`}
                  >
                    {ot}
                  </button>
                ))}
              </div>

              {advOrderType !== 'MARKET' && (
                <div>
                  <label className="block text-xs font-medium text-[#A5B5AE] mb-1">
                    Trigger Entry Price
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={advEntryPrice}
                    onChange={(e) => {
                      setAdvEntryPrice(e.target.value);
                      setAdvOrderError(null);
                    }}
                    placeholder={String(advSide === 'BUY' ? currentQuote.ask : currentQuote.bid)}
                    className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#0C1411] border border-white/15 text-xs font-bold text-white tabular-nums"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {advPresets.riskUsdPresets.map((rp) => (
                  <button
                    key={rp.riskUsd}
                    type="button"
                    onClick={() => {
                      setAdvSl(rp.slPrice.toFixed(spec.decimals));
                      setAdvOrderError(null);
                    }}
                    className="px-2 py-1 rounded-[8px] bg-[#0C1411] border border-[#F01650]/35 text-[11px] font-bold text-rose-300 cursor-pointer"
                  >
                    SL -${rp.riskUsd}
                  </button>
                ))}
                {advPresets.rrPresets.map((rr) => (
                  <button
                    key={rr.ratio}
                    type="button"
                    onClick={() => {
                      if (!advSl.trim()) setAdvSl(rr.slPrice.toFixed(spec.decimals));
                      setAdvTp(rr.tpPrice.toFixed(spec.decimals));
                      setAdvOrderError(null);
                    }}
                    className="px-2 py-1 rounded-[8px] bg-[#0C1411] border border-[#28D6B0]/35 text-[11px] font-bold text-[#28D6B0] cursor-pointer"
                  >
                    TP {rr.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A5B5AE] mb-1">Stop Loss</label>
                  <input
                    type="number"
                    step="any"
                    value={advSl}
                    onChange={(e) => {
                      setAdvSl(e.target.value);
                      setAdvOrderError(null);
                    }}
                    placeholder="Optional"
                    className="w-full px-3 py-2.5 rounded-[12px] bg-[#0C1411] border border-white/15 text-xs font-bold text-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A5B5AE] mb-1">Take Profit</label>
                  <input
                    type="number"
                    step="any"
                    value={advTp}
                    onChange={(e) => {
                      setAdvTp(e.target.value);
                      setAdvOrderError(null);
                    }}
                    placeholder="Optional"
                    className="w-full px-3 py-2.5 rounded-[12px] bg-[#0C1411] border border-white/15 text-xs font-bold text-white tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-[12px] bg-[#0C1411] border border-white/10 text-center">
                <div>
                  <div className="text-[10px] text-[#8B9A92]">SL Risk</div>
                  <div className="text-xs font-extrabold text-[#F01650] tabular-nums">
                    {advPreview.riskUsd > 0 ? `-$${advPreview.riskUsd.toFixed(2)}` : 'OFF'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8B9A92]">R:R</div>
                  <div className="text-xs font-extrabold text-white tabular-nums">
                    {advPreview.rrRatio ? `1 : ${advPreview.rrRatio}` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8B9A92]">TP Target</div>
                  <div className="text-xs font-extrabold text-[#28D6B0] tabular-nums">
                    {advPreview.rewardUsd > 0 ? `+$${advPreview.rewardUsd.toFixed(2)}` : 'OFF'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAdvOrder}
                className={`w-full py-3 rounded-[14px] font-display font-extrabold text-xs cursor-pointer ${
                  advSide === 'BUY' ? 'bg-[#00B87C] text-white' : 'bg-[#F01650] text-white'
                }`}
              >
                Submit {advOrderType} {advSide} Order
              </button>
            </div>
          </div>
        );
      })()}

      {/* 11. PRICE ALERTS MANAGER MODAL */}
      {showAlertsModal && (
        <div className="fixed inset-0 z-50 bg-[#050807]/88 apex-backdrop-enter flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#070C0A] border border-[#28D6B0]/30 rounded-[22px] p-6 space-y-4 shadow-2xl apex-scale-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-display text-base font-bold text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#28D6B0]" />
                <span>Price Alerts ({symbol})</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAlertsModal(false)}
                className="text-[#8B9A92] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(['ABOVE', 'BELOW'] as const).map((cond) => (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => setNewAlertCondition(cond)}
                    className={`py-2 rounded-[12px] text-xs font-bold cursor-pointer ${
                      newAlertCondition === cond
                        ? 'bg-[#28D6B0] text-[#04100C]'
                        : 'bg-[#0C1411] text-[#8B9A92] border border-white/10'
                    }`}
                  >
                    Price Crosses {cond}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  value={newAlertPrice}
                  onChange={(e) => setNewAlertPrice(e.target.value)}
                  placeholder={currentQuote.bid.toFixed(spec.decimals)}
                  className="flex-1 px-3.5 py-2.5 rounded-[12px] bg-[#0C1411] border border-white/15 text-xs font-bold text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const tp = parseFloat(newAlertPrice);
                    if (!tp || tp <= 0) return;
                    setPriceAlerts((prev) => [
                      {
                        id: `alert-${Date.now()}`,
                        symbol,
                        condition: newAlertCondition,
                        targetPrice: tp,
                        enabled: true,
                        triggered: false,
                        createdAt: new Date().toLocaleTimeString(),
                      },
                      ...prev,
                    ]);
                    pushNotification(
                      'Price Alert Created',
                      `Alert set for ${symbol} ${newAlertCondition} ${tp.toFixed(spec.decimals)}.`,
                      'success'
                    );
                  }}
                  className="px-4 py-2.5 rounded-[12px] apex-glow-btn text-xs cursor-pointer"
                >
                  + Add Alert
                </button>
              </div>
            </div>

            <div className="max-h-52 overflow-y-auto space-y-2 custom-scrollbar pt-2 border-t border-white/10">
              {priceAlerts.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#8B9A92]">
                  No price alerts configured yet.
                </div>
              ) : (
                priceAlerts.map((al) => (
                  <div
                    key={al.id}
                    className="p-3 rounded-[14px] bg-[#0C1411] border border-white/10 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-white">
                        {al.symbol} {al.condition} {al.targetPrice}
                      </div>
                      <div className="text-[10px] text-[#8B9A92]">
                        {al.triggered
                          ? `Triggered at ${al.triggeredAt}`
                          : al.enabled
                          ? 'Active • Monitoring Live Feed'
                          : 'Paused'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!al.triggered && (
                        <button
                          type="button"
                          onClick={() =>
                            setPriceAlerts((prev) =>
                              prev.map((item) =>
                                item.id === al.id ? { ...item, enabled: !item.enabled } : item
                              )
                            )
                          }
                          className={`px-2.5 py-1 rounded-[8px] text-[10px] font-bold cursor-pointer ${
                            al.enabled ? 'bg-[#28D6B0]/20 text-[#28D6B0]' : 'bg-white/10 text-[#8B9A92]'
                          }`}
                        >
                          {al.enabled ? 'ON' : 'OFF'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setPriceAlerts((prev) => prev.filter((item) => item.id !== al.id))
                        }
                        className="px-2 py-1 rounded-[8px] bg-[#F01650]/20 text-[#F01650] font-bold cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 12. ACTIVE ACCOUNT & CHALLENGE RULES GOVERNANCE MODAL */}
      {showAccountRulesModal && (
        <div
          data-testid="terminal-account-rules-modal"
          onClick={() => setShowAccountRulesModal(false)}
          className="fixed inset-0 z-50 bg-[#050807]/90 apex-backdrop-enter flex items-center justify-center p-3 sm:p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-[#070C0A] border border-[#28D6B0]/30 rounded-[22px] p-5 sm:p-6 space-y-4 shadow-2xl max-h-[88vh] overflow-y-auto custom-scrollbar apex-scale-in"
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3.5">
              <div>
                <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#28D6B0]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{accountRulesSummary.programLabel}</span>
                </div>
                <h3 className="font-display text-base sm:text-lg font-extrabold text-white mt-0.5">
                  Account #{effectiveAccount.accountNumber} · ${effectiveAccount.startingBalance.toLocaleString()}
                </h3>
                <p className="text-xs text-[#8B9A92] mt-0.5">
                  {accountRulesSummary.currentPhaseLabel} · {accountRulesSummary.phaseTargetsText}
                </p>
              </div>
              <button
                type="button"
                data-testid="close-account-rules-modal"
                onClick={() => setShowAccountRulesModal(false)}
                className="p-1.5 rounded-[10px] bg-[#0C1411] text-[#8B9A92] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Risk Progress Bars */}
            <div className="space-y-3">
              {/* Daily Drawdown */}
              <div className="p-3.5 rounded-[14px] bg-[#0C1411] border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#F01650]">
                    Daily Drawdown Limit ({accountRulesSummary.dailyDrawdownPct}%)
                  </span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    ${riskMetrics.dailyDropUsd.toFixed(2)} / ${accountRulesSummary.dailyDrawdownLimitUsd.toFixed(2)} (
                    {riskMetrics.dailyDrawdownUsedPct.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-[#14221D] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#F01650] h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, riskMetrics.dailyDrawdownUsedPct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#8B9A92] tabular-nums">
                  <span>Daily Breach Equity Floor:</span>
                  <span className="font-mono font-semibold text-rose-300">
                    ${accountRulesSummary.dailyBreachEquityFloorUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Maximum Overall Drawdown */}
              <div className="p-3.5 rounded-[14px] bg-[#0C1411] border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#F01650]">
                    Maximum Static Drawdown ({accountRulesSummary.maxDrawdownPct}%)
                  </span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    ${riskMetrics.overallDropUsd.toFixed(2)} / ${accountRulesSummary.maxDrawdownLimitUsd.toFixed(2)} (
                    {riskMetrics.maxDrawdownUsedPct.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-[#14221D] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#F01650] h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, riskMetrics.maxDrawdownUsedPct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#8B9A92] tabular-nums">
                  <span>Static Account Breach Floor:</span>
                  <span className="font-mono font-semibold text-rose-300">
                    ${accountRulesSummary.maxBreachEquityFloorUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Profit Target */}
              <div className="p-3.5 rounded-[14px] bg-[#0C1411] border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#00B87C]">
                    {isInstantAccount
                      ? 'Profit Target (Instant Funded)'
                      : `Phase Profit Target (+${accountRulesSummary.activeTargetPct}%)`}
                  </span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {isInstantAccount
                      ? 'No Target (Direct Funded)'
                      : `$${riskMetrics.netGainUsd.toFixed(2)} / $${targetLimitUsd.toFixed(2)} (${riskMetrics.profitProgressPct.toFixed(1)}%)`}
                  </span>
                </div>
                <div className="w-full bg-[#14221D] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#00B87C] h-2 rounded-full transition-all"
                    style={{
                      width: `${isInstantAccount ? 100 : Math.min(100, Math.max(0, riskMetrics.profitProgressPct))}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#8B9A92]">
                  <span>Progression Track:</span>
                  <span className="font-mono font-semibold text-[#28D6B0]">
                    {accountRulesSummary.phaseTargetsText}
                  </span>
                </div>
              </div>
            </div>

            {/* Key Account Rule Specifications Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-[12px] bg-[#0C1411] border border-white/8">
                <div className="text-[10px] text-[#8B9A92] uppercase font-mono">Leverage</div>
                <div className="font-mono font-extrabold text-white mt-0.5">
                  {accountRulesSummary.leverageText}
                </div>
              </div>
              <div className="p-3 rounded-[12px] bg-[#0C1411] border border-white/8">
                <div className="text-[10px] text-[#8B9A92] uppercase font-mono">Profit Split</div>
                <div className="font-mono font-extrabold text-[#28D6B0] mt-0.5">
                  {accountRulesSummary.profitSplitPct}% Trader
                </div>
              </div>
              <div className="p-3 rounded-[12px] bg-[#0C1411] border border-white/8">
                <div className="text-[10px] text-[#8B9A92] uppercase font-mono">Trading Days</div>
                <div className="font-mono font-extrabold text-white mt-0.5">
                  {effectiveAccount.tradingDaysCount} / {accountRulesSummary.payoutMinTradingDays} Days
                </div>
              </div>
              <div className="p-3 rounded-[12px] bg-[#0C1411] border border-white/8 sm:col-span-2">
                <div className="text-[10px] text-[#8B9A92] uppercase font-mono">Consistency Rule</div>
                <div className="font-mono font-bold text-white mt-0.5">
                  {accountRulesSummary.consistencyRuleText}
                </div>
              </div>
              <div className="p-3 rounded-[12px] bg-[#0C1411] border border-white/8">
                <div className="text-[10px] text-[#8B9A92] uppercase font-mono">Time Limit</div>
                <div className="font-mono font-bold text-[#28D6B0] mt-0.5">Unlimited</div>
              </div>
            </div>

            <div className="p-3 rounded-[12px] bg-[#09120F] border border-[#28D6B0]/20 text-[11px] text-[#A5B5AE] leading-relaxed">
              <strong className="text-[#28D6B0]">Chart SL &amp; TP Tip:</strong> Once a position is open, click{' '}
              <span className="text-rose-300 font-mono font-bold">+SL</span> or{' '}
              <span className="text-emerald-300 font-mono font-bold">+TP</span> directly on the chart position badge, drag the{' '}
              <span className="font-mono font-bold text-white">SL / TP</span> handles vertically on the chart, or right-click any price level on the chart to set Stop Loss and Take Profit.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
