import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRequiredMargin,
  calculatePositionPnl,
  validateOrderRequest,
  evaluateOrderTrigger,
  evaluateAccountRiskMetrics,
  getMarketStatus,
  type TradingAccountRecord,
  type MarketQuote,
  type TradeOrderRecord,
} from './tradingEngine';

const OPEN_MARKET_MS = Date.UTC(2026, 10, 11, 14, 0, 0); // Wednesday 14:00 UTC (Markets Open)

const sampleAccount: TradingAccountRecord = {
  id: 'acc-1',
  accountNumber: 'FA-500001',
  userId: 'user-1',
  challengeId: 'ch-50k-2step',
  challengeTitle: '$50,000 Two-Step Evaluation',
  challengeType: 'two_step',
  accountSize: 50000,
  startingBalance: 50000,
  balance: 50000,
  equity: 50000,
  usedMargin: 0,
  freeMargin: 50000,
  profitTargetPct: 8,
  dailyDrawdownPct: 5,
  maxDrawdownPct: 10,
  minTradingDays: 3,
  tradingDaysCount: 3,
  leverage: 100,
  status: 'active',
  peakEquity: 50000,
  dailyStartingEquity: 50000,
  lastDailyResetDate: '2026-10-30',
  createdAt: '2026-10-30T00:00:00Z',
  updatedAt: '2026-10-30T00:00:00Z',
};

const xauQuote: MarketQuote = {
  symbol: 'XAUUSD',
  bid: 2748.50,
  ask: 2748.74,
  last: 2748.62,
  change24hPct: 0.65,
  high24h: 2758.00,
  low24h: 2732.10,
  timestamp: Date.now(),
};

test('calculateRequiredMargin computes accurate margin with leverage', () => {
  // 1 lot XAUUSD = 100 oz * 2748.50 = 274,850 notional / 100 leverage = $2,748.50
  const margin = calculateRequiredMargin('XAUUSD', 1, 2748.50, 100);
  assert.equal(margin, 2748.5);
});

test('calculatePositionPnl computes accurate gross, commission, and net P&L for BUY and SELL', () => {
  const buyPnl = calculatePositionPnl('XAUUSD', 'BUY', 1.0, 2740.0, 2750.0);
  // +10.00 * 100 oz * 1 lot = $1,000 gross - $5.00 commission = $995.00 net
  assert.equal(buyPnl.grossPnl, 1000);
  assert.equal(buyPnl.commission, 5);
  assert.equal(buyPnl.netPnl, 995);

  const sellPnl = calculatePositionPnl('XAUUSD', 'SELL', 2.0, 2750.0, 2745.0);
  // +5.00 * 100 oz * 2 lots = $1,000 gross - $10.00 commission = $990.00 net
  assert.equal(sellPnl.grossPnl, 1000);
  assert.equal(sellPnl.commission, 10);
  assert.equal(sellPnl.netPnl, 990);
});

test('validateOrderRequest validates SL/TP direction and margin limits', () => {
  // Valid market BUY (during open institutional weekday session)
  const validRes = validateOrderRequest(
    {
      accountId: 'acc-1',
      symbol: 'XAUUSD',
      side: 'BUY',
      orderType: 'MARKET',
      volume: 1.0,
      stopLoss: 2735.0,
      takeProfit: 2770.0,
    },
    sampleAccount,
    xauQuote,
    OPEN_MARKET_MS
  );
  assert.equal(validRes.valid, true);
  assert.equal(validRes.executionPrice, 2748.74);

  // Invalid BUY Stop Loss above entry
  const invalidSl = validateOrderRequest(
    {
      accountId: 'acc-1',
      symbol: 'XAUUSD',
      side: 'BUY',
      orderType: 'MARKET',
      volume: 1.0,
      stopLoss: 2760.0,
    },
    sampleAccount,
    xauQuote,
    OPEN_MARKET_MS
  );
  assert.equal(invalidSl.valid, false);

  // Invalid Pending BUY_LIMIT above current Ask
  const invalidLimit = validateOrderRequest(
    {
      accountId: 'acc-1',
      symbol: 'XAUUSD',
      side: 'BUY',
      orderType: 'BUY_LIMIT',
      volume: 1.0,
      entryPrice: 2755.0,
    },
    sampleAccount,
    xauQuote,
    OPEN_MARKET_MS
  );
  assert.equal(invalidLimit.valid, false);
});

test('evaluateOrderTrigger triggers pending orders and SL/TP accurately', () => {
  const pendingBuyLimit: TradeOrderRecord = {
    id: 'ord-1',
    ticketId: 'TKT-1001',
    accountId: 'acc-1',
    userId: 'user-1',
    symbol: 'XAUUSD',
    side: 'BUY',
    orderType: 'BUY_LIMIT',
    volume: 1,
    entryPrice: 2749.0,
    currentPrice: 2748.74,
    exitPrice: 0,
    stopLoss: 2735.0,
    takeProfit: 2765.0,
    grossPnl: 0,
    commission: 5,
    netPnl: 0,
    status: 'PENDING',
    openTime: '2026-10-30T00:00:00Z',
    closeTime: '',
  };

  const triggerPending = evaluateOrderTrigger(pendingBuyLimit, xauQuote, OPEN_MARKET_MS);
  assert.equal(triggerPending.action, 'ACTIVATE_PENDING');

  const openBuyOrder: TradeOrderRecord = {
    ...pendingBuyLimit,
    status: 'OPEN',
    entryPrice: 2740.0,
    takeProfit: 2748.0,
  };
  const triggerTp = evaluateOrderTrigger(openBuyOrder, xauQuote, OPEN_MARKET_MS);
  assert.equal(triggerTp.action, 'CLOSE_TP');
});

test('evaluateAccountRiskMetrics detects Passed and Failed evaluation thresholds', () => {
  const winningOrder: TradeOrderRecord = {
    id: 'ord-win',
    ticketId: 'TKT-1002',
    accountId: 'acc-1',
    userId: 'user-1',
    symbol: 'XAUUSD',
    side: 'BUY',
    orderType: 'MARKET',
    volume: 2,
    entryPrice: 2725.0,
    currentPrice: 2748.5,
    exitPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    grossPnl: 4700,
    commission: 10,
    netPnl: 4690, // Exceeds 8% of $50k ($4,000)
    status: 'OPEN',
    openTime: '2026-10-30T00:00:00Z',
    closeTime: '',
  };

  const passMetrics = evaluateAccountRiskMetrics(sampleAccount, [winningOrder]);
  assert.equal(passMetrics.nextStatus, 'passed');
  assert.equal(passMetrics.profitProgressPct, 100);

  const losingOrder: TradeOrderRecord = {
    ...winningOrder,
    netPnl: -2600, // Exceeds 5% Daily Drawdown ($2,500)
  };
  const failMetrics = evaluateAccountRiskMetrics(sampleAccount, [losingOrder]);
  assert.equal(failMetrics.nextStatus, 'failed');
});

test('filterVerifiedPayouts and computeLivePlatformStatistics only count verified payouts and aggregate dynamic counts', async () => {
  const { filterVerifiedPayouts, computeLivePlatformStatistics } = await import('./tradingEngine');
  const payouts = [
    {
      id: 'po-1',
      traderName: 'Marcus Vance',
      username: '@marcus_fx',
      amountUsd: 12450.0,
      currency: 'USD (USDC)',
      status: 'Verified' as const,
      paymentDate: '2026-10-29',
      accountSize: 100000,
      programType: 'Two Step Challenge',
    },
    {
      id: 'po-2',
      traderName: 'Pending Trader',
      username: '@pending_tr',
      amountUsd: 9000.0,
      currency: 'USD (Wire)',
      status: 'Pending' as const,
      paymentDate: '2026-10-30',
      accountSize: 50000,
      programType: 'One Step Challenge',
    },
  ];

  const verified = filterVerifiedPayouts(payouts);
  assert.equal(verified.length, 1);
  assert.equal(verified[0].id, 'po-1');

  const stats = computeLivePlatformStatistics({
    registeredUsersCount: 5,
    accounts: [
      { status: 'active', userId: 'u1' },
      { status: 'passed', userId: 'u2' },
      { status: 'failed', userId: 'u3' },
    ],
    payouts,
    baselineTraders: 100,
    baselineFundedAccounts: 20,
    baselineActiveTraders: 10,
  });

  assert.equal(stats.totalRegisteredTraders, 105);
  assert.equal(stats.totalPayoutsUsd, 12450);
  assert.equal(stats.totalFundedAccounts, 22);
  assert.equal(stats.activeTraders, 11);
});

test('parseBinance24hrTicker and parseForexRatesToQuotes normalize real market API responses accurately', async () => {
  const { parseBinance24hrTicker, parseForexRatesToQuotes } = await import('./liveMarketFeed');

  const btcTick = parseBinance24hrTicker({
    symbol: 'BTCUSDT',
    bidPrice: '89420.50',
    askPrice: '89421.80',
    lastPrice: '89421.10',
    priceChangePercent: '3.42',
    highPrice: '90120.00',
    lowPrice: '86500.00',
  });
  assert.ok(btcTick);
  assert.equal(btcTick.symbol, 'BTCUSD');
  assert.equal(btcTick.bid, 89420.5);
  assert.equal(btcTick.change24hPct, 3.42);

  const ethTick = parseBinance24hrTicker({
    symbol: 'ETHUSDT',
    bidPrice: '3120.40',
    askPrice: '3120.80',
    lastPrice: '3120.60',
    priceChangePercent: '1.85',
    highPrice: '3180.00',
    lowPrice: '3050.00',
  });
  assert.ok(ethTick);
  assert.equal(ethTick.symbol, 'ETHUSD');
  assert.equal(ethTick.bid, 3120.4);

  // PAXGUSDT must NOT overwrite XAUUSD directly so Spot Gold never lags 100 pips behind XAU/USD
  const paxgIgnored = parseBinance24hrTicker({
    symbol: 'PAXGUSDT',
    bidPrice: '4105.80',
    askPrice: '4106.20',
  });
  assert.equal(paxgIgnored, null);

  const fxQuotes = parseForexRatesToQuotes(
    { EUR: 0.9225, GBP: 0.7712, JPY: 153.42 },
    {} as Record<any, MarketQuote>
  );
  assert.ok(fxQuotes.EURUSD);
  assert.ok(fxQuotes.GBPUSD);
  assert.ok(fxQuotes.USDJPY);
  assert.equal(fxQuotes.USDJPY?.bid, 153.42);
});

test('computeStripeCheckoutBreakdown and verifyUserCredentials enforce strict auth and owned-only coupons', async () => {
  const {
    computeStripeCheckoutBreakdown,
    validateStripeCardInput,
    hashPasswordVerifier,
    verifyUserCredentials,
  } = await import('./stripeCheckout');
  const { INITIAL_CHALLENGES } = await import('../data/platformData');

  // 1. Strict Password & Account Verification
  const registeredProfile = {
    email: 'trader@fundedapex.com',
    passwordHash: hashPasswordVerifier('trader@fundedapex.com', 'CorrectPass2026!'),
  };

  // Unregistered email must be rejected
  const missingUser = verifyUserCredentials(null, 'unknown@fundedapex.com', 'AnyPassword123');
  assert.equal(missingUser.ok, false);
  assert.equal(missingUser.reason, 'USER_NOT_FOUND');

  // Wrong password must be rejected
  const wrongPass = verifyUserCredentials(
    registeredProfile,
    'trader@fundedapex.com',
    'WrongPassword999'
  );
  assert.equal(wrongPass.ok, false);
  assert.equal(wrongPass.reason, 'WRONG_PASSWORD');

  // Exact matching password succeeds
  const rightPass = verifyUserCredentials(
    registeredProfile,
    'trader@fundedapex.com',
    'CorrectPass2026!'
  );
  assert.equal(rightPass.ok, true);

  // 2. Stripe Checkout & Owned-Only Coupons
  const ch5k = INITIAL_CHALLENGES.find((c) => c.id === 'two-step-5000')!;
  assert.equal(ch5k.priceUsd, 17);

  // Full price without coupon
  const full = computeStripeCheckoutBreakdown(ch5k, '', []);
  assert.equal(full.finalAmountUsd, 17);
  assert.equal(full.discountPct, 0);
  assert.equal(full.validCode, true);

  // Guessed prefix codes NOT in userCoupons must be strictly rejected
  const ch100k = INITIAL_CHALLENGES.find((c) => c.id === 'two-step-100000')!;
  const guessed90 = computeStripeCheckoutBreakdown(ch100k, 'APEX90-ABCD', []);
  assert.equal(guessed90.validCode, false);

  const guessedFree = computeStripeCheckoutBreakdown(ch100k, 'FREE5K2S-9988', []);
  assert.equal(guessedFree.validCode, false);

  // Owned coupon won by the user in userCoupons is accepted
  const ownedCoupons = [
    {
      id: 'cpn-1',
      userId: 'u-1',
      code: 'APEX90-WON1',
      label: '90% OFF Coupon',
      description: '90% discount',
      rewardType: 'coupon' as const,
      discountPct: 90,
      redeemed: false,
      createdAt: new Date().toISOString(),
    },
  ];
  const validOwned = computeStripeCheckoutBreakdown(ch100k, 'APEX90-WON1', ownedCoupons);
  assert.equal(validOwned.validCode, true);
  assert.equal(validOwned.discountPct, 90);
  assert.equal(validOwned.finalAmountUsd, 27.9);

  // Admin-created coupon code is accepted when active
  const adminCoupons = [
    {
      id: 'adm-cpn-1',
      code: 'APEX30',
      discountPct: 30,
      description: '30% Off Evaluation',
      active: true,
      targetChallengeId: 'ALL',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'adm-cpn-5k',
      code: '5K30OFF',
      discountPct: 30,
      description: '$5K Starter Challenge Promo — Only on $5K 2-Step Evaluation',
      active: true,
      targetChallengeId: 'two-step-5000',
      targetChallengeTitle: '$5,000 Two Step Challenge',
      singleEvaluationOnly: true,
      createdAt: new Date().toISOString(),
    },
  ];
  const validAdminCoupon = computeStripeCheckoutBreakdown(ch100k, 'apex30', [], adminCoupons);
  assert.equal(validAdminCoupon.validCode, true);
  assert.equal(validAdminCoupon.discountPct, 30);

  // Single-evaluation restricted coupon (5K30OFF -> two-step-5000) succeeds ONLY on $5K Two Step Challenge
  const valid5kOnly = computeStripeCheckoutBreakdown(ch5k, '5K30OFF', [], adminCoupons);
  assert.equal(valid5kOnly.validCode, true);
  assert.equal(valid5kOnly.discountPct, 30);
  assert.equal(valid5kOnly.finalAmountUsd, 11.9);

  // Single-evaluation restricted coupon (5K30OFF) MUST be rejected on other evaluations ($100K Two Step or $5K Instant)
  const rejectedOn100k = computeStripeCheckoutBreakdown(ch100k, '5K30OFF', [], adminCoupons);
  assert.equal(rejectedOn100k.validCode, false);
  assert.equal(rejectedOn100k.discountPct, 0);
  assert.ok(rejectedOn100k.errorMessage?.includes('$5,000 Two Step Challenge'));

  const chInstant5k = INITIAL_CHALLENGES.find((c) => c.id === 'instant-5000')!;
  const rejectedOnInstant5k = computeStripeCheckoutBreakdown(
    chInstant5k,
    '5K30OFF',
    [],
    adminCoupons
  );
  assert.equal(rejectedOnInstant5k.validCode, false);

  // Single-evaluation per-trader limit blocks repeat use when alreadyUsedCodesByUser contains the code
  const rejectedSecondUse = computeStripeCheckoutBreakdown(
    ch5k,
    '5K30OFF',
    [],
    adminCoupons,
    ['5K30OFF']
  );
  assert.equal(rejectedSecondUse.validCode, false);
  assert.ok(rejectedSecondUse.errorMessage?.includes('limited to 1 evaluation'));

  // Stripe card validation
  const validCard = validateStripeCardInput({
    cardNumber: '4242 4242 4242 4242',
    expiry: '12/28',
    cvc: '424',
    cardholderName: 'Alex Mercer',
    billingEmail: 'alex@fundedapex.com',
  });
  assert.equal(validCard.valid, true);
  assert.equal(validCard.last4, '4242');
});

test('buildTradePerformanceAnalytics computes cumulative equity curve, per-trade P&L, and KPI metrics for Recharts', async () => {
  const { buildTradePerformanceAnalytics } = await import('./performanceAnalytics');

  const mockAccount = {
    startingBalance: 10000,
    balance: 10350,
    profitTargetPct: 8,
    maxDrawdownPct: 10,
  };

  const mockOrders = [
    {
      id: 'o1',
      ticketId: 'TKT-1001',
      accountId: 'acc-1',
      userId: 'u-1',
      symbol: 'XAUUSD' as const,
      side: 'BUY' as const,
      orderType: 'MARKET' as const,
      volume: 1.0,
      entryPrice: 2850,
      currentPrice: 2855,
      exitPrice: 2855,
      stopLoss: 2840,
      takeProfit: 2870,
      grossPnl: 500,
      commission: 5,
      netPnl: 495,
      status: 'CLOSED' as const,
      openTime: '2026-10-30T10:00:00.000Z',
      closeTime: '2026-10-30T11:00:00.000Z',
    },
    {
      id: 'o2',
      ticketId: 'TKT-1002',
      accountId: 'acc-1',
      userId: 'u-1',
      symbol: 'EURUSD' as const,
      side: 'SELL' as const,
      orderType: 'MARKET' as const,
      volume: 1.0,
      entryPrice: 1.085,
      currentPrice: 1.0865,
      exitPrice: 1.0865,
      stopLoss: 1.09,
      takeProfit: 1.08,
      grossPnl: -140,
      commission: 5,
      netPnl: -145,
      status: 'CLOSED' as const,
      openTime: '2026-10-30T12:00:00.000Z',
      closeTime: '2026-10-30T13:00:00.000Z',
    },
  ];

  const analytics = buildTradePerformanceAnalytics(mockAccount, mockOrders);
  assert.equal(analytics.series.length, 3); // Initial + 2 trades
  assert.equal(analytics.series[0].equity, 10000);
  assert.equal(analytics.series[1].equity, 10495);
  assert.equal(analytics.series[2].equity, 10350);
  assert.equal(analytics.summary.totalTrades, 2);
  assert.equal(analytics.summary.winningTrades, 1);
  assert.equal(analytics.summary.losingTrades, 1);
  assert.equal(analytics.summary.winRatePct, 50);
  assert.equal(analytics.summary.cumulativeNetPnlUsd, 350);
  assert.equal(analytics.bySymbol.length, 2);
});

test('evaluateAccountPayoutEligibility enforces Instant vs 2-Step/3-Step completion, positive P&L, and drawdown breach blocks', async () => {
  const { evaluateAccountPayoutEligibility, evaluateAccountRiskMetrics } = await import('./tradingEngine');

  // 1. Instant Funded account with positive P&L -> immediately eligible for payout
  const instantProfitable: TradingAccountRecord = {
    ...sampleAccount,
    id: 'acc-instant-1',
    challengeType: 'instant',
    startingBalance: 50000,
    balance: 52000,
    equity: 52000,
    profitSplitPct: 90,
    peakEquity: 50000,
    dailyStartingEquity: 50000,
    lastDailyResetDate: '2026-10-30',
    status: 'active',
  };
  const instantElig = evaluateAccountPayoutEligibility(instantProfitable, []);
  assert.equal(instantElig.eligible, true);
  assert.equal(instantElig.netProfitUsd, 2000);
  assert.equal(instantElig.maxWithdrawableUsd, 1800); // 90% of $2,000

  // 2. Instant Funded account with 0 or negative P&L -> NOT eligible
  const instantNoProfit: TradingAccountRecord = {
    ...instantProfitable,
    balance: 49500,
    equity: 49500,
  };
  const instantNoProfitElig = evaluateAccountPayoutEligibility(instantNoProfit, []);
  assert.equal(instantNoProfitElig.eligible, false);

  // 3. 2-Step Evaluation account still in Step 1 ('active') -> NOT eligible even if in profit
  const twoStepActive: TradingAccountRecord = {
    ...sampleAccount,
    challengeType: 'two_step',
    currentStep: 1,
    totalSteps: 2,
    startingBalance: 50000,
    balance: 54500,
    equity: 54500,
    profitSplitPct: 90,
    status: 'active',
  };
  const twoStepActiveElig = evaluateAccountPayoutEligibility(twoStepActive, []);
  assert.equal(twoStepActiveElig.eligible, false);

  // 4. 2-Step Evaluation account after passing both steps (+8% Step 1 & +5% Step 2 = +13% -> $56,500) -> Eligible!
  const twoStepPassed: TradingAccountRecord = {
    ...twoStepActive,
    currentStep: 2,
    balance: 56500,
    equity: 56500,
    status: 'passed',
  };
  const twoStepPassedElig = evaluateAccountPayoutEligibility(twoStepPassed, []);
  assert.equal(twoStepPassedElig.eligible, true);
  assert.equal(twoStepPassedElig.maxWithdrawableUsd, 5850); // 90% of $6,500

  // 5. 3-Step Evaluation account ('three_step') active vs passed (+6% * 3 = +18% -> $118,000)
  const threeStepActive: TradingAccountRecord = {
    ...sampleAccount,
    challengeType: 'three_step',
    currentStep: 2,
    totalSteps: 3,
    startingBalance: 100000,
    balance: 106000,
    equity: 106000,
    profitSplitPct: 95,
    status: 'active',
  };
  assert.equal(evaluateAccountPayoutEligibility(threeStepActive, []).eligible, false);

  const threeStepPassed: TradingAccountRecord = {
    ...threeStepActive,
    currentStep: 3,
    balance: 118000,
    equity: 118000,
    status: 'passed',
  };
  const threeStepPassedElig = evaluateAccountPayoutEligibility(threeStepPassed, []);
  assert.equal(threeStepPassedElig.eligible, true);
  assert.equal(threeStepPassedElig.maxWithdrawableUsd, 17100); // 95% of $18,000 (+18% cumulative)

  // 6. Passed account that subsequently hits Maximum or Daily Drawdown -> Auto-breaches to 'failed' and blocks payouts
  const breachedMetrics = evaluateAccountRiskMetrics(
    {
      ...twoStepPassed,
      balance: 44500, // -$5,500 loss on $50k (exceeds 10% max drawdown & 5% daily drawdown)
    },
    []
  );
  assert.equal(breachedMetrics.nextStatus, 'failed');
  assert.ok(breachedMetrics.breachReason?.includes('Drawdown Limit Breached'));
});

test('Firebase Cloud Functions buildTerminalCredentialsEmailPayload formats automated terminal credentials email from fundedapexsupport@gmail.com', async () => {
  const { buildTerminalCredentialsEmailPayload } = await import('./cloudFunctionsEmail');
  const mail = buildTerminalCredentialsEmailPayload({
    recipientEmail: 'trader@gmail.com',
    recipientName: 'Ritik Trader',
    accountId: 'acc-100201',
    accountNumber: 'FA-100201',
    challengeId: 'ch-100k-2step',
    challengeTitle: '$100,000 2-Step Evaluation',
    terminalUserId: 'FAU-100K2S-9988',
    terminalPassword: 'FAP-100K-774422',
    triggeredBy: 'admin_account_update',
  });

  assert.equal(mail.to, 'trader@gmail.com');
  assert.equal(mail.sender, 'FUNDED APEX <fundedapexsupport@gmail.com>');
  assert.equal(mail.domain, 'fundedapex.com');
  assert.ok(mail.htmlBody.includes('FAU-100K2S-9988'));
  assert.ok(mail.htmlBody.includes('FAP-100K-774422'));
  assert.ok(mail.htmlBody.includes('fundedapexsupport@gmail.com'));
});

test('resolveChallengeRulesForAccount and evaluateAccountRiskMetrics enforce accurate Daily DD, Max DD, and Profit Target per Challenge Type and Step', async () => {
  const { resolveChallengeRulesForAccount, evaluateAccountRiskMetrics } = await import(
    './tradingEngine'
  );

  // 1. Instant Funding: 3% Daily DD, 6% Max DD, 0% Profit Target (Direct Funded), 1:30 Leverage
  const instantRules = resolveChallengeRulesForAccount({
    challengeId: 'instant-10000',
    challengeType: 'instant',
  });
  assert.equal(instantRules.dailyDrawdownPct, 3);
  assert.equal(instantRules.maxDrawdownPct, 6);
  assert.equal(instantRules.profitTargetPct, 0);
  assert.equal(instantRules.leverage, 30);

  // 2. 1-Step Evaluation: 4% Daily DD, 6% Max DD, 10% Profit Target, 1:50 Leverage
  const oneStepRules = resolveChallengeRulesForAccount({
    challengeId: 'one-step-25000',
    challengeType: 'one_step',
  });
  assert.equal(oneStepRules.dailyDrawdownPct, 4);
  assert.equal(oneStepRules.maxDrawdownPct, 6);
  assert.equal(oneStepRules.profitTargetPct, 10);
  assert.equal(oneStepRules.leverage, 50);

  // 3. 2-Step Evaluation Phase 1 (8% Target) vs Phase 2 (5% Target), 5% Daily DD, 10% Max DD, 1:100 Leverage
  const twoStepPhase1 = resolveChallengeRulesForAccount({
    challengeId: 'two-step-50000',
    challengeType: 'two_step',
    currentStep: 1,
  });
  assert.equal(twoStepPhase1.dailyDrawdownPct, 5);
  assert.equal(twoStepPhase1.maxDrawdownPct, 10);
  assert.equal(twoStepPhase1.profitTargetPct, 8);
  assert.equal(twoStepPhase1.leverage, 100);

  const twoStepPhase2 = resolveChallengeRulesForAccount({
    challengeId: 'two-step-50000',
    challengeType: 'two_step',
    currentStep: 2,
  });
  assert.equal(twoStepPhase2.profitTargetPct, 5);

  // 4. 3-Step Evaluation: 5% Daily DD, 12% Max DD, 6% Profit Target per step
  const threeStepRules = resolveChallengeRulesForAccount({
    challengeId: 'three-step-100000',
    challengeType: 'three_step',
    currentStep: 2,
  });
  assert.equal(threeStepRules.dailyDrawdownPct, 5);
  assert.equal(threeStepRules.maxDrawdownPct, 12);
  assert.equal(threeStepRules.profitTargetPct, 6);

  // 5. Legacy/Preview account with profitTargetPct: 0 is auto-corrected by evaluateAccountRiskMetrics
  const previewMetrics = evaluateAccountRiskMetrics(
    {
      ...sampleAccount,
      accountSize: 5000,
      startingBalance: 5000,
      balance: 5200,
      equity: 5200,
      profitTargetPct: 0,
      dailyDrawdownPct: 0,
      maxDrawdownPct: 0,
      challengeId: 'two-step-5000',
      challengeType: 'two_step',
      currentStep: 1,
    },
    []
  );
  assert.equal(previewMetrics.dailyDrawdownPct, 5);
  assert.equal(previewMetrics.maxDrawdownPct, 10);
  assert.equal(previewMetrics.profitTargetPct, 8);
  assert.equal(previewMetrics.dailyLossLimitUsd, 250);
  assert.equal(previewMetrics.maxLossLimitUsd, 500);
  assert.equal(previewMetrics.profitTargetUsd, 400);
  assert.equal(previewMetrics.profitProgressPct, 50); // +$200 of +$400 target = 50%
});

test('profitable accounts never breach and Instant accounts enforce 15% consistency rule in payout eligibility', async () => {
  const {
    resolveChallengeRulesForAccount,
    evaluateAccountRiskMetrics,
    evaluateAccountPayoutEligibility,
  } = await import('./tradingEngine');

  // 1. Account in net profit ($5,600 balance with -$350 floating PnL => $5,250 equity > $5,000 start) MUST NEVER breach
  const profitableAcc: TradingAccountRecord = {
    ...sampleAccount,
    accountSize: 5000,
    startingBalance: 5000,
    balance: 5600,
    equity: 5250,
    peakEquity: 5600,
    dailyStartingEquity: 5000,
    lastDailyResetDate: '2026-11-07',
    dailyDrawdownPct: 5,
    maxDrawdownPct: 10,
    status: 'active',
  };
  const openPullbackOrder: TradeOrderRecord = {
    id: 'ord-pb',
    ticketId: 'TKT-9001',
    accountId: profitableAcc.id,
    userId: profitableAcc.userId,
    symbol: 'XAUUSD',
    side: 'BUY',
    orderType: 'MARKET',
    volume: 1,
    entryPrice: 4045,
    currentPrice: 4041.5,
    exitPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    grossPnl: -345,
    commission: 5,
    netPnl: -350,
    status: 'OPEN',
    openTime: '2026-11-07T00:00:00Z',
    closeTime: '',
  };
  const profMetrics = evaluateAccountRiskMetrics(profitableAcc, [openPullbackOrder]);
  assert.equal(profMetrics.equity, 5250);
  assert.equal(profMetrics.overallDropUsd, 0);
  assert.equal(profMetrics.dailyDropUsd, 0);
  assert.notEqual(profMetrics.nextStatus, 'failed');

  // 2. 15% Consistency Rule is 15% on 'instant' and 0% on 'one_step', 'two_step', 'three_step'
  assert.equal(resolveChallengeRulesForAccount({ challengeType: 'instant' }).consistencyRulePct, 15);
  assert.equal(resolveChallengeRulesForAccount({ challengeType: 'one_step' }).consistencyRulePct, 0);
  assert.equal(resolveChallengeRulesForAccount({ challengeType: 'two_step' }).consistencyRulePct, 0);
  assert.equal(resolveChallengeRulesForAccount({ challengeType: 'three_step' }).consistencyRulePct, 0);

  // 3. Single oversized closed trade (>15% of total profit) blocks Instant payout, but NOT 2-Step passed payout
  const instantAcc: TradingAccountRecord = {
    ...sampleAccount,
    id: 'acc-inst-cons',
    challengeType: 'instant',
    startingBalance: 10000,
    balance: 10500,
    equity: 10500,
    peakEquity: 10500,
    dailyStartingEquity: 10000,
    lastDailyResetDate: '2026-11-07',
    status: 'active',
  };
  const bigClosedTrade: TradeOrderRecord = {
    ...openPullbackOrder,
    id: 'ord-big',
    accountId: 'acc-inst-cons',
    netPnl: 400, // 80% of $500 total profit (> 15% limit)
    status: 'CLOSED',
  };
  const instantEligViolated = evaluateAccountPayoutEligibility(instantAcc, [], [bigClosedTrade]);
  assert.equal(instantEligViolated.isConsistencyViolated, true);
  assert.equal(instantEligViolated.eligible, false);

  const twoStepPassedAcc: TradingAccountRecord = {
    ...instantAcc,
    id: 'acc-2s-cons',
    challengeType: 'two_step',
    currentStep: 2,
    totalSteps: 2,
    balance: 11300,
    equity: 11300,
    status: 'passed',
  };
  const twoStepElig = evaluateAccountPayoutEligibility(
    twoStepPassedAcc,
    [],
    [{ ...bigClosedTrade, accountId: 'acc-2s-cons', netPnl: 1300 }]
  );
  assert.equal(twoStepElig.isConsistencyViolated, false);
  assert.equal(twoStepElig.eligible, true);
});

test('buildSpotAnchoredCandles and alignCandlesToSpot preserve natural live and historical candlestick wicks', async () => {
  const { buildSpotAnchoredCandles, alignCandlesToSpot } = await import('./liveMarketFeed');

  for (const tf of ['1m', '5m', '15m', '1h', '1d']) {
    const candles = buildSpotAnchoredCandles('XAUUSD', tf, 4045.25);
    assert.ok(candles.length >= 80);

    // Every candle including the live forming candle (last candle) must have visible upper and lower wicks
    const liveCandle = candles[candles.length - 1];
    assert.equal(liveCandle.close, 4045.25);
    assert.ok(
      liveCandle.high > Math.max(liveCandle.open, liveCandle.close),
      `Expected live candle on ${tf} to have upper wick`
    );
    assert.ok(
      liveCandle.low < Math.min(liveCandle.open, liveCandle.close),
      `Expected live candle on ${tf} to have lower wick`
    );

    const aligned = alignCandlesToSpot(candles, 'XAUUSD', 4046.1);
    const alignedLive = aligned[aligned.length - 1];
    assert.equal(alignedLive.close, 4046.1);
    assert.ok(alignedLive.high > Math.max(alignedLive.open, alignedLive.close));
    assert.ok(alignedLive.low < Math.min(alignedLive.open, alignedLive.close));
  }
});

test('evaluateAccountRiskMetrics attaches Evaluation P&L directly to Max Drawdown, Daily Drawdown, and Profit Target', () => {
  // Case 1: Evaluation P&L is in profit (+$420 realized, -$70 floating => +$350 net evaluation P&L on $10,000 start)
  // Max Drawdown and Daily Drawdown MUST be $0.00 (0%), and Profit Target progress reflects +$350.00
  const inProfitAcc: TradingAccountRecord = {
    ...sampleAccount,
    accountSize: 10000,
    startingBalance: 10000,
    balance: 10420,
    equity: 10350,
    peakEquity: 10500,
    dailyStartingEquity: 10420,
    profitTargetPct: 8,
    dailyDrawdownPct: 5,
    maxDrawdownPct: 10,
    status: 'active',
  };
  const openOrderLoss70: TradeOrderRecord = {
    id: 'ord-dd-1',
    ticketId: 'TKT-7701',
    accountId: inProfitAcc.id,
    userId: inProfitAcc.userId,
    symbol: 'XAUUSD',
    side: 'BUY',
    orderType: 'MARKET',
    volume: 0.5,
    entryPrice: 4050,
    currentPrice: 4048.6,
    exitPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    grossPnl: -67.5,
    commission: 2.5,
    netPnl: -70,
    status: 'OPEN',
    openTime: '2026-11-09T00:00:00Z',
    closeTime: '',
  };
  const profitMetrics = evaluateAccountRiskMetrics(inProfitAcc, [openOrderLoss70]);
  assert.equal(profitMetrics.equity, 10350);
  assert.equal(profitMetrics.netGainUsd, 350);
  assert.equal(profitMetrics.profitTargetUsd, 800);
  assert.equal(profitMetrics.profitProgressPct, 43.75);
  assert.equal(profitMetrics.overallDropUsd, 0);
  assert.equal(profitMetrics.maxDrawdownUsedPct, 0);
  assert.equal(profitMetrics.dailyDropUsd, 0);
  assert.equal(profitMetrics.dailyDrawdownUsedPct, 0);

  // Case 2: Evaluation P&L is in loss (-$250 realized, -$150 floating => -$400 net evaluation P&L on $10,000 start)
  // Max Drawdown and Daily Drawdown MUST equal $400.00 (40% of $1,000 Max DD limit, 80% of $500 Daily DD limit)
  const inLossAcc: TradingAccountRecord = {
    ...inProfitAcc,
    balance: 9750,
    equity: 9600,
    peakEquity: 10000,
    dailyStartingEquity: 10000,
  };
  const openOrderLoss150: TradeOrderRecord = {
    ...openOrderLoss70,
    netPnl: -150,
  };
  const lossMetrics = evaluateAccountRiskMetrics(inLossAcc, [openOrderLoss150]);
  assert.equal(lossMetrics.equity, 9600);
  assert.equal(lossMetrics.netGainUsd, 0);
  assert.equal(lossMetrics.profitProgressPct, 0);
  assert.equal(lossMetrics.overallDropUsd, 400);
  assert.equal(lossMetrics.maxLossLimitUsd, 1000);
  assert.equal(lossMetrics.maxDrawdownUsedPct, 40);
  assert.equal(lossMetrics.dailyDropUsd, 400);
  assert.equal(lossMetrics.dailyLossLimitUsd, 500);
  assert.equal(lossMetrics.dailyDrawdownUsedPct, 80);
});

test('FUNDED APEX email notification builders generate branded emails with clear CTAs for registration, password reset, challenge status updates, and promotions', async () => {
  const {
    buildRegistrationWelcomeEmailPayload,
    buildPasswordResetEmailPayload,
    buildChallengeStatusUpdateEmailPayload,
    buildPromotionalOfferEmailPayload,
  } = await import('./cloudFunctionsEmail');

  // 1. Registration Welcome Email
  const regMail = buildRegistrationWelcomeEmailPayload({
    recipientEmail: 'newtrader@fundedapex.com',
    recipientName: 'Aarav Sharma',
    referralCode: 'APEX-AARAV',
    country: 'India',
  });
  assert.equal(regMail.eventType, 'registration_welcome');
  assert.equal(regMail.to, 'newtrader@fundedapex.com');
  assert.ok(regMail.subject.includes('FUNDED APEX'));
  assert.ok(regMail.html.includes('FUNDED'));
  assert.ok(regMail.html.includes('Aarav Sharma'));
  assert.ok(regMail.ctaLabel.length > 0);
  assert.ok(regMail.ctaUrl.startsWith('https://fundedapex.com'));

  // 2. Password Reset Email
  const resetMail = buildPasswordResetEmailPayload({
    recipientEmail: 'newtrader@fundedapex.com',
    recipientName: 'Aarav Sharma',
    resetCodeOrPassword: 'APEX-RST-889900',
    initiatedBy: 'user_self_service',
  });
  assert.equal(resetMail.eventType, 'password_reset');
  assert.ok(resetMail.subject.includes('FUNDED APEX'));
  assert.ok(resetMail.html.includes('APEX-RST-889900'));
  assert.ok(resetMail.ctaLabel.includes('Password') || resetMail.ctaLabel.includes('Account'));

  // 3. Challenge Status Updates: passed, failed, suspended
  const passedMail = buildChallengeStatusUpdateEmailPayload({
    recipientEmail: 'newtrader@fundedapex.com',
    recipientName: 'Aarav Sharma',
    accountNumber: 'FA-501122',
    challengeId: 'two-step-50000',
    challengeTitle: 'Two Step Challenge ($50,000)',
    accountSize: 50000,
    status: 'passed',
    currentBalance: 54200,
    currentEquity: 54200,
    profitSplitPct: 90,
  });
  assert.equal(passedMail.eventType, 'challenge_status_update');
  assert.equal(passedMail.challengeStatus, 'passed');
  assert.ok(passedMail.subject.includes('PASSED'));
  assert.ok(passedMail.ctaLabel.includes('Payout') || passedMail.ctaLabel.includes('Dashboard'));

  const failedMail = buildChallengeStatusUpdateEmailPayload({
    recipientEmail: 'newtrader@fundedapex.com',
    recipientName: 'Aarav Sharma',
    accountNumber: 'FA-501122',
    challengeId: 'two-step-50000',
    challengeTitle: 'Two Step Challenge ($50,000)',
    accountSize: 50000,
    status: 'failed',
    reason: 'Maximum Drawdown Limit Breached (-10.2%)',
    currentBalance: 44900,
    currentEquity: 44900,
  });
  assert.equal(failedMail.challengeStatus, 'failed');
  assert.ok(failedMail.subject.includes('Update'));
  assert.ok(failedMail.html.includes('Maximum Drawdown Limit Breached'));
  assert.ok(failedMail.ctaLabel.includes('20% OFF') || failedMail.ctaLabel.includes('Evaluation'));

  const suspendedMail = buildChallengeStatusUpdateEmailPayload({
    recipientEmail: 'newtrader@fundedapex.com',
    recipientName: 'Aarav Sharma',
    accountNumber: 'FA-501122',
    challengeId: 'two-step-50000',
    challengeTitle: 'Two Step Challenge ($50,000)',
    accountSize: 50000,
    status: 'suspended',
    reason: 'Account suspended pending Compliance & Risk review.',
  });
  assert.equal(suspendedMail.challengeStatus, 'suspended');
  assert.ok(suspendedMail.subject.includes('Suspended'));
  assert.ok(suspendedMail.ctaLabel.includes('Compliance') || suspendedMail.ctaLabel.includes('Review'));

  // 4. Promotional Offer Email
  const promoMail = buildPromotionalOfferEmailPayload({
    recipientEmail: 'all@fundedapex.com',
    recipientName: 'FUNDED APEX Traders',
    offerTitle: '$5K Starter 30% OFF Flash Sale',
    discountPct: 30,
    promoCode: '5K30OFF',
    challengeId: 'two-step-5000',
    challengeTitle: '$5K Two-Step Evaluation',
    originalPriceUsd: 10,
    discountedPriceUsd: 7,
  });
  assert.equal(promoMail.eventType, 'promotional_offer');
  assert.equal(promoMail.promoCode, '5K30OFF');
  assert.ok(promoMail.html.includes('5K30OFF'));
  assert.ok(promoMail.ctaLabel.includes('30% OFF'));
});

test('buildCustomManualEmailPayload formats institutional HTML with custom badge, body, highlights, and CTA button', async () => {
  const { buildCustomManualEmailPayload } = await import('./cloudFunctionsEmail');

  const manualEmail = buildCustomManualEmailPayload({
    recipientEmail: 'vip.trader@fundedapex.com',
    recipientName: 'Vikram Mehta',
    subject: 'Urgent: Institutional Risk Review for Account #FA-992104',
    headline: 'Executive Account Assessment',
    subheadline: 'Review of risk compliance and profit allocation metrics',
    badgeText: 'RISK AUDIT PASSED',
    badgeColor: '#00FFA3',
    bodyText: `Dear Vikram,\n\nWe have reviewed your recent trading metrics on Account #FA-992104. All daily drawdown, max drawdown, and risk exposure parameters comply strictly with institutional rules.\n\nPlease proceed to submit your payout request via the Trader Dashboard.`,
    highlights: [
      { label: 'Account Number', value: 'FA-992104' },
      { label: 'Audit Status', value: '100% Compliant' },
      { label: 'Calculated Profit Split', value: '$12,450.00 (90%)' },
      { label: 'Eligible Payout Date', value: 'Immediate' },
    ],
    ctaLabel: 'Open Payout Request in Dashboard',
    ctaUrl: 'https://fundedapex.com/dashboard?tab=payouts',
    ctaColor: '#00FFA3',
    adminNotes: 'Manual risk assessment verified by Lead Risk Officer.',
  });

  assert.equal(manualEmail.eventType, 'custom_manual');
  assert.equal(manualEmail.to, 'vip.trader@fundedapex.com');
  assert.equal(manualEmail.subject, 'Urgent: Institutional Risk Review for Account #FA-992104');
  assert.ok(manualEmail.html.includes('Executive Account Assessment'));
  assert.ok(manualEmail.html.includes('RISK AUDIT PASSED'));
  assert.ok(manualEmail.html.includes('FA-992104'));
  assert.ok(manualEmail.html.includes('$12,450.00 (90%)'));
  assert.ok(manualEmail.html.includes('Open Payout Request in Dashboard'));
  assert.ok(manualEmail.html.includes('https://fundedapex.com/dashboard?tab=payouts'));
  assert.ok(manualEmail.html.includes('fundedapexsupport@gmail.com'));
});

test('getTimeframeSeconds and live market feed supports 1W and 1M candlestick charts up to 1 Month', async () => {
  const { getTimeframeSeconds, getTimeframeStepMultiplier } = await import('./liveMarketFeed');

  assert.equal(getTimeframeSeconds('1m'), 60);
  assert.equal(getTimeframeSeconds('5m'), 300);
  assert.equal(getTimeframeSeconds('1h'), 3600);
  assert.equal(getTimeframeSeconds('1d'), 86400);
  assert.equal(getTimeframeSeconds('1W'), 604800);
  assert.equal(getTimeframeSeconds('1M'), 2592000);

  assert.ok(getTimeframeStepMultiplier('1W') > 5);
  assert.ok(getTimeframeStepMultiplier('1M') > 10);
});

test('calculateOrderPnlSnapshot and evaluateAccountRiskMetrics explicitly stop updating PnL once position state is marked closed', async () => {
  const { calculateOrderPnlSnapshot, evaluateAccountRiskMetrics } = await import('./tradingEngine');

  const closedOrder = {
    id: 'ord-closed-1',
    ticketId: '900101',
    accountId: 'acc-1',
    userId: 'usr-1',
    symbol: 'XAUUSD' as const,
    side: 'BUY' as const,
    orderType: 'MARKET' as const,
    volume: 1,
    entryPrice: 4700,
    currentPrice: 4725,
    exitPrice: 4725,
    stopLoss: 0,
    takeProfit: 0,
    status: 'CLOSED' as const,
    grossPnl: 2500,
    commission: 7,
    netPnl: 2493,
    openTime: '2026-11-10T01:00:00.000Z',
    closeTime: '2026-11-10T02:00:00.000Z',
  };

  // Even when live market quote moves drastically to 4950, closed position PnL remains frozen at 2493
  const movedQuote = {
    symbol: 'XAUUSD' as const,
    bid: 4950,
    ask: 4950.35,
    last: 4950.17,
    change24hPct: 1.5,
    high24h: 4960,
    low24h: 4680,
    timestamp: Date.now(),
  };

  const snap = calculateOrderPnlSnapshot(closedOrder, movedQuote);
  assert.equal(snap.isStatic, true);
  assert.equal(snap.currentPrice, 4725);
  assert.equal(snap.netPnl, 2493);

  // Also test evaluateAccountRiskMetrics ignores any closed order passed in openOrders array
  const acc = {
    id: 'acc-1',
    accountNumber: 'FA-100001',
    userId: 'usr-1',
    challengeId: 'two-step-50000',
    challengeTitle: '2-Step $50K',
    challengeType: 'two_step' as const,
    accountSize: 50000,
    startingBalance: 50000,
    balance: 52493,
    equity: 52493,
    usedMargin: 0,
    freeMargin: 52493,
    profitTargetPct: 8,
    dailyDrawdownPct: 5,
    maxDrawdownPct: 10,
    minTradingDays: 3,
    tradingDaysCount: 3,
    leverage: 100,
    profitSplitPct: 90,
    currentStep: 1,
    totalSteps: 2,
    peakEquity: 52493,
    dailyStartingEquity: 50000,
    lastDailyResetDate: '2026-11-10',
    status: 'active' as const,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
  };
  const metrics = evaluateAccountRiskMetrics(acc, [closedOrder]);
  assert.equal(metrics.floatingPnl, 0);
  assert.equal(metrics.equity, 52493);
});

test('mergeUserDirectories preserves passwords, deduplicates by email, and never lets stale/seed records overwrite user passwords', async () => {
  const { mergeUserDirectories, mergeUserProfileRecords } = await import('./userVault');
  type VaultUserRecord = import('./userVault').VaultUserRecord;
  const { hashPasswordVerifier, verifyUserCredentials } = await import('./stripeCheckout');

  const seedAdmin: VaultUserRecord = {
    uid: 'admin-owner-1',
    fullName: 'Owner Seed',
    email: 'kingritikx0343@gmail.com',
    country: 'India',
    referralCode: 'APEX-OWNER',
    role: 'super_admin',
    rewardPoints: 0,
    mfaEnabled: true,
    deletionRequested: false,
    passwordHash: hashPasswordVerifier('kingritikx0343@gmail.com', 'ApexAdmin2026!'),
    passwordUpdatedAt: 0,
    isSeedDefault: true,
    createdAt: '2026-11-01T00:00:00.000Z',
  };

  const realUserUpdate: VaultUserRecord = {
    uid: 'fb-uid-999',
    fullName: 'Ritik Real',
    email: 'KINGRITIKX0343@GMAIL.COM',
    country: 'India',
    referralCode: 'APEX-OWNER',
    role: 'user',
    rewardPoints: 450,
    mfaEnabled: true,
    deletionRequested: false,
    passwordHash: hashPasswordVerifier('kingritikx0343@gmail.com', 'MyCustomSecret2026!'),
    passwordUpdatedAt: 1700000100000,
    isSeedDefault: false,
    createdAt: '2026-11-05T00:00:00.000Z',
  };

  // Seed record arriving after real user record must NOT overwrite password or rewardPoints or downgrade super_admin
  const mergedForward = mergeUserDirectories([realUserUpdate], [seedAdmin]);
  assert.equal(mergedForward.length, 1);
  assert.equal(mergedForward[0].email, 'kingritikx0343@gmail.com');
  assert.equal(mergedForward[0].passwordHash, realUserUpdate.passwordHash);
  assert.equal(mergedForward[0].rewardPoints, 450);
  assert.equal(mergedForward[0].role, 'super_admin');

  // Newer passwordUpdatedAt always wins over older timestamp, while stale tab cannot revert it
  const newerPasswordRecord: VaultUserRecord = {
    ...realUserUpdate,
    passwordHash: hashPasswordVerifier('kingritikx0343@gmail.com', 'NewUpdatedPass2026!'),
    passwordUpdatedAt: 1700000200000,
  };
  const afterStaleTabSync = mergeUserDirectories([newerPasswordRecord], [realUserUpdate]);
  assert.equal(afterStaleTabSync.length, 1);
  assert.equal(afterStaleTabSync[0].passwordHash, newerPasswordRecord.passwordHash);

  // Passwordless update (e.g. from Firebase onAuthStateChanged or guest profile) never deletes existing passwordHash
  const authShell: VaultUserRecord = {
    uid: 'fb-uid-999',
    fullName: 'Ritik Real',
    email: 'kingritikx0343@gmail.com',
    country: 'United States',
    referralCode: 'APEX-OWNER',
    role: 'user',
    rewardPoints: 0,
    mfaEnabled: false,
    deletionRequested: false,
    createdAt: '2026-11-12T00:00:00.000Z',
  };
  const preserved = mergeUserProfileRecords(newerPasswordRecord, authShell);
  assert.equal(preserved.passwordHash, newerPasswordRecord.passwordHash);
  assert.equal(preserved.country, 'India');
  assert.equal(preserved.rewardPoints, 450);

  // verifyUserCredentials distinguishes SSO/guest accounts without passwordHash from wrong passwords
  const noPwRes = verifyUserCredentials(authShell, 'kingritikx0343@gmail.com', 'anything');
  assert.equal(noPwRes.ok, false);
  assert.equal(noPwRes.reason, 'NO_PASSWORD_SET');

  // Seed default account (even if saved to localStorage without isSeedDefault flag) adopts the user's password on login without false "Incorrect password"
  const legacySavedSeedAdmin: VaultUserRecord = {
    ...seedAdmin,
    isSeedDefault: undefined,
  };
  const adoptedSeedLogin = verifyUserCredentials(
    legacySavedSeedAdmin,
    'kingritikx0343@gmail.com',
    'MyOwnExistingPass2026!'
  );
  assert.equal(adoptedSeedLogin.ok, true);
  assert.equal(adoptedSeedLogin.adoptedSeedPassword, true);

  // Once a real user password is set, wrong passwords are strictly rejected
  const wrongLogin = verifyUserCredentials(preserved, 'kingritikx0343@gmail.com', 'WrongPass999!');
  assert.equal(wrongLogin.ok, false);
  assert.equal(wrongLogin.reason, 'WRONG_PASSWORD');

  // Exact login with trimmed/mixed-case email passes cleanly
  const validLogin = verifyUserCredentials(preserved, '  KingRitikX0343@gmail.com  ', 'NewUpdatedPass2026!');
  assert.equal(validLogin.ok, true);
});

test('2-Step evaluation preserves Step 1 profit when advancing to Step 2 and keeps payouts locked until Step 2 (+5%) is passed', async () => {
  const { evaluateAccountRiskMetrics, evaluateAccountPayoutEligibility } = await import(
    './tradingEngine'
  );

  // Step 1 ($50,000 2-Step): Trader earns +$4,000 (+8%) realized profit -> Step 1 completed
  const step1DoneAcc: TradingAccountRecord = {
    ...sampleAccount,
    id: 'acc-2step-prog',
    challengeType: 'two_step',
    startingBalance: 50000,
    phaseStartingBalance: 50000,
    balance: 54000,
    equity: 54000,
    currentStep: 1,
    totalSteps: 2,
    profitTargetPct: 8,
    profitSplitPct: 90,
    status: 'active',
  };
  const m1 = evaluateAccountRiskMetrics(step1DoneAcc, []);
  assert.equal(m1.stepCompleted, true);
  assert.equal(m1.realizedPnl, 4000);
  assert.equal(evaluateAccountPayoutEligibility(step1DoneAcc, []).eligible, false);

  // Advance to Step 2: phaseStartingBalance becomes $54,000, Step 1 profit (+$4,000) is preserved, Step 2 target is +5% ($2,500)
  const step2ActiveAcc: TradingAccountRecord = {
    ...step1DoneAcc,
    currentStep: 2,
    phaseStartingBalance: 54000,
    profitTargetPct: 5,
    status: 'active',
  };
  const m2Start = evaluateAccountRiskMetrics(step2ActiveAcc, []);
  assert.equal(m2Start.realizedPnl, 4000); // Step 1 profit is NOT cut!
  assert.equal(m2Start.netGainUsd, 0); // Step 2 progress starts at $0 of $2,500
  assert.equal(m2Start.profitTargetUsd, 2500);
  assert.equal(m2Start.stepCompleted, false); // Does NOT auto-pass Step 2!

  const step2PayoutCheck = evaluateAccountPayoutEligibility(step2ActiveAcc, []);
  assert.equal(step2PayoutCheck.eligible, false);
  assert.equal(step2PayoutCheck.maxWithdrawableUsd, 0);
  assert.ok(step2PayoutCheck.reason.includes('Step 2 of 2'));

  // Earn +$2,500 (+5%) in Step 2 -> reaches $56,500 -> passes Step 2 -> Funded & Payout Unlocked!
  const step2CompletedMetrics = evaluateAccountRiskMetrics(
    { ...step2ActiveAcc, balance: 56500, equity: 56500 },
    []
  );
  assert.equal(step2CompletedMetrics.stepCompleted, true);
  assert.equal(step2CompletedMetrics.nextStatus, 'passed');

  const fundedPassedAcc: TradingAccountRecord = {
    ...step2ActiveAcc,
    balance: 56500,
    equity: 56500,
    status: 'passed',
  };
  const fundedPayoutCheck = evaluateAccountPayoutEligibility(fundedPassedAcc, []);
  assert.equal(fundedPayoutCheck.eligible, true);
  assert.equal(fundedPayoutCheck.realizedProfitUsd, 6500);
  assert.equal(fundedPayoutCheck.maxWithdrawableUsd, 5850); // 90% of $6,500
});

test('all challenge programs strictly enforce evaluation gates, open position locks, and Instant 15% consistency rule', async () => {
  const {
    getMinimumPhaseStartBalance,
    getRequiredCumulativeEvaluationProfitUsd,
    evaluateAccountRiskMetrics,
    evaluateAccountPayoutEligibility,
  } = await import('./tradingEngine');

  // 1. Cumulative evaluation profit requirements
  assert.equal(getRequiredCumulativeEvaluationProfitUsd(100000, 'instant'), 0);
  assert.equal(getRequiredCumulativeEvaluationProfitUsd(100000, 'one_step'), 10000);
  assert.equal(getRequiredCumulativeEvaluationProfitUsd(100000, 'two_step'), 13000);
  assert.equal(getRequiredCumulativeEvaluationProfitUsd(100000, 'three_step'), 18000);

  // 2. Even if phaseStartingBalance was missing on a Step 2 account, getMinimumPhaseStartBalance enforces $108,000 on $100k 2-step
  assert.equal(getMinimumPhaseStartBalance(100000, 'two_step', 2, undefined), 108000);
  assert.equal(getMinimumPhaseStartBalance(100000, 'three_step', 2, undefined), 106000);
  assert.equal(getMinimumPhaseStartBalance(100000, 'three_step', 3, undefined), 112000);

  const step2MissingPhaseBase: TradingAccountRecord = {
    ...sampleAccount,
    id: 'acc-2s-missing-base',
    challengeType: 'two_step',
    startingBalance: 100000,
    phaseStartingBalance: 100000, // stale/unupdated value
    balance: 108500, // Only +8.5% total (+0.5% in Step 2, needs +5% = $113,000)
    equity: 108500,
    currentStep: 2,
    totalSteps: 2,
    status: 'active',
  };
  const step2Metrics = evaluateAccountRiskMetrics(step2MissingPhaseBase, []);
  assert.equal(step2Metrics.stepCompleted, false);
  assert.equal(step2Metrics.nextStatus, 'active');
  assert.equal(evaluateAccountPayoutEligibility(step2MissingPhaseBase, []).eligible, false);

  // 3. Instant Funding: 7 consistent closed trades of $100 each ($700 total -> 14.29% max single trade <= 15%) unlocks payout
  const instantConsistentAcc: TradingAccountRecord = {
    ...sampleAccount,
    id: 'acc-inst-7trades',
    challengeId: 'instant-50000',
    challengeType: 'instant',
    startingBalance: 50000,
    balance: 50700,
    equity: 50700,
    status: 'active',
  };
  const sevenConsistentTrades: TradeOrderRecord[] = Array.from({ length: 7 }, (_, i) => ({
    id: `ord-c-${i + 1}`,
    ticketId: `TKT-C-${i + 1}`,
    accountId: 'acc-inst-7trades',
    userId: 'user-1',
    symbol: 'XAUUSD',
    side: 'BUY',
    orderType: 'MARKET',
    volume: 0.5,
    entryPrice: 2740,
    currentPrice: 2742,
    exitPrice: 2742,
    stopLoss: 0,
    takeProfit: 0,
    grossPnl: 102.5,
    commission: 2.5,
    netPnl: 100,
    status: 'CLOSED',
    openTime: '2026-11-10T00:00:00Z',
    closeTime: '2026-11-10T01:00:00Z',
  }));
  const instantConsistentElig = evaluateAccountPayoutEligibility(
    instantConsistentAcc,
    [],
    sevenConsistentTrades
  );
  assert.equal(instantConsistentElig.isConsistencyViolated, false);
  assert.equal(instantConsistentElig.highestTradeSharePct, 14.29);
  assert.equal(instantConsistentElig.eligible, true);
});

test('validateAndComputeSlTpPreview rejects invalid BUY/SELL SL/TP on manual submit and clamps cleanly on chart drag', async () => {
  const { validateAndComputeSlTpPreview, computeSlTpPresets } = await import('./tradingEngine');

  // Invalid BUY SL above current live Bid (manual modal should reject)
  const badBuySl = validateAndComputeSlTpPreview({
    symbol: 'EURUSD',
    side: 'BUY',
    volume: 1,
    referencePrice: 1.1,
    liveBid: 1.1005,
    liveAsk: 1.1006,
    stopLoss: 1.102,
    takeProfit: 1.11,
    isOpenPosition: true,
    allowAutoClamp: false,
  });
  assert.equal(badBuySl.valid, false);
  assert.ok((badBuySl.error || '').includes('below'));

  // Invalid BUY TP below current live Bid (manual modal should reject)
  const badBuyTp = validateAndComputeSlTpPreview({
    symbol: 'EURUSD',
    side: 'BUY',
    volume: 1,
    referencePrice: 1.1,
    liveBid: 1.1005,
    liveAsk: 1.1006,
    stopLoss: 1.095,
    takeProfit: 1.099,
    isOpenPosition: true,
    allowAutoClamp: false,
  });
  assert.equal(badBuyTp.valid, false);
  assert.ok((badBuyTp.error || '').includes('above'));

  // Chart drag (allowAutoClamp: true) clamps BUY SL just below liveBid safely
  const clampedBuySl = validateAndComputeSlTpPreview({
    symbol: 'EURUSD',
    side: 'BUY',
    volume: 1,
    referencePrice: 1.1,
    liveBid: 1.1005,
    liveAsk: 1.1006,
    stopLoss: 1.102,
    takeProfit: 1.1055,
    isOpenPosition: true,
    allowAutoClamp: true,
  });
  assert.equal(clampedBuySl.valid, true);
  assert.ok(clampedBuySl.stopLoss < 1.1005);

  // Valid SELL SL/TP computes accurate riskUsd, rewardUsd, rrRatio
  const validSell = validateAndComputeSlTpPreview({
    symbol: 'XAUUSD',
    side: 'SELL',
    volume: 0.5,
    referencePrice: 2740,
    liveBid: 2740,
    liveAsk: 2740.3,
    stopLoss: 2750,
    takeProfit: 2720,
    isOpenPosition: true,
    allowAutoClamp: false,
  });
  assert.equal(validSell.valid, true);
  assert.equal(validSell.riskUsd, 500);
  assert.equal(validSell.rewardUsd, 1000);
  assert.equal(validSell.rrRatio, 2);

  // Presets compute $50 SL, 1:2 R:R TP, and Breakeven SL
  const presets = computeSlTpPresets({
    symbol: 'XAUUSD',
    side: 'BUY',
    volume: 0.5,
    entryPrice: 2740,
    liveBid: 2740.5,
    liveAsk: 2740.8,
    currentSl: 2739,
    isOpenPosition: true,
  });
  assert.equal(presets.riskUsdPresets.find((p) => p.riskUsd === 50)?.slPrice, 2739);
  assert.equal(presets.rrPresets.find((p) => p.ratio === 2)?.tpPrice, 2742);
  assert.equal(presets.breakevenSl, 2740);
});

test('ADMIN_EMAIL_FORMATS includes all required formats and renders substituted placeholders cleanly', async () => {
  const { ADMIN_EMAIL_FORMATS, renderAdminEmailFormat } = await import('./cloudFunctionsEmail');

  const ids = ADMIN_EMAIL_FORMATS.map((f) => f.id);
  for (const requiredId of [
    'welcome_registration',
    'challenge_purchase_pending',
    'terminal_credentials',
    'phase_passed',
    'funded_account_activated',
    'payout_approved',
    'payout_rejected',
    'account_breached',
    'password_reset',
    'vip_promo_notice',
  ]) {
    assert.ok(ids.includes(requiredId), `Missing email format: ${requiredId}`);
  }

  const renderedPayout = renderAdminEmailFormat('payout_rejected', {
    traderName: 'Aarav Patel',
    accountNumber: 'FA-900112',
    challengeTitle: '$50K Two-Step',
    amountUsd: '$1,400.00 USD',
    walletAddress: '0xAbCdEf123456',
    reason: 'Wrong BEP-20 network wallet tag',
  });
  assert.ok(renderedPayout.subject.includes('FA-900112'));
  assert.ok(renderedPayout.bodyText.includes('Aarav Patel'));
  assert.ok(renderedPayout.bodyText.includes('$1,400.00 USD'));
  assert.ok(renderedPayout.bodyText.includes('0xAbCdEf123456'));
  assert.ok(renderedPayout.bodyText.includes('Wrong BEP-20 network wallet tag'));
  assert.ok(renderedPayout.fullCopyText.includes('Subject:'));
});

test('1-Step evaluation enforces +10% target and blocks payouts while positions are open', async () => {
  const { evaluateAccountRiskMetrics, evaluateAccountPayoutEligibility } = await import('./tradingEngine');

  const oneStepHalfway: TradingAccountRecord = {
    ...sampleAccount,
    id: 'acc-1step-1',
    challengeId: 'one-step-50000',
    challengeType: 'one_step',
    startingBalance: 50000,
    phaseStartingBalance: 50000,
    balance: 54000,
    equity: 54000,
    currentStep: 1,
    totalSteps: 1,
    profitTargetPct: 10,
    status: 'active',
  };
  assert.equal(evaluateAccountRiskMetrics(oneStepHalfway, []).stepCompleted, false);
  assert.equal(evaluateAccountPayoutEligibility(oneStepHalfway, []).eligible, false);

  const oneStepPassed: TradingAccountRecord = {
    ...oneStepHalfway,
    balance: 55000,
    equity: 55000,
    status: 'passed',
  };
  assert.equal(evaluateAccountPayoutEligibility(oneStepPassed, []).eligible, true);

  // Even when funded/passed, an open position blocks payout until closed
  const openPos: TradeOrderRecord = {
    id: 'open-1',
    ticketId: 'TKT-OPEN-1',
    accountId: 'acc-1step-1',
    userId: 'user-1',
    symbol: 'XAUUSD',
    side: 'BUY',
    orderType: 'MARKET',
    volume: 0.1,
    entryPrice: 2740,
    currentPrice: 2741,
    exitPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    grossPnl: 10,
    commission: 0.5,
    netPnl: 9.5,
    status: 'OPEN',
    openTime: '2026-11-10T00:00:00Z',
    closeTime: '',
  };
  const blockedByOpen = evaluateAccountPayoutEligibility(oneStepPassed, [openPos]);
  assert.equal(blockedByOpen.eligible, false);
  assert.ok(blockedByOpen.reason.toLowerCase().includes('open'));
});

test('validatePayoutRequestAgainstRules validates challenge progress against PREDEFINED_CHALLENGE_PASSING_RULES', async () => {
  const { PREDEFINED_CHALLENGE_PASSING_RULES, validatePayoutRequestAgainstRules } = await import(
    './tradingEngine'
  );

  // Verify predefined passing rule specs
  assert.equal(PREDEFINED_CHALLENGE_PASSING_RULES.two_step.cumulativeProfitTargetPct, 13);
  assert.equal(PREDEFINED_CHALLENGE_PASSING_RULES.one_step.cumulativeProfitTargetPct, 10);
  assert.equal(PREDEFINED_CHALLENGE_PASSING_RULES.three_step.cumulativeProfitTargetPct, 18);
  assert.equal(PREDEFINED_CHALLENGE_PASSING_RULES.instant.consistencyRulePct, 15);

  // 1. Even if status is marked passed, 2-Step account with only +5% cumulative profit ($52,500 on $50k) fails target check
  const prematurePassedAcc: TradingAccountRecord = {
    ...sampleAccount,
    id: 'acc-premature-pass',
    challengeType: 'two_step',
    startingBalance: 50000,
    balance: 52500,
    equity: 52500,
    currentStep: 2,
    totalSteps: 2,
    status: 'passed',
  };
  const prematureCheck = validatePayoutRequestAgainstRules({
    account: prematurePassedAcc,
    amountUsd: 1000,
    method: 'USDT (BEP-20)',
    destination: '0x1234567890abcdef1234567890abcdef12345678',
  });
  assert.equal(prematureCheck.valid, false);
  assert.equal(prematureCheck.eligibility.hasMetCumulativeTarget, false);
  assert.equal(
    prematureCheck.eligibility.ruleChecks.find((c) => c.id === 'profit_target')?.passed,
    false
  );

  // 2. Funded 2-Step account that earned +$6,500 (+13%) and already withdrew $1,800 ($2,000 gross) remains eligible for remaining split
  const secondPayoutAcc: TradingAccountRecord = {
    ...prematurePassedAcc,
    id: 'acc-second-payout',
    balance: 54500, // $4,500 remaining realized profit
    equity: 54500,
  };
  const secondPayoutOk = validatePayoutRequestAgainstRules({
    account: secondPayoutAcc,
    amountUsd: 4050, // 90% of $4,500 remaining
    method: 'USDT (BEP-20)',
    destination: '0x1234567890abcdef1234567890abcdef12345678',
    existingPayouts: [
      {
        accountId: 'acc-second-payout',
        status: 'Verified',
        amountUsd: 1800,
        grossProfitDeducted: 2000,
      },
    ],
  });
  assert.equal(secondPayoutOk.valid, true);
  assert.equal(secondPayoutOk.eligibility.hasMetCumulativeTarget, true);
  assert.equal(secondPayoutOk.eligibility.maxWithdrawableUsd, 4050);

  // 3. Reject invalid destination (< 8 chars) and out-of-range amount even on verified eligible account
  const shortDest = validatePayoutRequestAgainstRules({
    account: { ...prematurePassedAcc, balance: 56500, equity: 56500 },
    amountUsd: 500,
    method: 'USDT (BEP-20)',
    destination: '0x12',
  });
  assert.equal(shortDest.valid, false);
  assert.ok((shortDest.error || '').toLowerCase().includes('destination'));

  const belowMin = validatePayoutRequestAgainstRules({
    account: { ...prematurePassedAcc, balance: 56500, equity: 56500 },
    amountUsd: 10,
    method: 'USDT (BEP-20)',
    destination: '0x1234567890abcdef1234567890abcdef12345678',
  });
  assert.equal(belowMin.valid, false);
  assert.ok((belowMin.error || '').includes('$20.00'));
});

test('formatCandleCountdown and resolveChartPriceOrderType compute TradingView timer and right-click limit/stop orders accurately', async () => {
  const { formatCandleCountdown, resolveChartPriceOrderType } = await import('./tradingEngine');

  // 15m (900s) bar with 45s elapsed -> 14:15 remaining
  assert.equal(formatCandleCountdown(945 * 1000, 900), '14:15');
  // 1m (60s) bar exact boundary -> 01:00
  assert.equal(formatCandleCountdown(120 * 1000, 60), '01:00');
  // 4h (14400s) bar with 3661s elapsed -> 02:58:59
  assert.equal(formatCandleCountdown((14400 + 3661) * 1000, 14400), '02:58:59');
  // 1W (604800s) bar with 172800s (2d) elapsed -> 5d 00:00
  assert.equal(formatCandleCountdown((604800 + 172800) * 1000, 604800), '5d 00:00');

  // BUY below Ask -> BUY_LIMIT; BUY above Ask -> BUY_STOP
  assert.equal(resolveChartPriceOrderType('BUY', 3305, 3310, 3310.4), 'BUY_LIMIT');
  assert.equal(resolveChartPriceOrderType('BUY', 3315, 3310, 3310.4), 'BUY_STOP');
  // SELL above Bid -> SELL_LIMIT; SELL below Bid -> SELL_STOP
  assert.equal(resolveChartPriceOrderType('SELL', 3315, 3310, 3310.4), 'SELL_LIMIT');
  assert.equal(resolveChartPriceOrderType('SELL', 3305, 3310, 3310.4), 'SELL_STOP');
});

test('normalizeCandlesForLightweightCharts, transformCandlesToHeikinAshi, and mergeRealtimeOhlcBar handle sorting, deduplication, and WS ticks', async () => {
  const {
    normalizeCandlesForLightweightCharts,
    transformCandlesToHeikinAshi,
    mergeRealtimeOhlcBar,
    mergeSpotTickIntoLatestCandle,
    computeEmaSeries,
    computeBollingerBands,
    resolveBinanceKlineStreamParam,
  } = await import('./liveMarketFeed');

  // Unsorted ms timestamps + duplicate timestamp + bad wick + zero price item
  const normalized = normalizeCandlesForLightweightCharts([
    { time: 1700001000 * 1000, open: 2742, high: 2744, low: 2740, close: 2743, volume: 120 },
    { time: 1700000100 * 1000, open: 2738, high: 2739, low: 2741, close: 2740, volume: 90 },
    { time: 1700001000 * 1000, open: 2742, high: 2746, low: 2740, close: 2745, volume: 150 },
    { time: 1700001900 * 1000, open: 0, high: 0, low: 0, close: 0, volume: 0 },
  ]);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].time, 1700000100);
  assert.equal(normalized[0].high, 2740); // clamped >= max(open, close)
  assert.equal(normalized[0].low, 2738); // clamped <= min(open, close)
  assert.equal(normalized[1].time, 1700001000);
  assert.equal(normalized[1].close, 2745); // latest duplicate preserved

  // Update same bar via WS OHLC
  const sameUpdate = mergeRealtimeOhlcBar(normalized, {
    time: 1700001000,
    open: 2742,
    high: 2749,
    low: 2738,
    close: 2748,
    volume: 210,
  });
  assert.equal(sameUpdate.action, 'update');
  assert.equal(sameUpdate.bars.length, 2);
  assert.equal(sameUpdate.updatedBar?.high, 2749);
  assert.equal(sameUpdate.updatedBar?.low, 2738);
  assert.equal(sameUpdate.updatedBar?.close, 2748);

  // Reject stale bar older than latest timestamp
  const staleIgnore = mergeRealtimeOhlcBar(sameUpdate.bars, {
    time: 1700000100,
    open: 2738,
    high: 2740,
    low: 2735,
    close: 2739,
    volume: 50,
  });
  assert.equal(staleIgnore.action, 'ignore');
  assert.equal(staleIgnore.updatedBar, null);

  // Append new bar when bucket advances
  const appendNext = mergeRealtimeOhlcBar(sameUpdate.bars, {
    time: 1700001900,
    open: 2748,
    high: 2751,
    low: 2747,
    close: 2750,
    volume: 40,
  });
  assert.equal(appendNext.action, 'append');
  assert.equal(appendNext.bars.length, 3);

  // Spot tick anchoring updates current bar and opens new bar when timeframe boundary passes
  const spotInBar = mergeSpotTickIntoLatestCandle(appendNext.bars, 2752.5, 900, 1700002100 * 1000);
  assert.equal(spotInBar.bars.length, 3);
  assert.equal(spotInBar.updatedBar?.high, 2752.5);
  const spotNextBar = mergeSpotTickIntoLatestCandle(spotInBar.bars, 2754.0, 900, 1700002800 * 1000);
  assert.equal(spotNextBar.bars.length, 4);
  assert.equal(spotNextBar.updatedBar?.time, 1700002800);

  // Heikin-Ashi conversion
  const ha = transformCandlesToHeikinAshi(spotNextBar.bars);
  assert.equal(ha.length, 4);
  assert.ok(ha[1].high >= Math.max(ha[1].open, ha[1].close));
  assert.ok(ha[1].low <= Math.min(ha[1].open, ha[1].close));

  // Indicators & WS stream params
  const sampleBars = Array.from({ length: 25 }, (_, i) => ({
    time: 1700000000 + i * 900,
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 100,
  }));
  const ema20 = computeEmaSeries(sampleBars, 20);
  assert.equal(ema20.length, 6);
  const bb = computeBollingerBands(sampleBars, 20, 2);
  assert.equal(bb.upper.length, 6);
  assert.ok(bb.upper[0].value > bb.middle[0].value && bb.middle[0].value > bb.lower[0].value);

  assert.equal(resolveBinanceKlineStreamParam('BTCUSD', '15m')?.stream, 'btcusdt@kline_15m');
  assert.equal(resolveBinanceKlineStreamParam('XAUUSD', '15m'), null);
});

test('getMarketStatus, validateOrderRequest, and evaluateOrderTrigger block weekend non-Crypto trades while keeping Crypto 24/7 live', () => {
  const friOpenMs = Date.UTC(2026, 10, 13, 21, 59, 0); // Fri Nov 13 21:59 UTC
  const friCloseMs = Date.UTC(2026, 10, 13, 22, 0, 0); // Fri Nov 13 22:00 UTC
  const satMidMs = Date.UTC(2026, 10, 14, 10, 0, 0); // Sat Nov 14 10:00 UTC
  const sunBeforeOpenMs = Date.UTC(2026, 10, 15, 21, 59, 0); // Sun Nov 15 21:59 UTC
  const sunOpenMs = Date.UTC(2026, 10, 15, 22, 0, 0); // Sun Nov 15 22:00 UTC

  // Boundary transitions for Gold, Forex, Indices
  assert.equal(getMarketStatus('XAUUSD', friOpenMs).isOpen, true);
  assert.equal(getMarketStatus('XAUUSD', friCloseMs).isOpen, false);
  assert.equal(getMarketStatus('XAUUSD', satMidMs).isOpen, false);
  assert.equal(getMarketStatus('XAUUSD', satMidMs).sessionLabel, 'CLOSED');
  assert.equal(getMarketStatus('EURUSD', satMidMs).isOpen, false);
  assert.equal(getMarketStatus('NAS100', satMidMs).isOpen, false);
  assert.equal(getMarketStatus('XAUUSD', sunBeforeOpenMs).isOpen, false);
  assert.equal(getMarketStatus('XAUUSD', sunOpenMs).isOpen, true);

  // Crypto operates 24/7 even on Saturday & Sunday
  assert.equal(getMarketStatus('BTCUSD', satMidMs).isOpen, true);
  assert.equal(getMarketStatus('BTCUSD', satMidMs).sessionLabel, '24/7 LIVE');
  assert.equal(getMarketStatus('ETHUSD', sunBeforeOpenMs).isOpen, true);

  // Weekend order validation rejects XAUUSD on Saturday
  const satXauOrder = validateOrderRequest(
    {
      accountId: 'acc-1',
      symbol: 'XAUUSD',
      side: 'BUY',
      orderType: 'MARKET',
      volume: 0.1,
    },
    sampleAccount,
    xauQuote,
    satMidMs
  );
  assert.equal(satXauOrder.valid, false);
  assert.ok((satXauOrder.error || '').toLowerCase().includes('closed'));

  // Weekend trigger evaluation skips SL/TP/Pending activation for XAUUSD
  const pendingSatOrder: TradeOrderRecord = {
    id: 'ord-sat-1',
    ticketId: 'TKT-SAT-1',
    accountId: 'acc-1',
    userId: 'user-1',
    symbol: 'XAUUSD',
    side: 'BUY',
    orderType: 'BUY_LIMIT',
    volume: 0.5,
    entryPrice: 2749.0,
    currentPrice: 2748.74,
    exitPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    grossPnl: 0,
    commission: 2.5,
    netPnl: 0,
    status: 'PENDING',
    openTime: '2026-11-13T20:00:00Z',
    closeTime: '',
  };
  assert.equal(evaluateOrderTrigger(pendingSatOrder, xauQuote, satMidMs).action, 'NONE');

  // Crypto execution succeeds 24/7 on Saturday
  const btcQuote: MarketQuote = {
    symbol: 'BTCUSD',
    bid: 67150,
    ask: 67155,
    last: 67152,
    change24hPct: 1.2,
    high24h: 68000,
    low24h: 66000,
    timestamp: satMidMs,
  };
  const satBtcOrder = validateOrderRequest(
    {
      accountId: 'acc-1',
      symbol: 'BTCUSD',
      side: 'BUY',
      orderType: 'MARKET',
      volume: 0.05,
    },
    sampleAccount,
    btcQuote,
    satMidMs
  );
  assert.equal(satBtcOrder.valid, true);
});

test('reconcileCandlesWithLiveQuote preserves 1:1 historical Binance bars and reconciles forming bar and futures basis accurately', async () => {
  const { reconcileCandlesWithLiveQuote } = await import('./liveMarketFeed');

  const rawBinanceBtcBars = [
    {
      time: 1794661200000,
      open: 66998.18,
      high: 67029.30,
      low: 66721.00,
      close: 66796.01,
      volume: 467,
      isExchangeKline: true,
    },
    {
      time: 1794662100000,
      open: 66796.01,
      high: 66874.01,
      low: 66663.62,
      close: 66720.00,
      volume: 159,
      isExchangeKline: true,
    },
  ];

  // 1. Direct Binance Crypto feed: historical closed bar [0] is 100% untouched, forming bar [1] close updates 1:1 to liveBid
  const reconciledBtc = reconcileCandlesWithLiveQuote(
    rawBinanceBtcBars,
    'BTCUSD',
    66724.99,
    'binance'
  );
  assert.equal(reconciledBtc[0].open, 66998.18);
  assert.equal(reconciledBtc[0].high, 67029.30);
  assert.equal(reconciledBtc[0].low, 66721.00);
  assert.equal(reconciledBtc[0].close, 66796.01);
  assert.equal(reconciledBtc[1].close, 66724.99);

  // 2. Yahoo Finance Gold Futures (GC=F) reconciled to Swissquote Spot XAUUSD within 4% basis
  const rawYahooGoldBars = [
    {
      time: 1794605400000,
      open: 3879.10,
      high: 3881.40,
      low: 3875.90,
      close: 3880.70,
      volume: 693,
      isExchangeKline: true,
    },
    {
      time: 1794606300000,
      open: 3880.70,
      high: 3888.90,
      low: 3878.70,
      close: 3886.30,
      volume: 1140,
      isExchangeKline: true,
    },
  ];
  const reconciledGold = reconcileCandlesWithLiveQuote(
    rawYahooGoldBars,
    'XAUUSD',
    3880.07,
    'yahoo'
  );
  assert.equal(reconciledGold[reconciledGold.length - 1].close, 3880.07);

  // 3. Stale fallback seed (>18% away from real exchange price) never distorts authentic exchange klines
  const rawYahooGer40 = [
    {
      time: 1794606300000,
      open: 26700.00,
      high: 26832.82,
      low: 26678.35,
      close: 26749.95,
      volume: 950,
      isExchangeKline: true,
    },
  ];
  const untouchedGer40 = reconcileCandlesWithLiveQuote(
    rawYahooGer40,
    'GER40',
    21450.00,
    'yahoo'
  );
  assert.equal(untouchedGer40[0].close, 26749.95);
});

test('computeCurrentPriceFocusLogicalRange focuses chart viewport directly onto latest candles at current live price on pair selection', async () => {
  const { computeCurrentPriceFocusLogicalRange } = await import('./liveMarketFeed');

  // 350 historical bars -> focuses on the latest 65 bars ending at index 349 + 6 right offset
  const range350 = computeCurrentPriceFocusLogicalRange(350, 65, 6);
  assert.equal(range350.from, 285);
  assert.equal(range350.to, 355);

  // Small candle set (30 bars) -> clamps from to 0 and keeps right offset at current price
  const range30 = computeCurrentPriceFocusLogicalRange(30, 65, 6);
  assert.equal(range30.from, 0);
  assert.equal(range30.to, 35);
});

test('computeChartSlTpDragPrice and computeDefaultQuickSlTpForPosition clamp on-chart SL/TP levels and compute live dollar risk/reward', async () => {
  const { computeChartSlTpDragPrice, computeDefaultQuickSlTpForPosition } = await import(
    './tradingEngine'
  );

  // 1. Quick +SL on a BUY BTCUSD position places protective SL below entry price
  const quickSl = computeDefaultQuickSlTpForPosition({
    symbol: 'BTCUSD',
    side: 'BUY',
    entryPrice: 91200,
    currentPrice: 91250,
    lots: 0.1,
    existingSl: 0,
    existingTp: 0,
    targetType: 'sl',
    defaultRiskUsd: 25,
  });
  assert.ok(quickSl.nextSl > 0 && quickSl.nextSl < 91200);
  assert.ok(quickSl.riskUsd !== null && quickSl.riskUsd > 0);

  // 2. Quick +TP on a BUY BTCUSD position places 1:2 R:R TP above entry price
  const quickTp = computeDefaultQuickSlTpForPosition({
    symbol: 'BTCUSD',
    side: 'BUY',
    entryPrice: 91200,
    currentPrice: 91250,
    lots: 0.1,
    existingSl: quickSl.nextSl,
    existingTp: 0,
    targetType: 'tp',
    defaultRiskUsd: 25,
  });
  assert.ok(quickTp.nextTp > 91250);
  assert.ok(quickTp.rewardUsd !== null && quickTp.rewardUsd > (quickSl.riskUsd || 0));

  // 3a. Dragging PENDING BUY SL above entry price clamps below entry price
  const draggedPendingBuySl = computeChartSlTpDragPrice({
    symbol: 'XAUUSD',
    side: 'BUY',
    entryPrice: 3880,
    currentReferencePrice: 3882,
    lots: 0.1,
    targetType: 'sl',
    rawPrice: 3920, // dragged to wrong side
    existingSl: 3860,
    existingTp: 3910,
    isOpenPosition: false,
  });
  assert.ok(draggedPendingBuySl.clampedPrice < 3880);
  assert.ok(draggedPendingBuySl.riskUsd !== null && draggedPendingBuySl.riskUsd > 0);

  // 3b. Dragging OPEN BUY SL above current live price clamps safely below live market price
  const draggedOpenBuySl = computeChartSlTpDragPrice({
    symbol: 'XAUUSD',
    side: 'BUY',
    entryPrice: 3880,
    currentReferencePrice: 3882,
    lots: 0.1,
    targetType: 'sl',
    rawPrice: 3920,
    existingSl: 3860,
    existingTp: 3910,
    isOpenPosition: true,
  });
  assert.ok(draggedOpenBuySl.clampedPrice < 3882);
});

test('formatAccountRulesSummary and INITIAL_CHALLENGES enforce all 24 challenge configurations and 24 instruments', async () => {
  const { formatAccountRulesSummary } = await import('./tradingEngine');
  const { INITIAL_CHALLENGES, ALL_INSTRUMENTS } = await import('../data/platformData');

  assert.equal(INITIAL_CHALLENGES.length, 24);
  assert.equal(ALL_INSTRUMENTS.length, 24);
  for (const ch of INITIAL_CHALLENGES) {
    assert.equal(ch.instruments.length, 24);
  }

  const instantSummary = formatAccountRulesSummary({
    challengeType: 'instant',
    startingBalance: 10000,
    dailyStartBalance: 10000,
    balance: 10000,
    profitTargetPct: 0,
    dailyDrawdownPct: 3,
    maxDrawdownPct: 6,
    minTradingDays: 0,
    leverage: 30,
    profitSplitPct: 80,
    currentPhase: 1,
    totalPhases: 1,
    status: 'passed',
  });
  assert.equal(instantSummary.activeTargetPct, 0);
  assert.equal(instantSummary.dailyDrawdownLimitUsd, 300);
  assert.equal(instantSummary.maxDrawdownLimitUsd, 600);
  assert.equal(instantSummary.leverageText, '1:30');
  assert.ok(instantSummary.consistencyRuleText.includes('15%'));

  const twoStepSummary = formatAccountRulesSummary({
    challengeType: 'two_step',
    startingBalance: 50000,
    dailyStartBalance: 50000,
    balance: 50000,
    profitTargetPct: 8,
    dailyDrawdownPct: 5,
    maxDrawdownPct: 10,
    minTradingDays: 3,
    leverage: 100,
    profitSplitPct: 90,
    currentPhase: 1,
    totalPhases: 2,
    status: 'active',
  });
  assert.equal(twoStepSummary.activeTargetPct, 8);
  assert.equal(twoStepSummary.activeTargetUsd, 4000);
  assert.equal(twoStepSummary.dailyDrawdownLimitUsd, 2500);
  assert.equal(twoStepSummary.maxDrawdownLimitUsd, 5000);
  assert.equal(twoStepSummary.leverageText, '1:100');
  assert.ok(twoStepSummary.phaseTargetsText.includes('Phase 1: +8% · Phase 2: +5%'));
});

test('computeSmaSeries, computeVwapSeries, synchronizeCandlesToRealtimeBucket, and reconcileCandlesWithLiveQuote eliminate exchange candle delay and align basis cleanly', async () => {
  const { INSTRUMENTS } = await import('./tradingEngine');
  const {
    computeSmaSeries,
    computeVwapSeries,
    synchronizeCandlesToRealtimeBucket,
    reconcileCandlesWithLiveQuote,
  } = await import('./liveMarketFeed');

  const sampleBars = Array.from({ length: 25 }, (_, i) => ({
    time: 1700000000 + i * 900,
    open: 100 + i,
    high: 103 + i,
    low: 98 + i,
    close: 101 + i,
    volume: 100 + i * 10,
  }));

  const sma20 = computeSmaSeries(sampleBars, 20);
  assert.equal(sma20.length, 6);
  const vwap = computeVwapSeries(sampleBars);
  assert.equal(vwap.length, 25);
  assert.ok(vwap[24].value > 100 && vwap[24].value < 130);

  // Verify delayed exchange candles (e.g. 15m Yahoo Finance delay = 3 candles behind on 5m chart)
  // are shifted forward to the exact current real-time bucket when the market is open (Wednesday 14:22 UTC)
  const wednesdayNowMs = Date.UTC(2026, 10, 18, 14, 22, 15); // 2026-11-18T14:22:15Z (Wednesday)
  const step5m = 5 * 60_000;
  const expectedCurrentBucket = Math.floor(wednesdayNowMs / step5m) * step5m;
  const delayedBars = [
    {
      time: expectedCurrentBucket - 4 * step5m,
      open: 2650.0,
      high: 2652.0,
      low: 2648.5,
      close: 2651.2,
      volume: 420,
      isExchangeKline: true,
    },
    {
      time: expectedCurrentBucket - 3 * step5m, // 15 minutes behind real-time
      open: 2651.2,
      high: 2654.0,
      low: 2650.8,
      close: 2653.4,
      volume: 510,
      isExchangeKline: true,
    },
  ];

  const syncedBars = synchronizeCandlesToRealtimeBucket(delayedBars, 'XAUUSD', '5m', wednesdayNowMs);
  assert.equal(syncedBars[syncedBars.length - 1].time, expectedCurrentBucket);
  assert.equal(syncedBars[0].time, expectedCurrentBucket - step5m);

  // Spot Forex (EURUSD): historical bar [0] stays aligned while forming bar [1] updates to liveBid
  const eurUsdBars = [
    {
      time: expectedCurrentBucket - 900_000,
      open: 1.0540,
      high: 1.0565,
      low: 1.0532,
      close: 1.0555,
      volume: 420,
      isExchangeKline: true,
    },
    {
      time: expectedCurrentBucket,
      open: 1.0555,
      high: 1.0570,
      low: 1.0548,
      close: 1.0560,
      volume: 380,
      isExchangeKline: true,
    },
  ];
  const reconciledEur = reconcileCandlesWithLiveQuote(eurUsdBars, 'EURUSD', 1.0564, 'yahoo', '15m');
  assert.equal(reconciledEur[1].close, 1.0564);

  // Static seed protection: if XAUUSD real exchange klines are at 4665.20 and liveBid is still the static seed 3880.07, do NOT shift real candles
  const realXauBars = [
    {
      time: expectedCurrentBucket,
      open: 4660.00,
      high: 4672.50,
      low: 4655.10,
      close: 4665.20,
      volume: 1200,
      isExchangeKline: true,
    },
  ];
  const protectedXau = reconcileCandlesWithLiveQuote(
    realXauBars,
    'XAUUSD',
    INSTRUMENTS.XAUUSD.basePrice,
    'yahoo',
    '15m'
  );
  assert.equal(protectedXau[0].close, 4665.20);
});

test('Affiliate Program awards 10 points per referral, sets $5K Two Step point price to 110, configures all 24 evaluations, and preserves point redemptions across vault merges', async () => {
  const {
    AFFILIATE_POINTS_PER_REFERRAL,
    TWO_STEP_5K_POINT_PRICE,
    INITIAL_CHALLENGES,
    getChallengePointPrice,
  } = await import('../data/platformData');
  const { mergeUserProfileRecords } = await import('./userVault');
  type VaultUserRecord = import('./userVault').VaultUserRecord;

  assert.equal(AFFILIATE_POINTS_PER_REFERRAL, 10);
  assert.equal(TWO_STEP_5K_POINT_PRICE, 110);
  assert.equal(INITIAL_CHALLENGES.length, 24);

  const twoStep5k = INITIAL_CHALLENGES.find((c) => c.id === 'two-step-5000');
  assert.ok(twoStep5k, 'two-step-5000 must exist');
  assert.equal(twoStep5k.pointPrice, 110);
  assert.equal(getChallengePointPrice(twoStep5k), 110);

  // Verify every single evaluation has a positive pointPrice and monotonic scaling per challenge model
  for (const ch of INITIAL_CHALLENGES) {
    const pts = getChallengePointPrice(ch);
    assert.ok(pts > 0, `Challenge ${ch.id} should have positive pointPrice`);
    assert.equal(ch.pointPrice, pts);
  }

  // Verify that 11 referrals (11 * 10 = 110 points) can buy a $5K Two Step account and that spending 110 points persists across vault merges
  const userBeforeRedeem: VaultUserRecord = {
    uid: 'usr-aff-1',
    fullName: 'Affiliate Trader',
    email: 'affiliate@fundedapex.com',
    country: 'India',
    referralCode: 'APEX-AFF01',
    role: 'user',
    rewardPoints: 11 * AFFILIATE_POINTS_PER_REFERRAL, // 110 PTS
    pointsUpdatedAt: 1700000100000,
    mfaEnabled: false,
    deletionRequested: false,
    createdAt: '2026-11-10T00:00:00.000Z',
  };

  const userAfterRedeem5k: VaultUserRecord = {
    ...userBeforeRedeem,
    rewardPoints: userBeforeRedeem.rewardPoints - TWO_STEP_5K_POINT_PRICE, // 0 PTS left
    pointsUpdatedAt: 1700000200000,
  };

  const mergedAfterRedeem = mergeUserProfileRecords(userBeforeRedeem, userAfterRedeem5k);
  assert.equal(mergedAfterRedeem.rewardPoints, 0);
  assert.equal(mergedAfterRedeem.pointsUpdatedAt, 1700000200000);

  // Stale record with older pointsUpdatedAt cannot revert the spent points back to 110
  const mergedAgainstStale = mergeUserProfileRecords(userAfterRedeem5k, userBeforeRedeem);
  assert.equal(mergedAgainstStale.rewardPoints, 0);
});

test('resolveChartPriceInteractionOptions enables vertical price drag only when bars exist to prevent null PriceScale scroll crash', async () => {
  const { resolveChartPriceInteractionOptions } = await import('./liveMarketFeed');

  assert.deepEqual(resolveChartPriceInteractionOptions(0), {
    enablePriceAxisScale: false,
    enableVertTouchDrag: false,
  });
  assert.deepEqual(resolveChartPriceInteractionOptions(-3), {
    enablePriceAxisScale: false,
    enableVertTouchDrag: false,
  });
  assert.deepEqual(resolveChartPriceInteractionOptions(1), {
    enablePriceAxisScale: true,
    enableVertTouchDrag: true,
  });
  assert.deepEqual(resolveChartPriceInteractionOptions(120), {
    enablePriceAxisScale: true,
    enableVertTouchDrag: true,
  });
});

test('shouldAutoFocusChartOnTick prevents live quote ticks from involuntarily resetting chart viewport after initial focus', async () => {
  const { shouldAutoFocusChartOnTick } = await import('./liveMarketFeed');

  assert.equal(shouldAutoFocusChartOnTick(false, false), true);
  assert.equal(shouldAutoFocusChartOnTick(true, false), false);
  assert.equal(shouldAutoFocusChartOnTick(true, true), true);
});

test('computeChartSlTpDragPrice allows open positions to drag SL smoothly to Breakeven/Profit Lock and TP flexibly on valid live side', async () => {
  const { computeChartSlTpDragPrice } = await import('./tradingEngine');

  // 1. Open BUY in profit (Entry 3863.70, Live Bid 3875.00):
  //    Dragging SL to Breakeven (3863.70) or trailing profit (3870.00) must succeed without getting blocked at Entry
  const buyBeSl = computeChartSlTpDragPrice({
    symbol: 'XAUUSD',
    side: 'BUY',
    entryPrice: 3863.7,
    currentReferencePrice: 3875.0,
    lots: 0.1,
    targetType: 'sl',
    rawPrice: 3863.7,
    existingSl: 3855.0,
    existingTp: 3890.0,
    isOpenPosition: true,
  });
  assert.equal(buyBeSl.clampedPrice, 3863.7);
  assert.equal(buyBeSl.riskUsd, 0);

  const buyProfitLockSl = computeChartSlTpDragPrice({
    symbol: 'XAUUSD',
    side: 'BUY',
    entryPrice: 3863.7,
    currentReferencePrice: 3875.0,
    lots: 0.1,
    targetType: 'sl',
    rawPrice: 3870.0,
    existingSl: 3855.0,
    existingTp: 3890.0,
    isOpenPosition: true,
  });
  assert.equal(buyProfitLockSl.clampedPrice, 3870.0);

  // Dragging BUY SL past live Bid (3878.00 > 3875.00) clamps just below live Bid (3875.00), NOT below Entry (3863.70)
  const buySlClampedToLive = computeChartSlTpDragPrice({
    symbol: 'XAUUSD',
    side: 'BUY',
    entryPrice: 3863.7,
    currentReferencePrice: 3875.0,
    lots: 0.1,
    targetType: 'sl',
    rawPrice: 3878.0,
    existingSl: 3855.0,
    existingTp: 3890.0,
    isOpenPosition: true,
  });
  assert.ok(buySlClampedToLive.clampedPrice > 3863.7 && buySlClampedToLive.clampedPrice < 3875.0);

  // 2. Open BUY in drawdown (Entry 3880.50, Live Bid 3872.00):
  //    Dragging TP between live Bid and Entry (3876.00) is valid for cutting a bounce early
  const buyTpBelowEntry = computeChartSlTpDragPrice({
    symbol: 'XAUUSD',
    side: 'BUY',
    entryPrice: 3880.5,
    currentReferencePrice: 3872.0,
    lots: 0.1,
    targetType: 'tp',
    rawPrice: 3876.0,
    existingSl: 3860.0,
    existingTp: 0,
    isOpenPosition: true,
  });
  assert.equal(buyTpBelowEntry.clampedPrice, 3876.0);

  // 3. Open SELL in profit (Entry 3885.00, Live Ask 3872.00):
  //    Dragging SL down to Breakeven (3885.00) or Profit Lock (3878.00) works smoothly
  const sellProfitLockSl = computeChartSlTpDragPrice({
    symbol: 'XAUUSD',
    side: 'SELL',
    entryPrice: 3885.0,
    currentReferencePrice: 3872.0,
    lots: 0.1,
    targetType: 'sl',
    rawPrice: 3878.0,
    existingSl: 3895.0,
    existingTp: 3850.0,
    isOpenPosition: true,
  });
  assert.equal(sellProfitLockSl.clampedPrice, 3878.0);
});
