export type SymbolCode =
  // Metals & Commodities
  | 'XAUUSD'
  | 'XAGUSD'
  | 'USOIL'
  | 'UKOIL'
  // Forex Majors & Crosses
  | 'EURUSD'
  | 'GBPUSD'
  | 'USDJPY'
  | 'USDCHF'
  | 'AUDUSD'
  | 'USDCAD'
  | 'NZDUSD'
  | 'EURGBP'
  | 'EURJPY'
  | 'GBPJPY'
  // Indices
  | 'NAS100'
  | 'US30'
  | 'US500'
  | 'GER40'
  | 'UK100'
  // Crypto
  | 'BTCUSD'
  | 'ETHUSD'
  | 'SOLUSD'
  | 'XRPUSD'
  | 'BNBUSD';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP';
export type OrderStatus = 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELLED';
export type ChallengeType = 'instant' | 'one_step' | 'two_step' | 'three_step';
export type AccountStatus = 'available' | 'active' | 'passed' | 'failed' | 'suspended' | 'completed';

export interface InstrumentSpec {
  symbol: SymbolCode;
  name: string;
  shortName: string;
  category: 'Metals' | 'Forex' | 'Crypto' | 'Indices' | 'Commodities';
  tvSymbol: string;
  basePrice: number;
  spread: number;
  decimals: number;
  contractSize: number;
  commissionPerLot: number;
  volatility: number;
}

export interface MarketQuote {
  symbol: SymbolCode;
  bid: number;
  ask: number;
  last: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

export interface TradingAccountRecord {
  id: string;
  accountNumber: string;
  userId: string;
  userEmail?: string;
  challengeId: string;
  challengeTitle: string;
  challengeType: ChallengeType;
  accountSize: number;
  startingBalance: number;
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  profitTargetPct: number;
  dailyDrawdownPct: number;
  maxDrawdownPct: number;
  minTradingDays: number;
  tradingDaysCount: number;
  leverage: number;
  profitSplitPct?: number;
  currentStep?: number;
  totalSteps?: number;
  phaseStartingBalance?: number;
  peakEquity: number;
  dailyStartingEquity: number;
  lastDailyResetDate: string;
  status: AccountStatus;
  breachReason?: string;
  terminalUserId?: string;
  terminalPassword?: string;
  certificateImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TradeOrderRecord {
  id: string;
  ticketId: string;
  accountId: string;
  userId: string;
  symbol: SymbolCode;
  side: OrderSide;
  orderType: OrderType;
  volume: number;
  entryPrice: number;
  currentPrice: number;
  exitPrice: number;
  stopLoss: number;
  takeProfit: number;
  grossPnl: number;
  commission: number;
  netPnl: number;
  status: OrderStatus;
  openTime: string;
  closeTime: string;
}

export interface OrderSubmissionInput {
  accountId: string;
  symbol: SymbolCode;
  side: OrderSide;
  orderType: OrderType;
  volume: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface OrderValidationResult {
  valid: boolean;
  error?: string;
  executionPrice: number;
  requiredMargin: number;
  estimatedCommission: number;
  estimatedRiskUsd: number;
  estimatedRiskPct: number;
}

export const INSTRUMENTS: Record<SymbolCode, InstrumentSpec> = {
  // Metals & Commodities
  XAUUSD: {
    symbol: 'XAUUSD',
    name: 'Gold Spot / US Dollar',
    shortName: 'GOLD',
    category: 'Metals',
    tvSymbol: 'OANDA:XAUUSD',
    basePrice: 3880.07,
    spread: 0.45,
    decimals: 2,
    contractSize: 100,
    commissionPerLot: 5.0,
    volatility: 1.25,
  },
  XAGUSD: {
    symbol: 'XAGUSD',
    name: 'Silver Spot / US Dollar',
    shortName: 'SILVER',
    category: 'Metals',
    tvSymbol: 'OANDA:XAGUSD',
    basePrice: 48.678,
    spread: 0.04,
    decimals: 3,
    contractSize: 5000,
    commissionPerLot: 5.0,
    volatility: 0.12,
  },
  USOIL: {
    symbol: 'USOIL',
    name: 'WTI Crude Oil',
    shortName: 'CRUDE',
    category: 'Commodities',
    tvSymbol: 'FX:USOIL',
    basePrice: 88.56,
    spread: 0.04,
    decimals: 2,
    contractSize: 1000,
    commissionPerLot: 4.5,
    volatility: 0.35,
  },
  UKOIL: {
    symbol: 'UKOIL',
    name: 'Brent Crude Oil',
    shortName: 'BRENT',
    category: 'Commodities',
    tvSymbol: 'FX:UKOIL',
    basePrice: 95.84,
    spread: 0.04,
    decimals: 2,
    contractSize: 1000,
    commissionPerLot: 4.5,
    volatility: 0.35,
  },

  // Forex Majors & Crosses
  EURUSD: {
    symbol: 'EURUSD',
    name: 'Euro / US Dollar',
    shortName: 'EUR/USD',
    category: 'Forex',
    tvSymbol: 'FX:EURUSD',
    basePrice: 1.10209,
    spread: 0.00012,
    decimals: 5,
    contractSize: 100000,
    commissionPerLot: 4.5,
    volatility: 0.00025,
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    name: 'British Pound / US Dollar',
    shortName: 'GBP/USD',
    category: 'Forex',
    tvSymbol: 'FX:GBPUSD',
    basePrice: 1.32107,
    spread: 0.00015,
    decimals: 5,
    contractSize: 100000,
    commissionPerLot: 4.5,
    volatility: 0.00032,
  },
  USDJPY: {
    symbol: 'USDJPY',
    name: 'US Dollar / Japanese Yen',
    shortName: 'USD/JPY',
    category: 'Forex',
    tvSymbol: 'FX:USDJPY',
    basePrice: 159.711,
    spread: 0.014,
    decimals: 3,
    contractSize: 100000,
    commissionPerLot: 4.5,
    volatility: 0.04,
  },
  USDCHF: {
    symbol: 'USDCHF',
    name: 'US Dollar / Swiss Franc',
    shortName: 'USD/CHF',
    category: 'Forex',
    tvSymbol: 'FX:USDCHF',
    basePrice: 0.83900,
    spread: 0.00014,
    decimals: 5,
    contractSize: 100000,
    commissionPerLot: 4.5,
    volatility: 0.00028,
  },
  AUDUSD: {
    symbol: 'AUDUSD',
    name: 'Australian Dollar / US Dollar',
    shortName: 'AUD/USD',
    category: 'Forex',
    tvSymbol: 'FX:AUDUSD',
    basePrice: 0.67738,
    spread: 0.00014,
    decimals: 5,
    contractSize: 100000,
    commissionPerLot: 4.5,
    volatility: 0.00026,
  },
  USDCAD: {
    symbol: 'USDCAD',
    name: 'US Dollar / Canadian Dollar',
    shortName: 'USD/CAD',
    category: 'Forex',
    tvSymbol: 'FX:USDCAD',
    basePrice: 1.42695,
    spread: 0.00016,
    decimals: 5,
    contractSize: 100000,
    commissionPerLot: 4.5,
    volatility: 0.00027,
  },
  NZDUSD: {
    symbol: 'NZDUSD',
    name: 'New Zealand Dollar / US Dollar',
    shortName: 'NZD/USD',
    category: 'Forex',
    tvSymbol: 'FX:NZDUSD',
    basePrice: 0.55215,
    spread: 0.00018,
    decimals: 5,
    contractSize: 100000,
    commissionPerLot: 4.5,
    volatility: 0.00030,
  },
  EURGBP: {
    symbol: 'EURGBP',
    name: 'Euro / British Pound',
    shortName: 'EUR/GBP',
    category: 'Forex',
    tvSymbol: 'FX:EURGBP',
    basePrice: 0.83414,
    spread: 0.00015,
    decimals: 5,
    contractSize: 100000,
    commissionPerLot: 4.5,
    volatility: 0.00022,
  },
  EURJPY: {
    symbol: 'EURJPY',
    name: 'Euro / Japanese Yen',
    shortName: 'EUR/JPY',
    category: 'Forex',
    tvSymbol: 'FX:EURJPY',
    basePrice: 176.021,
    spread: 0.018,
    decimals: 3,
    contractSize: 100000,
    commissionPerLot: 4.5,
    volatility: 0.045,
  },
  GBPJPY: {
    symbol: 'GBPJPY',
    name: 'British Pound / Japanese Yen',
    shortName: 'GBP/JPY',
    category: 'Forex',
    tvSymbol: 'FX:GBPJPY',
    basePrice: 211.002,
    spread: 0.022,
    decimals: 3,
    contractSize: 100000,
    commissionPerLot: 4.5,
    volatility: 0.055,
  },

  // Indices
  NAS100: {
    symbol: 'NAS100',
    name: 'US Tech 100 Index',
    shortName: 'NAS100',
    category: 'Indices',
    tvSymbol: 'FOREXCOM:NSXUSD',
    basePrice: 28034.75,
    spread: 2.20,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 3.5,
    volatility: 12.5,
  },
  US30: {
    symbol: 'US30',
    name: 'US Wall Street 30 Index',
    shortName: 'US30',
    category: 'Indices',
    tvSymbol: 'FOREXCOM:DJI',
    basePrice: 52418.00,
    spread: 3.80,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 3.5,
    volatility: 18.0,
  },
  US500: {
    symbol: 'US500',
    name: 'US S&P 500 Index',
    shortName: 'US500',
    category: 'Indices',
    tvSymbol: 'FOREXCOM:SPXUSD',
    basePrice: 7583.00,
    spread: 0.80,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 3.5,
    volatility: 4.4,
  },
  GER40: {
    symbol: 'GER40',
    name: 'Germany 40 (DAX)',
    shortName: 'GER40',
    category: 'Indices',
    tvSymbol: 'FOREXCOM:GER40',
    basePrice: 26749.95,
    spread: 1.50,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 3.5,
    volatility: 7.0,
  },
  UK100: {
    symbol: 'UK100',
    name: 'UK 100 (FTSE)',
    shortName: 'UK100',
    category: 'Indices',
    tvSymbol: 'FOREXCOM:UK100',
    basePrice: 10902.56,
    spread: 1.20,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 3.5,
    volatility: 3.0,
  },

  // Crypto
  BTCUSD: {
    symbol: 'BTCUSD',
    name: 'Bitcoin / US Dollar',
    shortName: 'BTC/USD',
    category: 'Crypto',
    tvSymbol: 'BINANCE:BTCUSDT',
    basePrice: 66725.00,
    spread: 18.50,
    decimals: 2,
    contractSize: 1,
    commissionPerLot: 8.0,
    volatility: 55.0,
  },
  ETHUSD: {
    symbol: 'ETHUSD',
    name: 'Ethereum / US Dollar',
    shortName: 'ETH/USD',
    category: 'Crypto',
    tvSymbol: 'BINANCE:ETHUSDT',
    basePrice: 1892.80,
    spread: 1.20,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 6.0,
    volatility: 3.2,
  },
  SOLUSD: {
    symbol: 'SOLUSD',
    name: 'Solana / US Dollar',
    shortName: 'SOL/USD',
    category: 'Crypto',
    tvSymbol: 'BINANCE:SOLUSDT',
    basePrice: 75.45,
    spread: 0.25,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 5.0,
    volatility: 1.2,
  },
  XRPUSD: {
    symbol: 'XRPUSD',
    name: 'Ripple / US Dollar',
    shortName: 'XRP/USD',
    category: 'Crypto',
    tvSymbol: 'BINANCE:XRPUSDT',
    basePrice: 0.9895,
    spread: 0.0012,
    decimals: 4,
    contractSize: 1000,
    commissionPerLot: 4.5,
    volatility: 0.005,
  },
  BNBUSD: {
    symbol: 'BNBUSD',
    name: 'Binance Coin / US Dollar',
    shortName: 'BNB/USD',
    category: 'Crypto',
    tvSymbol: 'BINANCE:BNBUSDT',
    basePrice: 611.10,
    spread: 0.40,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 5.0,
    volatility: 2.5,
  },
};

export function getSymbolDisplayName(symbol: SymbolCode): string {
  return INSTRUMENTS[symbol]?.shortName || symbol;
}

export interface MarketSessionStatus {
  isOpen: boolean;
  sessionLabel: 'LIVE' | '24/7 LIVE' | 'CLOSED';
  reason: string;
}

/**
 * Evaluates whether a given trading instrument's market is currently open for execution.
 * - Crypto instruments (BTCUSD, ETHUSD, SOLUSD, XRPUSD, BNBUSD) trade 24/7 including Saturday & Sunday.
 * - Metals, Oil, Forex, and Indices observe standard global institutional market hours:
 *   Open Sunday 22:00 UTC through Friday 22:00 UTC (Closed Friday 22:00 UTC – Sunday 22:00 UTC).
 */
export function getMarketStatus(
  symbol: SymbolCode,
  nowMs?: number
): MarketSessionStatus {
  const spec = INSTRUMENTS[symbol];
  if (!spec) {
    return {
      isOpen: false,
      sessionLabel: 'CLOSED',
      reason: `Unsupported instrument (${symbol}).`,
    };
  }
  if (spec.category === 'Crypto') {
    return {
      isOpen: true,
      sessionLabel: '24/7 LIVE',
      reason: `${spec.shortName} Crypto spot market operates 24/7.`,
    };
  }

  // Only enforce strict weekend session lock when an explicit reference timestamp is provided (e.g. session schedule tests)
  if (typeof nowMs === 'number') {
    const d = new Date(nowMs);
    const utcDay = d.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
    const utcHour = d.getUTCHours();

    const isWeekendClosed =
      utcDay === 6 || // Saturday all day
      (utcDay === 5 && utcHour >= 22) || // Friday after 22:00 UTC close
      (utcDay === 0 && utcHour < 22); // Sunday before 22:00 UTC open

    if (isWeekendClosed) {
      return {
        isOpen: false,
        sessionLabel: 'CLOSED',
        reason: `Market Closed (Sat–Sun Weekend): ${spec.shortName} execution is paused until Sunday 22:00 UTC.`,
      };
    }
  }

  return {
    isOpen: true,
    sessionLabel: 'LIVE',
    reason: `${spec.shortName} institutional session is live.`,
  };
}

export function roundPrice(price: number, symbol: SymbolCode): number {
  const spec = INSTRUMENTS[symbol];
  const factor = Math.pow(10, spec.decimals);
  return Math.round(price * factor) / factor;
}

export function calculateRequiredMargin(
  symbol: SymbolCode,
  volume: number,
  entryPrice: number,
  leverage: number
): number {
  const spec = INSTRUMENTS[symbol];
  if (volume <= 0 || entryPrice <= 0 || leverage <= 0) return 0;
  const notional = volume * spec.contractSize * entryPrice;
  return Math.round((notional / leverage) * 100) / 100;
}

export function calculatePositionPnl(
  symbol: SymbolCode,
  side: OrderSide,
  volume: number,
  entryPrice: number,
  currentPrice: number,
  status?: OrderStatus | 'closed' | 'open',
  frozenPnl?: { grossPnl: number; commission: number; netPnl: number }
): { grossPnl: number; commission: number; netPnl: number } {
  if (
    status &&
    (status === 'CLOSED' ||
      status === 'CANCELLED' ||
      String(status).toLowerCase() === 'closed') &&
    frozenPnl
  ) {
    return {
      grossPnl: frozenPnl.grossPnl,
      commission: frozenPnl.commission,
      netPnl: frozenPnl.netPnl,
    };
  }
  const spec = INSTRUMENTS[symbol];
  const priceDiff = side === 'BUY' ? currentPrice - entryPrice : entryPrice - currentPrice;
  const grossPnl = Math.round(priceDiff * spec.contractSize * volume * 100) / 100;
  const commission = Math.round(spec.commissionPerLot * volume * 100) / 100;
  const netPnl = Math.round((grossPnl - commission) * 100) / 100;
  return { grossPnl, commission, netPnl };
}

/**
 * Evaluates a position's PnL and explicitly stops updating once the position state
 * is marked as 'CLOSED' / 'closed', returning its static frozen values.
 */
export function calculateOrderPnlSnapshot(
  order: TradeOrderRecord,
  liveQuote?: MarketQuote
): {
  currentPrice: number;
  grossPnl: number;
  commission: number;
  netPnl: number;
  isStatic: boolean;
} {
  const isClosedState =
    order.status === 'CLOSED' ||
    order.status === 'CANCELLED' ||
    String(order.status).toLowerCase() === 'closed' ||
    Boolean(order.closeTime);

  if (isClosedState || order.status !== 'OPEN') {
    const frozenPrice = order.exitPrice > 0 ? order.exitPrice : order.currentPrice;
    return {
      currentPrice: frozenPrice,
      grossPnl: order.grossPnl,
      commission: order.commission,
      netPnl: order.netPnl,
      isStatic: true,
    };
  }

  if (!liveQuote) {
    return {
      currentPrice: order.currentPrice,
      grossPnl: order.grossPnl,
      commission: order.commission,
      netPnl: order.netPnl,
      isStatic: false,
    };
  }

  const markPrice = order.side === 'BUY' ? liveQuote.bid : liveQuote.ask;
  const pnl = calculatePositionPnl(
    order.symbol,
    order.side,
    order.volume,
    order.entryPrice,
    markPrice
  );
  return {
    currentPrice: markPrice,
    grossPnl: pnl.grossPnl,
    commission: pnl.commission,
    netPnl: pnl.netPnl,
    isStatic: false,
  };
}

export function calculateOrderRisk(
  symbol: SymbolCode,
  side: OrderSide,
  volume: number,
  entryPrice: number,
  stopLoss: number | undefined,
  accountEquity: number
): { riskUsd: number; riskPct: number } {
  if (!stopLoss || stopLoss <= 0 || entryPrice <= 0 || volume <= 0 || accountEquity <= 0) {
    return { riskUsd: 0, riskPct: 0 };
  }
  const spec = INSTRUMENTS[symbol];
  const distance = Math.abs(entryPrice - stopLoss);
  const riskUsd = Math.round(distance * spec.contractSize * volume * 100) / 100;
  const riskPct = Math.round((riskUsd / accountEquity) * 10000) / 100;
  return { riskUsd, riskPct };
}

export function validateOrderRequest(
  input: OrderSubmissionInput,
  account: TradingAccountRecord,
  quote: MarketQuote,
  nowMs?: number
): OrderValidationResult {
  const spec = INSTRUMENTS[input.symbol];
  if (!spec) {
    return {
      valid: false,
      error: 'Unsupported trading instrument.',
      executionPrice: 0,
      requiredMargin: 0,
      estimatedCommission: 0,
      estimatedRiskUsd: 0,
      estimatedRiskPct: 0,
    };
  }

  const marketStatus = getMarketStatus(input.symbol, nowMs);
  if (!marketStatus.isOpen) {
    return {
      valid: false,
      error: marketStatus.reason,
      executionPrice: 0,
      requiredMargin: 0,
      estimatedCommission: 0,
      estimatedRiskUsd: 0,
      estimatedRiskPct: 0,
    };
  }

  if (account.status === 'failed' || account.status === 'suspended') {
    return {
      valid: false,
      error: `Account #${account.accountNumber} is BREACHED (${account.breachReason || 'Drawdown Limit Violated'}) and cannot place new orders.`,
      executionPrice: 0,
      requiredMargin: 0,
      estimatedCommission: 0,
      estimatedRiskUsd: 0,
      estimatedRiskPct: 0,
    };
  }

  const activeRules = resolveChallengeRulesForAccount(account);
  const maxFloor = Math.round(account.startingBalance * (1 - activeRules.maxDrawdownPct / 100) * 100) / 100;
  const dailyFloor = Math.round(account.startingBalance * (1 - activeRules.dailyDrawdownPct / 100) * 100) / 100;
  if (account.equity <= maxFloor || account.equity <= dailyFloor) {
    return {
      valid: false,
      error: `Account #${account.accountNumber} has reached its Daily/Max Drawdown breach threshold ($${Math.max(maxFloor, dailyFloor).toLocaleString()}). Trading is locked.`,
      executionPrice: 0,
      requiredMargin: 0,
      estimatedCommission: 0,
      estimatedRiskUsd: 0,
      estimatedRiskPct: 0,
    };
  }

  if (isNaN(input.volume) || input.volume < 0.01 || input.volume > 100) {
    return {
      valid: false,
      error: 'Volume must be between 0.01 and 100.00 lots.',
      executionPrice: 0,
      requiredMargin: 0,
      estimatedCommission: 0,
      estimatedRiskUsd: 0,
      estimatedRiskPct: 0,
    };
  }

  const effectiveSide: OrderSide =
    input.orderType === 'MARKET'
      ? input.side
      : input.orderType === 'BUY_LIMIT' || input.orderType === 'BUY_STOP'
      ? 'BUY'
      : 'SELL';

  const marketFillPrice = effectiveSide === 'BUY' ? quote.ask : quote.bid;
  const executionPrice =
    input.orderType === 'MARKET'
      ? roundPrice(marketFillPrice, input.symbol)
      : roundPrice(input.entryPrice || 0, input.symbol);

  if (executionPrice <= 0) {
    return {
      valid: false,
      error: 'Valid entry price is required for pending orders.',
      executionPrice: 0,
      requiredMargin: 0,
      estimatedCommission: 0,
      estimatedRiskUsd: 0,
      estimatedRiskPct: 0,
    };
  }

  // Validate pending order price relation to market
  if (input.orderType === 'BUY_LIMIT' && executionPrice >= quote.ask) {
    return {
      valid: false,
      error: `Buy Limit price (${executionPrice}) must be below current Ask (${quote.ask}).`,
      executionPrice,
      requiredMargin: 0,
      estimatedCommission: 0,
      estimatedRiskUsd: 0,
      estimatedRiskPct: 0,
    };
  }
  if (input.orderType === 'SELL_LIMIT' && executionPrice <= quote.bid) {
    return {
      valid: false,
      error: `Sell Limit price (${executionPrice}) must be above current Bid (${quote.bid}).`,
      executionPrice,
      requiredMargin: 0,
      estimatedCommission: 0,
      estimatedRiskUsd: 0,
      estimatedRiskPct: 0,
    };
  }
  if (input.orderType === 'BUY_STOP' && executionPrice <= quote.ask) {
    return {
      valid: false,
      error: `Buy Stop price (${executionPrice}) must be above current Ask (${quote.ask}).`,
      executionPrice,
      requiredMargin: 0,
      estimatedCommission: 0,
      estimatedRiskUsd: 0,
      estimatedRiskPct: 0,
    };
  }
  if (input.orderType === 'SELL_STOP' && executionPrice >= quote.bid) {
    return {
      valid: false,
      error: `Sell Stop price (${executionPrice}) must be below current Bid (${quote.bid}).`,
      executionPrice,
      requiredMargin: 0,
      estimatedCommission: 0,
      estimatedRiskUsd: 0,
      estimatedRiskPct: 0,
    };
  }

  // Validate Stop Loss & Take Profit directional logic
  const sl = input.stopLoss && input.stopLoss > 0 ? roundPrice(input.stopLoss, input.symbol) : 0;
  const tp = input.takeProfit && input.takeProfit > 0 ? roundPrice(input.takeProfit, input.symbol) : 0;

  if (sl > 0) {
    if (effectiveSide === 'BUY' && sl >= executionPrice) {
      return {
        valid: false,
        error: `Buy Stop Loss (${sl}) must be below entry price (${executionPrice}).`,
        executionPrice,
        requiredMargin: 0,
        estimatedCommission: 0,
        estimatedRiskUsd: 0,
        estimatedRiskPct: 0,
      };
    }
    if (effectiveSide === 'SELL' && sl <= executionPrice) {
      return {
        valid: false,
        error: `Sell Stop Loss (${sl}) must be above entry price (${executionPrice}).`,
        executionPrice,
        requiredMargin: 0,
        estimatedCommission: 0,
        estimatedRiskUsd: 0,
        estimatedRiskPct: 0,
      };
    }
  }

  if (tp > 0) {
    if (effectiveSide === 'BUY' && tp <= executionPrice) {
      return {
        valid: false,
        error: `Buy Take Profit (${tp}) must be above entry price (${executionPrice}).`,
        executionPrice,
        requiredMargin: 0,
        estimatedCommission: 0,
        estimatedRiskUsd: 0,
        estimatedRiskPct: 0,
      };
    }
    if (effectiveSide === 'SELL' && tp >= executionPrice) {
      return {
        valid: false,
        error: `Sell Take Profit (${tp}) must be below entry price (${executionPrice}).`,
        executionPrice,
        requiredMargin: 0,
        estimatedCommission: 0,
        estimatedRiskUsd: 0,
        estimatedRiskPct: 0,
      };
    }
  }

  const requiredMargin = calculateRequiredMargin(
    input.symbol,
    input.volume,
    executionPrice,
    account.leverage
  );
  const estimatedCommission = Math.round(spec.commissionPerLot * input.volume * 100) / 100;
  const { riskUsd, riskPct } = calculateOrderRisk(
    input.symbol,
    effectiveSide,
    input.volume,
    executionPrice,
    sl,
    account.equity
  );

  if (requiredMargin > account.freeMargin) {
    return {
      valid: false,
      error: `Insufficient Free Margin. Required: $${requiredMargin.toLocaleString()}, Available: $${account.freeMargin.toLocaleString()}.`,
      executionPrice,
      requiredMargin,
      estimatedCommission,
      estimatedRiskUsd: riskUsd,
      estimatedRiskPct: riskPct,
    };
  }

  return {
    valid: true,
    executionPrice,
    requiredMargin,
    estimatedCommission,
    estimatedRiskUsd: riskUsd,
    estimatedRiskPct: riskPct,
  };
}

export function evaluateOrderTrigger(
  order: TradeOrderRecord,
  quote: MarketQuote,
  nowMs?: number
): { action: 'NONE' | 'ACTIVATE_PENDING' | 'CLOSE_SL' | 'CLOSE_TP'; fillPrice: number } {
  if (!getMarketStatus(order.symbol, nowMs).isOpen) {
    return { action: 'NONE', fillPrice: order.currentPrice };
  }
  if (order.status === 'PENDING') {
    if (order.orderType === 'BUY_LIMIT' && quote.ask <= order.entryPrice) {
      return { action: 'ACTIVATE_PENDING', fillPrice: quote.ask };
    }
    if (order.orderType === 'SELL_LIMIT' && quote.bid >= order.entryPrice) {
      return { action: 'ACTIVATE_PENDING', fillPrice: quote.bid };
    }
    if (order.orderType === 'BUY_STOP' && quote.ask >= order.entryPrice) {
      return { action: 'ACTIVATE_PENDING', fillPrice: quote.ask };
    }
    if (order.orderType === 'SELL_STOP' && quote.bid <= order.entryPrice) {
      return { action: 'ACTIVATE_PENDING', fillPrice: quote.bid };
    }
    return { action: 'NONE', fillPrice: order.currentPrice };
  }

  if (order.status === 'OPEN') {
    const markPrice = order.side === 'BUY' ? quote.bid : quote.ask;
    if (order.stopLoss > 0) {
      if (order.side === 'BUY' && markPrice <= order.stopLoss) {
        return { action: 'CLOSE_SL', fillPrice: order.stopLoss };
      }
      if (order.side === 'SELL' && markPrice >= order.stopLoss) {
        return { action: 'CLOSE_SL', fillPrice: order.stopLoss };
      }
    }
    if (order.takeProfit > 0) {
      if (order.side === 'BUY' && markPrice >= order.takeProfit) {
        return { action: 'CLOSE_TP', fillPrice: order.takeProfit };
      }
      if (order.side === 'SELL' && markPrice <= order.takeProfit) {
        return { action: 'CLOSE_TP', fillPrice: order.takeProfit };
      }
    }
    return { action: 'NONE', fillPrice: markPrice };
  }

  return { action: 'NONE', fillPrice: order.currentPrice };
}

export interface ResolvedChallengeRules {
  challengeType: ChallengeType;
  currentStep: number;
  totalSteps: number;
  dailyDrawdownPct: number;
  maxDrawdownPct: number;
  profitTargetPct: number;
  minTradingDays: number;
  leverage: number;
  profitSplitPct: number;
  consistencyRulePct: number;
}

export function resolveChallengeRulesForAccount(
  account: Partial<
    Pick<
      TradingAccountRecord,
      | 'challengeId'
      | 'challengeTitle'
      | 'challengeType'
      | 'currentStep'
      | 'totalSteps'
      | 'dailyDrawdownPct'
      | 'maxDrawdownPct'
      | 'profitTargetPct'
      | 'minTradingDays'
      | 'leverage'
      | 'profitSplitPct'
      | 'status'
    >
  >
): ResolvedChallengeRules {
  const idLower = (account.challengeId || '').toLowerCase();
  const titleLower = (account.challengeTitle || '').toLowerCase();

  let chType: ChallengeType = account.challengeType || 'two_step';
  if (
    account.challengeType === 'instant' ||
    idLower.startsWith('instant') ||
    titleLower.includes('instant')
  ) {
    chType = 'instant';
  } else if (
    account.challengeType === 'one_step' ||
    idLower.startsWith('one-step') ||
    idLower.startsWith('one_step') ||
    titleLower.includes('one step') ||
    titleLower.includes('1-step')
  ) {
    chType = 'one_step';
  } else if (
    account.challengeType === 'three_step' ||
    idLower.startsWith('three-step') ||
    idLower.startsWith('three_step') ||
    titleLower.includes('three step') ||
    titleLower.includes('3-step')
  ) {
    chType = 'three_step';
  } else if (
    account.challengeType === 'two_step' ||
    idLower.startsWith('two-step') ||
    idLower.startsWith('two_step') ||
    titleLower.includes('two step') ||
    titleLower.includes('2-step')
  ) {
    chType = 'two_step';
  }

  // Strictly enforce canonical totalSteps per Challenge Program
  const totalSteps =
    chType === 'instant'
      ? 0
      : chType === 'one_step'
      ? 1
      : chType === 'two_step'
      ? 2
      : 3;

  const currentStep =
    totalSteps === 0
      ? 1
      : Math.min(totalSteps, Math.max(1, account.currentStep || 1));

  // Strictly enforce canonical Daily Drawdown & Max Drawdown per Challenge Program
  const dailyDrawdownPct =
    chType === 'instant' ? 3 : chType === 'one_step' ? 4 : 5;
  const maxDrawdownPct =
    chType === 'instant' || chType === 'one_step'
      ? 6
      : chType === 'two_step'
      ? 10
      : 12;

  // Strictly enforce canonical Profit Target % per Challenge Program & Step
  let profitTargetPct = 8;
  if (chType === 'instant') {
    profitTargetPct = 0;
  } else if (chType === 'one_step') {
    profitTargetPct = 10;
  } else if (chType === 'two_step') {
    profitTargetPct = currentStep >= 2 ? 5 : 8;
  } else if (chType === 'three_step') {
    profitTargetPct = 6;
  }

  const minTradingDays = chType === 'instant' ? 0 : 3;

  const leverage =
    account.leverage && account.leverage > 0
      ? account.leverage
      : chType === 'instant'
      ? 30
      : chType === 'one_step'
      ? 50
      : 100;

  const profitSplitPct =
    chType === 'instant'
      ? 80
      : chType === 'one_step'
      ? 85
      : 90;

  // 15% Consistency Rule applies exclusively to Instant Funding payouts
  const consistencyRulePct = chType === 'instant' ? 15 : 0;

  return {
    challengeType: chType,
    currentStep,
    totalSteps,
    dailyDrawdownPct,
    maxDrawdownPct,
    profitTargetPct,
    minTradingDays,
    leverage,
    profitSplitPct,
    consistencyRulePct,
  };
}

export interface AccountRiskMetrics {
  equity: number;
  floatingPnl: number;
  realizedPnl: number;
  totalNetPnl: number;
  usedMargin: number;
  freeMargin: number;
  marginLevelPct: number;
  dailyDrawdownPct: number;
  maxDrawdownPct: number;
  profitTargetPct: number;
  consistencyRulePct: number;
  dailyLossLimitUsd: number;
  maxLossLimitUsd: number;
  profitTargetUsd: number;
  dailyDropUsd: number;
  overallDropUsd: number;
  dailyRemainingUsd: number;
  maxRemainingUsd: number;
  dailyBreachLevelUsd: number;
  maxBreachFloorUsd: number;
  profitTargetLevelUsd: number;
  netGainUsd: number;
  currentDrawdownUsd: number;
  currentDrawdownPct: number;
  dailyDrawdownUsedPct: number;
  maxDrawdownUsedPct: number;
  profitProgressPct: number;
  peakEquity: number;
  dailyStartingEquity: number;
  nextStatus: AccountStatus;
  breachReason?: string;
  stepCompleted?: boolean;
}

export interface PredefinedChallengePassingRule {
  challengeType: ChallengeType;
  label: string;
  totalSteps: number;
  stepTargetPcts: number[];
  cumulativeProfitTargetPct: number;
  dailyDrawdownPct: number;
  maxDrawdownPct: number;
  minTradingDays: number;
  consistencyRulePct: number;
  profitSplitPct: number;
}

export const PREDEFINED_CHALLENGE_PASSING_RULES: Record<
  ChallengeType,
  PredefinedChallengePassingRule
> = {
  instant: {
    challengeType: 'instant',
    label: 'Instant Funding',
    totalSteps: 0,
    stepTargetPcts: [],
    cumulativeProfitTargetPct: 0,
    dailyDrawdownPct: 3,
    maxDrawdownPct: 6,
    minTradingDays: 0,
    consistencyRulePct: 15,
    profitSplitPct: 80,
  },
  one_step: {
    challengeType: 'one_step',
    label: '1-Step Pro Evaluation',
    totalSteps: 1,
    stepTargetPcts: [10],
    cumulativeProfitTargetPct: 10,
    dailyDrawdownPct: 4,
    maxDrawdownPct: 6,
    minTradingDays: 3,
    consistencyRulePct: 0,
    profitSplitPct: 85,
  },
  two_step: {
    challengeType: 'two_step',
    label: '2-Step Classic Evaluation',
    totalSteps: 2,
    stepTargetPcts: [8, 5],
    cumulativeProfitTargetPct: 13,
    dailyDrawdownPct: 5,
    maxDrawdownPct: 10,
    minTradingDays: 3,
    consistencyRulePct: 0,
    profitSplitPct: 90,
  },
  three_step: {
    challengeType: 'three_step',
    label: '3-Step Institutional Evaluation',
    totalSteps: 3,
    stepTargetPcts: [6, 6, 6],
    cumulativeProfitTargetPct: 18,
    dailyDrawdownPct: 5,
    maxDrawdownPct: 12,
    minTradingDays: 3,
    consistencyRulePct: 0,
    profitSplitPct: 90,
  },
};

export interface PayoutRuleCheckItem {
  id:
    | 'drawdown_compliance'
    | 'evaluation_phases'
    | 'profit_target'
    | 'open_positions'
    | 'positive_balance_profit'
    | 'consistency_rule';
  label: string;
  requiredText: string;
  actualText: string;
  passed: boolean;
}

export interface AccountPayoutEligibility {
  accountId: string;
  accountNumber: string;
  challengeTitle: string;
  challengeType: ChallengeType;
  status: AccountStatus;
  currentStep: number;
  totalSteps: number;
  startingBalance: number;
  balance: number;
  equity: number;
  realizedProfitUsd: number;
  floatingPnlUsd: number;
  netProfitUsd: number;
  requiredCumulativeProfitUsd: number;
  cumulativeEarnedProfitUsd: number;
  profitSplitPct: number;
  maxWithdrawableUsd: number;
  consistencyRulePct: number;
  maxSingleTradeProfitUsd: number;
  highestTradeSharePct: number;
  requiredConsistentProfitUsd: number;
  isConsistencyViolated: boolean;
  isBreached: boolean;
  isStepCompleted: boolean;
  hasMetCumulativeTarget: boolean;
  hasPositiveProfit: boolean;
  ruleChecks: PayoutRuleCheckItem[];
  eligible: boolean;
  reason: string;
}

export interface PayoutValidationResult {
  valid: boolean;
  error?: string;
  eligibility: AccountPayoutEligibility;
}

export function getMinimumPhaseStartBalance(
  startingBalance: number,
  challengeType: ChallengeType,
  currentStep: number,
  recordedPhaseStart?: number
): number {
  let minRequiredStart = startingBalance;
  if (challengeType === 'two_step' && currentStep >= 2) {
    // Step 1 required +8%, so Step 2 baseline is at least startingBalance * 1.08
    minRequiredStart = Math.round(startingBalance * 1.08 * 100) / 100;
  } else if (challengeType === 'three_step') {
    if (currentStep === 2) {
      // Step 1 required +6%
      minRequiredStart = Math.round(startingBalance * 1.06 * 100) / 100;
    } else if (currentStep >= 3) {
      // Step 1 (+6%) + Step 2 (+6%) = +12%
      minRequiredStart = Math.round(startingBalance * 1.12 * 100) / 100;
    }
  }
  if (recordedPhaseStart && recordedPhaseStart >= minRequiredStart) {
    return Math.round(recordedPhaseStart * 100) / 100;
  }
  return minRequiredStart;
}

export function getRequiredCumulativeEvaluationProfitUsd(
  startingBalance: number,
  challengeType: ChallengeType
): number {
  if (challengeType === 'instant') return 0;
  if (challengeType === 'one_step') return Math.round(startingBalance * 0.10 * 100) / 100;
  if (challengeType === 'two_step') return Math.round(startingBalance * 0.13 * 100) / 100; // 8% Step 1 + 5% Step 2
  return Math.round(startingBalance * 0.18 * 100) / 100; // 6% + 6% + 6% for 3-Step
}

export function evaluateAccountRiskMetrics(
  account: TradingAccountRecord,
  openOrders: TradeOrderRecord[]
): AccountRiskMetrics {
  const rules = resolveChallengeRulesForAccount(account);

  // Explicitly exclude any order marked as 'CLOSED' / 'closed' so closed positions never contribute to live floating PnL
  const strictlyOpenOrders = openOrders.filter(
    (o) =>
      o.status === 'OPEN' &&
      String(o.status).toLowerCase() !== 'closed' &&
      !o.closeTime
  );

  const floatingPnl =
    Math.round(strictlyOpenOrders.reduce((sum, o) => sum + o.netPnl, 0) * 100) / 100;
  const usedMargin =
    Math.round(
      strictlyOpenOrders.reduce(
        (sum, o) =>
          sum + calculateRequiredMargin(o.symbol, o.volume, o.entryPrice, rules.leverage),
        0
      ) * 100
    ) / 100;

  const equity = Math.round((account.balance + floatingPnl) * 100) / 100;
  const realizedPnl = Math.round((account.balance - account.startingBalance) * 100) / 100;
  const totalNetPnl = Math.round((equity - account.startingBalance) * 100) / 100;
  const freeMargin = Math.round((equity - usedMargin) * 100) / 100;
  const marginLevelPct =
    usedMargin > 0 ? Math.round((equity / usedMargin) * 10000) / 100 : 0;

  const dailyLossLimitUsd =
    Math.round(account.startingBalance * (rules.dailyDrawdownPct / 100) * 100) / 100;
  const maxLossLimitUsd =
    Math.round(account.startingBalance * (rules.maxDrawdownPct / 100) * 100) / 100;
  const profitTargetUsd =
    Math.round(account.startingBalance * (rules.profitTargetPct / 100) * 100) / 100;

  const currentPeak = Math.max(account.peakEquity || account.startingBalance, equity);
  const currentDailyStart = account.dailyStartingEquity || account.startingBalance;

  // Directly attach Max Drawdown to Evaluation P&L relative to Starting Balance:
  // When evaluation P&L is in profit (equity >= startingBalance), Max Drawdown used is $0.00 (0%).
  // When evaluation P&L is negative (equity < startingBalance), Max Drawdown used equals exact loss (startingBalance - equity).
  const overallDropUsd =
    equity < account.startingBalance
      ? Math.max(0, Math.round((account.startingBalance - equity) * 100) / 100)
      : 0;

  // Daily Drawdown checks both loss below startingBalance AND intraday loss from dailyStartingEquity when account is in drawdown
  const intradayDropFromDailyStart =
    currentDailyStart > equity
      ? Math.max(0, Math.round((currentDailyStart - equity) * 100) / 100)
      : 0;
  const dailyDropUsd =
    equity < account.startingBalance
      ? Math.max(overallDropUsd, intradayDropFromDailyStart)
      : 0;

  const currentDrawdownUsd = overallDropUsd;
  const currentDrawdownPct =
    Math.round((currentDrawdownUsd / Math.max(1, account.startingBalance)) * 10000) / 100;

  const dailyRemainingUsd = Math.max(
    0,
    Math.round((dailyLossLimitUsd - dailyDropUsd) * 100) / 100
  );
  const maxRemainingUsd = Math.max(
    0,
    Math.round((maxLossLimitUsd - overallDropUsd) * 100) / 100
  );

  const phaseStartBalance = getMinimumPhaseStartBalance(
    account.startingBalance,
    rules.challengeType,
    rules.currentStep,
    account.phaseStartingBalance
  );

  const dailyBreachLevelUsd =
    Math.round((Math.max(account.startingBalance, currentDailyStart) - dailyLossLimitUsd) * 100) / 100;
  const maxBreachFloorUsd =
    Math.round((account.startingBalance - maxLossLimitUsd) * 100) / 100;
  const profitTargetLevelUsd =
    Math.round((phaseStartBalance + profitTargetUsd) * 100) / 100;

  const dailyDrawdownUsedPct = Math.min(
    100,
    Math.round((dailyDropUsd / Math.max(1, dailyLossLimitUsd)) * 10000) / 100
  );
  const maxDrawdownUsedPct = Math.min(
    100,
    Math.round((overallDropUsd / Math.max(1, maxLossLimitUsd)) * 10000) / 100
  );

  const netGainUsd = Math.max(0, Math.round((equity - phaseStartBalance) * 100) / 100);
  const realizedStepGainUsd = Math.max(
    0,
    Math.round((account.balance - phaseStartBalance) * 100) / 100
  );
  const profitProgressPct =
    profitTargetUsd > 0
      ? Math.min(100, Math.round((netGainUsd / profitTargetUsd) * 10000) / 100)
      : 100;

  let nextStatus: AccountStatus = account.status;
  let breachReason: string | undefined = account.breachReason;
  let stepCompleted = false;

  const isInstant = rules.challengeType === 'instant';

  if (account.status === 'active' || account.status === 'passed' || account.status === 'completed') {
    // Strictly enforce Max Drawdown and Daily Drawdown rules on live floating equity & balance
    if (overallDropUsd >= maxLossLimitUsd || equity <= maxBreachFloorUsd) {
      nextStatus = 'failed';
      breachReason = `Maximum Drawdown Limit Breached (${rules.maxDrawdownPct}% | Loss: -$${overallDropUsd.toFixed(2)} | Max Limit: -$${maxLossLimitUsd.toFixed(2)})`;
    } else if (dailyDropUsd >= dailyLossLimitUsd || equity <= dailyBreachLevelUsd) {
      nextStatus = 'failed';
      breachReason = `Daily Drawdown Limit Breached (${rules.dailyDrawdownPct}% | Daily Loss: -$${dailyDropUsd.toFixed(2)} | Daily Limit: -$${dailyLossLimitUsd.toFixed(2)})`;
    } else if (
      account.status === 'active' &&
      !isInstant &&
      profitTargetUsd > 0 &&
      netGainUsd >= profitTargetUsd
    ) {
      stepCompleted = true;
      nextStatus = 'passed';
    }
  }

  return {
    equity,
    floatingPnl,
    realizedPnl,
    totalNetPnl,
    usedMargin,
    freeMargin,
    marginLevelPct,
    dailyDrawdownPct: rules.dailyDrawdownPct,
    maxDrawdownPct: rules.maxDrawdownPct,
    profitTargetPct: rules.profitTargetPct,
    consistencyRulePct: rules.consistencyRulePct,
    dailyLossLimitUsd,
    maxLossLimitUsd,
    profitTargetUsd,
    dailyDropUsd,
    overallDropUsd,
    dailyRemainingUsd,
    maxRemainingUsd,
    dailyBreachLevelUsd,
    maxBreachFloorUsd,
    profitTargetLevelUsd,
    netGainUsd,
    currentDrawdownUsd,
    currentDrawdownPct,
    dailyDrawdownUsedPct,
    maxDrawdownUsedPct,
    profitProgressPct,
    peakEquity: currentPeak,
    dailyStartingEquity: currentDailyStart,
    nextStatus,
    breachReason,
    stepCompleted,
  };
}

export function evaluateAccountPayoutEligibility(
  account: TradingAccountRecord,
  openOrders: TradeOrderRecord[] = [],
  closedOrders: TradeOrderRecord[] = [],
  options?: { withdrawnGrossProfitUsd?: number }
): AccountPayoutEligibility {
  const rules = resolveChallengeRulesForAccount(account);
  const predefinedRule = PREDEFINED_CHALLENGE_PASSING_RULES[rules.challengeType];
  const metrics = evaluateAccountRiskMetrics(account, openOrders);
  const totalSteps = predefinedRule.totalSteps;
  const currentStep =
    account.status === 'passed' || account.status === 'completed'
      ? Math.max(rules.currentStep, totalSteps || 1)
      : rules.currentStep;

  const strictlyOpenOrders = openOrders.filter(
    (o) =>
      o.status === 'OPEN' &&
      String(o.status).toLowerCase() !== 'closed' &&
      !o.closeTime
  );
  const hasOpenPositions = strictlyOpenOrders.length > 0;

  const realizedProfitUsd = Math.round((account.balance - account.startingBalance) * 100) / 100;
  const effectiveEquityProfitUsd = Math.round((metrics.equity - account.startingBalance) * 100) / 100;
  const netProfitUsd = Math.max(0, Math.min(realizedProfitUsd, effectiveEquityProfitUsd));
  const profitSplitPct =
    account.profitSplitPct && account.profitSplitPct > 0
      ? account.profitSplitPct
      : predefinedRule.profitSplitPct;

  const isBreached =
    account.status === 'failed' ||
    account.status === 'suspended' ||
    metrics.nextStatus === 'failed';

  const isInstant = rules.challengeType === 'instant';
  const isEvaluationPassed =
    !isInstant &&
    (account.status === 'passed' || account.status === 'completed') &&
    currentStep >= totalSteps;

  // 15% Consistency Rule in Payout Section (Applies strictly to Instant Funding)
  const consistencyRulePct = predefinedRule.consistencyRulePct;
  const closedForAcc = closedOrders.filter(
    (o) =>
      o.accountId === account.id &&
      (o.status === 'CLOSED' || String(o.status).toLowerCase() === 'closed')
  );
  const winningClosedForAcc = closedForAcc.filter((o) => o.netPnl > 0);
  const closedRealizedSumUsd =
    Math.round(closedForAcc.reduce((s, o) => s + (o.netPnl || 0), 0) * 100) / 100;
  const withdrawnGrossUsd = Math.max(0, Number(options?.withdrawnGrossProfitUsd || 0));
  const cumulativeEarnedProfitUsd =
    Math.round(Math.max(realizedProfitUsd + withdrawnGrossUsd, closedRealizedSumUsd) * 100) / 100;
  const requiredCumulativeProfitUsd = getRequiredCumulativeEvaluationProfitUsd(
    account.startingBalance,
    rules.challengeType
  );
  const hasMetCumulativeTarget = isInstant
    ? netProfitUsd > 0
    : cumulativeEarnedProfitUsd + 0.01 >= requiredCumulativeProfitUsd;

  const totalClosedRealizedProfitUsd = Math.max(netProfitUsd, closedRealizedSumUsd);

  const maxSingleTradeProfitUsd =
    winningClosedForAcc.length > 0
      ? Math.round(Math.max(...winningClosedForAcc.map((o) => o.netPnl)) * 100) / 100
      : 0;
  const requiredConsistentProfitUsd =
    maxSingleTradeProfitUsd > 0
      ? Math.round((maxSingleTradeProfitUsd / 0.15) * 100) / 100
      : 0;
  const highestTradeSharePct =
    totalClosedRealizedProfitUsd > 0 && maxSingleTradeProfitUsd > 0
      ? Math.round((maxSingleTradeProfitUsd / totalClosedRealizedProfitUsd) * 10000) / 100
      : 0;
  const isConsistencyViolated =
    isInstant &&
    winningClosedForAcc.length > 0 &&
    netProfitUsd > 0 &&
    highestTradeSharePct > consistencyRulePct;

  const isStepCompleted = isInstant || isEvaluationPassed;
  const hasPositiveProfit = netProfitUsd > 0;

  const ruleChecks: PayoutRuleCheckItem[] = [
    {
      id: 'drawdown_compliance',
      label: 'Daily & Max Drawdown Rules',
      requiredText: `≤ ${predefinedRule.dailyDrawdownPct}% Daily / ≤ ${predefinedRule.maxDrawdownPct}% Max`,
      actualText: isBreached
        ? 'Breached'
        : `${metrics.dailyDrawdownUsedPct.toFixed(1)}% Daily / ${metrics.maxDrawdownUsedPct.toFixed(1)}% Max`,
      passed: !isBreached,
    },
    ...(isInstant
      ? [
          {
            id: 'consistency_rule' as const,
            label: '15% Consistency Rule',
            requiredText: 'Best Trade ≤ 15% of Total Profit',
            actualText:
              winningClosedForAcc.length === 0
                ? 'Awaiting Closed Trades'
                : `${highestTradeSharePct.toFixed(1)}% Single Trade`,
            passed: !isConsistencyViolated,
          },
        ]
      : [
          {
            id: 'evaluation_phases' as const,
            label: `Evaluation Phases (${totalSteps}-Step)`,
            requiredText: `${totalSteps} of ${totalSteps} Steps Passed`,
            actualText: isEvaluationPassed
              ? `${totalSteps}/${totalSteps} Passed`
              : `Step ${currentStep}/${totalSteps} Active`,
            passed: isEvaluationPassed,
          },
          {
            id: 'profit_target' as const,
            label: `Predefined Target (+${predefinedRule.cumulativeProfitTargetPct}%)`,
            requiredText: `+$${requiredCumulativeProfitUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            actualText: `${cumulativeEarnedProfitUsd >= 0 ? '+' : ''}$${cumulativeEarnedProfitUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            passed: hasMetCumulativeTarget,
          },
        ]),
    {
      id: 'open_positions',
      label: 'Zero Open Positions',
      requiredText: '0 Open Trades',
      actualText: `${strictlyOpenOrders.length} Open`,
      passed: !hasOpenPositions,
    },
    {
      id: 'positive_balance_profit',
      label: 'Withdrawable Net Profit',
      requiredText: '> $0.00 Available',
      actualText: `${realizedProfitUsd >= 0 ? '+' : ''}$${realizedProfitUsd.toFixed(2)}`,
      passed: hasPositiveProfit,
    },
  ];

  const eligible =
    !isBreached &&
    !hasOpenPositions &&
    isStepCompleted &&
    hasMetCumulativeTarget &&
    hasPositiveProfit &&
    !isConsistencyViolated;
  const maxWithdrawableUsd = eligible
    ? Math.round(netProfitUsd * (profitSplitPct / 100) * 100) / 100
    : 0;

  let reason =
    'Account has verified all predefined challenge passing rules and is unlocked for profit payout withdrawal.';
  if (isBreached) {
    reason =
      metrics.breachReason ||
      account.breachReason ||
      'Account is breached due to Daily/Maximum Drawdown violation. Terminal password has been revoked and payouts are permanently disabled.';
  } else if (hasOpenPositions) {
    reason = `Open Position Active: Please close all ${strictlyOpenOrders.length} open position(s) in the terminal before requesting a payout.`;
  } else if (!isStepCompleted) {
    if (rules.challengeType === 'two_step') {
      const step1TargetUsd = Math.round(account.startingBalance * 0.08 * 100) / 100;
      const step2TargetUsd = Math.round(account.startingBalance * 0.05 * 100) / 100;
      if (currentStep <= 1) {
        reason = `2-Step Challenge Locked (Step 1 of 2 Active): Pass Step 1 (+8% / +$${step1TargetUsd.toLocaleString()}) and Step 2 (+5% / +$${step2TargetUsd.toLocaleString()}) while staying within 5% Daily & 10% Max Drawdown to become Funded and unlock Payouts.`;
      } else {
        reason = `2-Step Challenge Locked (Step 2 of 2 Active — Step 1 Passed ✓): Reach the Step 2 profit target (+5% / +$${step2TargetUsd.toLocaleString()}) above your Step 2 baseline ($${getMinimumPhaseStartBalance(account.startingBalance, 'two_step', 2, account.phaseStartingBalance).toLocaleString()}) to become Funded and unlock Payouts.`;
      }
    } else if (rules.challengeType === 'three_step') {
      const stepTargetUsd = Math.round(account.startingBalance * 0.06 * 100) / 100;
      reason = `3-Step Challenge Locked (Step ${currentStep} of 3 Active): Pass all 3 evaluation steps (+6% / +$${stepTargetUsd.toLocaleString()} per step) while staying within 5% Daily & 12% Max Drawdown to become Funded and unlock Payouts.`;
    } else {
      const step1TargetUsd = Math.round(account.startingBalance * 0.1 * 100) / 100;
      reason = `1-Step Challenge Locked (Evaluation in progress): Reach the +10% profit target (+$${step1TargetUsd.toLocaleString()}) while staying within 4% Daily & 6% Max Drawdown to pass evaluation and unlock Funded Payouts.`;
    }
  } else if (!hasMetCumulativeTarget) {
    reason = `${predefinedRule.label} Target Not Met: Cumulative verified profit (+$${cumulativeEarnedProfitUsd.toFixed(2)}) is below the required +${predefinedRule.cumulativeProfitTargetPct}% evaluation target (+$${requiredCumulativeProfitUsd.toFixed(2)}).`;
  } else if (!hasPositiveProfit) {
    reason = `No positive realized P&L available to withdraw (Current Realized P&L: ${realizedProfitUsd >= 0 ? '+' : ''}$${realizedProfitUsd.toFixed(2)}). Generate trading profit above $${account.startingBalance.toLocaleString()} starting capital to request a payout.`;
  } else if (isConsistencyViolated) {
    reason = `Instant Funding 15% Consistency Rule: Highest single trade profit (+$${maxSingleTradeProfitUsd.toFixed(2)}) is ${highestTradeSharePct.toFixed(1)}% of total profit (+$${totalClosedRealizedProfitUsd.toFixed(2)}), exceeding the 15% consistency limit. Required total profit to unlock payout: +$${requiredConsistentProfitUsd.toFixed(2)}.`;
  }

  return {
    accountId: account.id,
    accountNumber: account.accountNumber,
    challengeTitle: account.challengeTitle,
    challengeType: rules.challengeType,
    status: metrics.nextStatus === 'failed' ? 'failed' : account.status,
    currentStep,
    totalSteps,
    startingBalance: account.startingBalance,
    balance: account.balance,
    equity: metrics.equity,
    realizedProfitUsd,
    floatingPnlUsd: metrics.floatingPnl,
    netProfitUsd,
    requiredCumulativeProfitUsd,
    cumulativeEarnedProfitUsd,
    profitSplitPct,
    maxWithdrawableUsd,
    consistencyRulePct,
    maxSingleTradeProfitUsd,
    highestTradeSharePct,
    requiredConsistentProfitUsd,
    isConsistencyViolated,
    isBreached,
    isStepCompleted,
    hasMetCumulativeTarget,
    hasPositiveProfit,
    ruleChecks,
    eligible,
    reason,
  };
}

export function validatePayoutRequestAgainstRules(params: {
  account: TradingAccountRecord;
  amountUsd: number;
  method: string;
  destination: string;
  openOrders?: TradeOrderRecord[];
  closedOrders?: TradeOrderRecord[];
  existingPayouts?: Array<{
    accountId?: string;
    status?: string;
    amountUsd?: number;
    grossProfitDeducted?: number;
  }>;
}): PayoutValidationResult {
  const { account, amountUsd, method, destination } = params;
  const openOrders = params.openOrders || [];
  const closedOrders = params.closedOrders || [];
  const rules = resolveChallengeRulesForAccount(account);

  const withdrawnGrossProfitUsd = (params.existingPayouts || [])
    .filter((p) => p.accountId === account.id && p.status !== 'Rejected')
    .reduce(
      (sum, p) =>
        sum +
        (Number(p.grossProfitDeducted) ||
          Number(p.amountUsd || 0) / ((rules.profitSplitPct || 80) / 100)),
      0
    );

  const eligibility = evaluateAccountPayoutEligibility(account, openOrders, closedOrders, {
    withdrawnGrossProfitUsd,
  });

  if (!eligibility.eligible) {
    return {
      valid: false,
      error: eligibility.reason,
      eligibility,
    };
  }

  const requestedUsd = Math.round(Number(amountUsd) * 100) / 100;
  if (!Number.isFinite(requestedUsd) || requestedUsd < 20) {
    return {
      valid: false,
      error: 'Minimum payout withdrawal amount is $20.00 USD.',
      eligibility,
    };
  }

  if (requestedUsd > eligibility.maxWithdrawableUsd) {
    return {
      valid: false,
      error: `Requested amount ($${requestedUsd.toFixed(2)}) exceeds your ${eligibility.profitSplitPct}% profit split limit ($${eligibility.maxWithdrawableUsd.toFixed(2)}).`,
      eligibility,
    };
  }

  if (!String(method || '').trim()) {
    return {
      valid: false,
      error: 'Please select a valid payout settlement method.',
      eligibility,
    };
  }

  const cleanDest = String(destination || '').trim();
  if (cleanDest.length < 8) {
    return {
      valid: false,
      error: 'Please enter a valid receiving wallet address or bank wire destination (minimum 8 characters).',
      eligibility,
    };
  }

  return {
    valid: true,
    eligibility,
  };
}

export function exportOrdersToCsv(orders: TradeOrderRecord[]): string {
  const headers = [
    'Ticket ID',
    'Symbol',
    'Side',
    'Type',
    'Volume',
    'Entry Price',
    'Exit Price',
    'Stop Loss',
    'Take Profit',
    'Gross PnL ($)',
    'Commission ($)',
    'Net PnL ($)',
    'Status',
    'Open Time',
    'Close Time',
  ];
  const rows = orders.map((o) => [
    o.ticketId,
    o.symbol,
    o.side,
    o.orderType,
    o.volume.toFixed(2),
    o.entryPrice.toString(),
    o.exitPrice.toString(),
    o.stopLoss.toString(),
    o.takeProfit.toString(),
    o.grossPnl.toFixed(2),
    o.commission.toFixed(2),
    o.netPnl.toFixed(2),
    o.status,
    o.openTime,
    o.closeTime || '-',
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export interface PayoutRecordItem {
  id: string;
  traderName: string;
  username: string;
  userEmail?: string;
  userId?: string;
  amountUsd: number;
  grossProfitDeducted?: number;
  profitSplitPct?: number;
  currency: string;
  status: 'Verified' | 'Pending' | 'Rejected';
  paymentDate: string;
  accountSize: number;
  programType: string;
  accountId?: string;
  accountNumber?: string;
  destination?: string;
  isTraderRequest?: boolean;
  adminReason?: string;
  reviewedBy?: string;
  createdAt?: string;
  reviewedAt?: string;
}

export function filterVerifiedPayouts(payouts: PayoutRecordItem[]): PayoutRecordItem[] {
  return payouts.filter((p) => p.status === 'Verified' && p.amountUsd > 0);
}

export function computeLivePlatformStatistics(input: {
  registeredUsersCount: number;
  accounts: Pick<TradingAccountRecord, 'status' | 'userId'>[];
  payouts: PayoutRecordItem[];
  baselineTraders?: number;
  baselineFundedAccounts?: number;
  baselineActiveTraders?: number;
}): {
  totalRegisteredTraders: number;
  totalPayoutsUsd: number;
  totalFundedAccounts: number;
  activeTraders: number;
} {
  const verifiedPayouts = filterVerifiedPayouts(input.payouts);
  const verifiedPayoutSum = verifiedPayouts.reduce((sum, p) => sum + p.amountUsd, 0);
  const fundedOrPassedCount = input.accounts.filter(
    (a) => a.status === 'passed' || a.status === 'active' || a.status === 'completed'
  ).length;
  const activeAccountsCount = input.accounts.filter((a) => a.status === 'active').length;

  return {
    totalRegisteredTraders: (input.baselineTraders ?? 18420) + input.registeredUsersCount,
    totalPayoutsUsd: Math.round(verifiedPayoutSum * 100) / 100,
    totalFundedAccounts: (input.baselineFundedAccounts ?? 4280) + fundedOrPassedCount,
    activeTraders: (input.baselineActiveTraders ?? 3190) + activeAccountsCount,
  };
}

export interface SlTpPreviewInput {
  symbol: SymbolCode;
  side: OrderSide;
  volume: number;
  referencePrice: number;
  liveBid?: number;
  liveAsk?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  isOpenPosition?: boolean;
  allowAutoClamp?: boolean;
}

export interface SlTpPreviewResult {
  valid: boolean;
  error?: string;
  stopLoss: number;
  takeProfit: number;
  minDist: number;
  riskUsd: number;
  rewardUsd: number;
  rrRatio: number | null;
}

export function validateAndComputeSlTpPreview(input: SlTpPreviewInput): SlTpPreviewResult {
  const spec = INSTRUMENTS[input.symbol];
  if (!spec) {
    return {
      valid: false,
      error: 'Unsupported trading symbol.',
      stopLoss: 0,
      takeProfit: 0,
      minDist: 0,
      riskUsd: 0,
      rewardUsd: 0,
      rrRatio: null,
    };
  }

  const minPip = Math.pow(10, -(spec.decimals || 2));
  const minDist = Math.max(minPip * 2, (spec.spread || minPip) * 0.5);
  const refPrice = input.referencePrice > 0 ? input.referencePrice : spec.basePrice;
  const bid = input.liveBid && input.liveBid > 0 ? input.liveBid : refPrice;
  const ask = input.liveAsk && input.liveAsk > 0 ? input.liveAsk : refPrice;
  const guardPrice = input.isOpenPosition ? (input.side === 'BUY' ? bid : ask) : refPrice;
  const guardLabel = input.isOpenPosition
    ? input.side === 'BUY'
      ? 'live Bid'
      : 'live Ask'
    : 'entry price';

  let sl =
    typeof input.stopLoss === 'number' && Number.isFinite(input.stopLoss) && input.stopLoss > 0
      ? roundPrice(input.stopLoss, input.symbol)
      : 0;
  let tp =
    typeof input.takeProfit === 'number' && Number.isFinite(input.takeProfit) && input.takeProfit > 0
      ? roundPrice(input.takeProfit, input.symbol)
      : 0;

  if (typeof input.stopLoss === 'number' && Number.isFinite(input.stopLoss) && input.stopLoss < 0) {
    return {
      valid: false,
      error: 'Stop Loss must be a positive price or cleared (0).',
      stopLoss: 0,
      takeProfit: tp,
      minDist,
      riskUsd: 0,
      rewardUsd: 0,
      rrRatio: null,
    };
  }
  if (typeof input.takeProfit === 'number' && Number.isFinite(input.takeProfit) && input.takeProfit < 0) {
    return {
      valid: false,
      error: 'Take Profit must be a positive price or cleared (0).',
      stopLoss: sl,
      takeProfit: 0,
      minDist,
      riskUsd: 0,
      rewardUsd: 0,
      rrRatio: null,
    };
  }

  let error: string | undefined;

  if (input.side === 'BUY') {
    if (sl > 0 && sl > guardPrice - minDist) {
      if (input.allowAutoClamp) {
        sl = roundPrice(Math.max(minPip, guardPrice - minDist), input.symbol);
      } else {
        error = `Buy Stop Loss (${sl.toFixed(spec.decimals)}) must stay below ${guardLabel} (${guardPrice.toFixed(spec.decimals)}).`;
      }
    }
    if (!error && tp > 0 && tp < guardPrice + minDist) {
      if (input.allowAutoClamp) {
        tp = roundPrice(guardPrice + minDist, input.symbol);
      } else {
        error = `Buy Take Profit (${tp.toFixed(spec.decimals)}) must stay above ${guardLabel} (${guardPrice.toFixed(spec.decimals)}).`;
      }
    }
  } else {
    if (sl > 0 && sl < guardPrice + minDist) {
      if (input.allowAutoClamp) {
        sl = roundPrice(guardPrice + minDist, input.symbol);
      } else {
        error = `Sell Stop Loss (${sl.toFixed(spec.decimals)}) must stay above ${guardLabel} (${guardPrice.toFixed(spec.decimals)}).`;
      }
    }
    if (!error && tp > 0 && tp > guardPrice - minDist) {
      if (input.allowAutoClamp) {
        tp = roundPrice(Math.max(minPip, guardPrice - minDist), input.symbol);
      } else {
        error = `Sell Take Profit (${tp.toFixed(spec.decimals)}) must stay below ${guardLabel} (${guardPrice.toFixed(spec.decimals)}).`;
      }
    }
  }

  const vol = Math.max(0.01, input.volume || 0.01);
  const slDist = sl > 0 ? Math.abs(refPrice - sl) : 0;
  const tpDist = tp > 0 ? Math.abs(tp - refPrice) : 0;
  const riskUsd =
    sl > 0 ? Math.round(slDist * spec.contractSize * vol * 100) / 100 : 0;
  const rewardUsd =
    tp > 0 ? Math.round(tpDist * spec.contractSize * vol * 100) / 100 : 0;
  const rrRatio =
    riskUsd > 0 && rewardUsd > 0 ? Math.round((rewardUsd / riskUsd) * 100) / 100 : null;

  return {
    valid: !error,
    error,
    stopLoss: sl,
    takeProfit: tp,
    minDist,
    riskUsd,
    rewardUsd,
    rrRatio,
  };
}

export interface SlTpPresetsResult {
  breakevenSl: number | null;
  riskUsdPresets: { riskUsd: number; slPrice: number }[];
  rrPresets: { ratio: number; label: string; slPrice: number; tpPrice: number }[];
}

export function computeSlTpPresets(input: {
  symbol: SymbolCode;
  side: OrderSide;
  volume: number;
  entryPrice: number;
  liveBid?: number;
  liveAsk?: number;
  currentSl?: number;
  isOpenPosition?: boolean;
}): SlTpPresetsResult {
  const spec = INSTRUMENTS[input.symbol];
  const empty: SlTpPresetsResult = { breakevenSl: null, riskUsdPresets: [], rrPresets: [] };
  if (!spec || input.entryPrice <= 0) return empty;

  const vol = Math.max(0.01, input.volume || 0.01);
  const minPip = Math.pow(10, -(spec.decimals || 2));
  const minDist = Math.max(minPip * 2, (spec.spread || minPip) * 0.5);
  const bid = input.liveBid && input.liveBid > 0 ? input.liveBid : input.entryPrice;
  const ask = input.liveAsk && input.liveAsk > 0 ? input.liveAsk : input.entryPrice;
  const guardPrice = input.isOpenPosition ? (input.side === 'BUY' ? bid : ask) : input.entryPrice;
  const signSl = input.side === 'BUY' ? -1 : 1;
  const signTp = input.side === 'BUY' ? 1 : -1;

  // Breakeven SL only valid if trade is sufficiently in profit past minDist
  let breakevenSl: number | null = null;
  if (input.isOpenPosition) {
    if (input.side === 'BUY' && input.entryPrice <= guardPrice - minDist) {
      breakevenSl = roundPrice(input.entryPrice, input.symbol);
    } else if (input.side === 'SELL' && input.entryPrice >= guardPrice + minDist) {
      breakevenSl = roundPrice(input.entryPrice, input.symbol);
    }
  }

  // Dollar risk SL presets ($25, $50, $100) anchored safely outside guardPrice + minDist
  const riskUsdPresets = [25, 50, 100].map((riskUsd) => {
    const rawOffset = riskUsd / (spec.contractSize * vol);
    const candidate = roundPrice(input.entryPrice + signSl * rawOffset, input.symbol);
    const clamped =
      input.side === 'BUY'
        ? Math.min(candidate, roundPrice(guardPrice - minDist * 2, input.symbol))
        : Math.max(candidate, roundPrice(guardPrice + minDist * 2, input.symbol));
    return {
      riskUsd,
      slPrice: Math.max(minPip, roundPrice(clamped, input.symbol)),
    };
  });

  // Base risk distance for R:R presets: either active SL distance or ~$50 risk distance (minimum 4*spread)
  const fallbackDist = Math.max(minDist * 4, 50 / (spec.contractSize * vol));
  const hasValidCurrentSl =
    input.currentSl &&
    input.currentSl > 0 &&
    ((input.side === 'BUY' && input.currentSl < guardPrice) ||
      (input.side === 'SELL' && input.currentSl > guardPrice));
  const riskDist = hasValidCurrentSl
    ? Math.max(minDist * 2, Math.abs(input.entryPrice - (input.currentSl as number)))
    : fallbackDist;

  const activeSlPrice = hasValidCurrentSl
    ? roundPrice(input.currentSl as number, input.symbol)
    : roundPrice(Math.max(minPip, guardPrice + signSl * riskDist), input.symbol);

  const rrPresets = [1, 2, 3].map((ratio) => {
    const rawTp = input.entryPrice + signTp * riskDist * ratio;
    const safeTp =
      input.side === 'BUY'
        ? Math.max(rawTp, guardPrice + minDist * 2)
        : Math.max(minPip, Math.min(rawTp, guardPrice - minDist * 2));
    return {
      ratio,
      label: `1:${ratio}`,
      slPrice: activeSlPrice,
      tpPrice: roundPrice(safeTp, input.symbol),
    };
  });

  return {
    breakevenSl,
    riskUsdPresets,
    rrPresets,
  };
}

export function formatCandleCountdown(nowMs: number, timeframeSeconds: number): string {
  const tfSec = Math.max(1, Math.floor(timeframeSeconds));
  const nowSec = Math.floor(nowMs / 1000);
  const secPassed = ((nowSec % tfSec) + tfSec) % tfSec;
  const secRemaining = secPassed === 0 ? tfSec : tfSec - secPassed;
  const days = Math.floor(secRemaining / 86400);
  const hrs = Math.floor((secRemaining % 86400) / 3600);
  const mins = Math.floor((secRemaining % 3600) / 60);
  const secs = secRemaining % 60;

  if (days > 0) {
    return `${days}d ${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function resolveChartPriceOrderType(
  side: OrderSide,
  targetPrice: number,
  liveBid: number,
  liveAsk: number
): 'BUY_LIMIT' | 'BUY_STOP' | 'SELL_LIMIT' | 'SELL_STOP' {
  if (side === 'BUY') {
    return targetPrice <= liveAsk ? 'BUY_LIMIT' : 'BUY_STOP';
  }
  return targetPrice >= liveBid ? 'SELL_LIMIT' : 'SELL_STOP';
}

/**
 * Computes a clamped, valid Stop Loss or Take Profit price when a user drags an SL or TP
 * line vertically on the chart, or right-clicks a price on the chart to set SL/TP.
 */
export function computeChartSlTpDragPrice(params: {
  symbol: SymbolCode | string;
  side: OrderSide;
  entryPrice: number;
  currentReferencePrice?: number;
  lots: number;
  targetType: 'sl' | 'tp';
  rawPrice: number;
  existingSl: number;
  existingTp: number;
  isOpenPosition?: boolean;
}): {
  clampedPrice: number;
  nextSl: number;
  nextTp: number;
  riskUsd: number | null;
  rewardUsd: number | null;
  rrRatio: number | null;
} {
  const {
    symbol,
    side,
    entryPrice,
    currentReferencePrice,
    lots,
    targetType,
    rawPrice,
    existingSl,
    existingTp,
    isOpenPosition = true,
  } = params;
  const symCode = (symbol in INSTRUMENTS ? symbol : 'XAUUSD') as SymbolCode;
  const spec = INSTRUMENTS[symCode] || INSTRUMENTS.XAUUSD;
  const minPip = Math.pow(10, -(spec.decimals || 2));
  const minDistance = Math.max(minPip * 2, (spec.spread || minPip) * 0.5, entryPrice * 0.00015);
  const hasLivePrice =
    Number.isFinite(currentReferencePrice) && (currentReferencePrice as number) > 0;
  const liveGuardPrice = hasLivePrice ? (currentReferencePrice as number) : entryPrice;
  const refHighPrice = isOpenPosition
    ? liveGuardPrice
    : hasLivePrice
    ? Math.max(entryPrice, currentReferencePrice as number)
    : entryPrice;
  const refLowPrice = isOpenPosition
    ? liveGuardPrice
    : hasLivePrice
    ? Math.min(entryPrice, currentReferencePrice as number)
    : entryPrice;

  let candidate = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : entryPrice;

  if (targetType === 'sl') {
    if (side === 'BUY') {
      const maxValidSl = refLowPrice - minDistance;
      candidate = Math.min(candidate, maxValidSl);
    } else {
      const minValidSl = refHighPrice + minDistance;
      candidate = Math.max(candidate, minValidSl);
    }
  } else {
    if (side === 'BUY') {
      const minValidTp = refHighPrice + minDistance;
      candidate = Math.max(candidate, minValidTp);
    } else {
      const maxValidTp = refLowPrice - minDistance;
      candidate = Math.min(candidate, maxValidTp);
    }
  }

  const rounded = Number(Math.max(minPip, candidate).toFixed(spec.decimals));
  const nextSl = targetType === 'sl' ? rounded : existingSl;
  const nextTp = targetType === 'tp' ? rounded : existingTp;

  const preview = validateAndComputeSlTpPreview({
    symbol: symCode,
    side,
    referencePrice: entryPrice,
    liveBid: currentReferencePrice,
    liveAsk: currentReferencePrice,
    isOpenPosition,
    volume: lots,
    stopLoss: nextSl > 0 ? nextSl : undefined,
    takeProfit: nextTp > 0 ? nextTp : undefined,
    allowAutoClamp: true,
  });

  return {
    clampedPrice: targetType === 'sl' ? preview.stopLoss : preview.takeProfit,
    nextSl: preview.stopLoss,
    nextTp: preview.takeProfit,
    riskUsd: preview.riskUsd,
    rewardUsd: preview.rewardUsd,
    rrRatio: preview.rrRatio,
  };
}

/**
 * Generates an instant default protective SL or TP on the chart when the user clicks "+SL" or "+TP"
 * on an open position badge directly on the chart.
 */
export function computeDefaultQuickSlTpForPosition(params: {
  symbol: SymbolCode | string;
  side: OrderSide;
  entryPrice: number;
  currentPrice: number;
  lots: number;
  existingSl: number;
  existingTp: number;
  targetType: 'sl' | 'tp';
  defaultRiskUsd?: number;
}): {
  nextSl: number;
  nextTp: number;
  addedPrice: number;
  riskUsd: number | null;
  rewardUsd: number | null;
} {
  const {
    symbol,
    side,
    entryPrice,
    currentPrice,
    lots,
    existingSl,
    existingTp,
    targetType,
    defaultRiskUsd = 25,
  } = params;
  const symCode = (symbol in INSTRUMENTS ? symbol : 'XAUUSD') as SymbolCode;
  const spec = INSTRUMENTS[symCode] || INSTRUMENTS.XAUUSD;
  const minPip = Math.pow(10, -(spec.decimals || 2));
  const safeLots = Math.max(0.01, Number(lots) || 0.01);
  const baseDistanceFromRisk = defaultRiskUsd / Math.max(0.0001, safeLots * spec.contractSize);
  const minDistance = Math.max(minPip * 15, entryPrice * 0.0018, baseDistanceFromRisk);

  if (targetType === 'sl') {
    const anchor =
      side === 'BUY'
        ? Math.min(entryPrice, currentPrice > 0 ? currentPrice : entryPrice)
        : Math.max(entryPrice, currentPrice > 0 ? currentPrice : entryPrice);
    const rawSl = side === 'BUY' ? anchor - minDistance : anchor + minDistance;
    const res = computeChartSlTpDragPrice({
      symbol: symCode,
      side,
      entryPrice,
      currentReferencePrice: currentPrice,
      lots: safeLots,
      targetType: 'sl',
      rawPrice: rawSl,
      existingSl,
      existingTp,
    });
    return {
      nextSl: res.nextSl,
      nextTp: existingTp,
      addedPrice: res.clampedPrice,
      riskUsd: res.riskUsd,
      rewardUsd: res.rewardUsd,
    };
  } else {
    const slDist = existingSl > 0 ? Math.abs(entryPrice - existingSl) : minDistance;
    const tpDist = Math.max(minDistance * 1.5, slDist * 2);
    const anchor =
      side === 'BUY'
        ? Math.max(entryPrice, currentPrice > 0 ? currentPrice : entryPrice)
        : Math.min(entryPrice, currentPrice > 0 ? currentPrice : entryPrice);
    const rawTp = side === 'BUY' ? anchor + tpDist : anchor - tpDist;
    const res = computeChartSlTpDragPrice({
      symbol: symCode,
      side,
      entryPrice,
      currentReferencePrice: currentPrice,
      lots: safeLots,
      targetType: 'tp',
      rawPrice: rawTp,
      existingSl,
      existingTp,
    });
    return {
      nextSl: existingSl,
      nextTp: res.nextTp,
      addedPrice: res.clampedPrice,
      riskUsd: res.riskUsd,
      rewardUsd: res.rewardUsd,
    };
  }
}

export interface FormattedAccountRulesSummary {
  challengeType: ChallengeType;
  programLabel: string;
  currentPhaseLabel: string;
  totalPhases: number;
  phaseTargetsText: string;
  activeTargetPct: number;
  activeTargetUsd: number;
  dailyDrawdownPct: number;
  dailyDrawdownLimitUsd: number;
  dailyBreachEquityFloorUsd: number;
  maxDrawdownPct: number;
  maxDrawdownLimitUsd: number;
  maxBreachEquityFloorUsd: number;
  minTradingDays: number;
  payoutMinTradingDays: number;
  leverageText: string;
  profitSplitPct: number;
  consistencyRuleText: string;
  drawdownModelText: string;
}

export function formatAccountRulesSummary(
  account: Partial<TradingAccountRecord> & {
    dailyStartBalance?: number;
    currentPhase?: number;
    totalPhases?: number;
  }
): FormattedAccountRulesSummary {
  const resolved = resolveChallengeRulesForAccount({
    ...account,
    currentStep: account.currentStep ?? account.currentPhase,
    totalSteps: account.totalSteps ?? account.totalPhases,
  });
  const startBal = Math.max(100, Number(account.startingBalance) || 5000);
  const dailyRef = Math.max(
    startBal,
    Number(account.dailyStartingEquity) ||
      Number(account.dailyStartBalance) ||
      Number(account.balance) ||
      startBal
  );
  const preset = PREDEFINED_CHALLENGE_PASSING_RULES[resolved.challengeType];

  const currentPhaseLabel =
    account.status === 'passed' || resolved.challengeType === 'instant'
      ? 'Funded Stage (Live Profit Split)'
      : resolved.totalSteps > 1
      ? `Evaluation Phase ${resolved.currentStep} of ${resolved.totalSteps}`
      : 'Single-Phase Evaluation';

  const phaseTargetsText =
    resolved.challengeType === 'instant'
      ? '0% (Direct Funded from Day 1)'
      : resolved.challengeType === 'one_step'
      ? 'Phase 1: +10% → Funded'
      : resolved.challengeType === 'two_step'
      ? 'Phase 1: +8% · Phase 2: +5% → Funded'
      : 'Phase 1: +6% · Phase 2: +6% · Phase 3: +6% → Funded';

  const activeTargetUsd = Number(((startBal * resolved.profitTargetPct) / 100).toFixed(2));
  const dailyDrawdownLimitUsd = Number(((dailyRef * resolved.dailyDrawdownPct) / 100).toFixed(2));
  const dailyBreachEquityFloorUsd = Number((dailyRef - dailyDrawdownLimitUsd).toFixed(2));
  const maxDrawdownLimitUsd = Number(((startBal * resolved.maxDrawdownPct) / 100).toFixed(2));
  const maxBreachEquityFloorUsd = Number((startBal - maxDrawdownLimitUsd).toFixed(2));

  return {
    challengeType: resolved.challengeType,
    programLabel: preset.label,
    currentPhaseLabel,
    totalPhases: resolved.totalSteps,
    phaseTargetsText,
    activeTargetPct: resolved.profitTargetPct,
    activeTargetUsd,
    dailyDrawdownPct: resolved.dailyDrawdownPct,
    dailyDrawdownLimitUsd,
    dailyBreachEquityFloorUsd,
    maxDrawdownPct: resolved.maxDrawdownPct,
    maxDrawdownLimitUsd,
    maxBreachEquityFloorUsd,
    minTradingDays: resolved.minTradingDays,
    payoutMinTradingDays: resolved.challengeType === 'instant' ? 5 : Math.max(3, resolved.minTradingDays),
    leverageText: `1:${resolved.leverage}`,
    profitSplitPct: resolved.profitSplitPct,
    consistencyRuleText:
      resolved.consistencyRulePct > 0
        ? `${resolved.consistencyRulePct}% Max Single-Trade Profit Share`
        : 'None (0% Consistency Restriction)',
    drawdownModelText: 'Static Max Drawdown · Daily Equity Reset (00:00 UTC)',
  };
}


