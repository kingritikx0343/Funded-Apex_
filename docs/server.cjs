var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_node_http = __toESM(require("node:http"), 1);
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_ws = require("ws");

// src/engine/stripeCheckout.ts
function hashPasswordVerifier(email, password) {
  const cleanEmail = email.trim().toLowerCase();
  const payload = `funded_apex_v3_salt::${cleanEmail}::${password}`;
  let h1 = 3735928559 ^ payload.length;
  let h2 = 1103547991 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `apx3_${hex1}${hex2}_${payload.length}`;
}

// src/engine/userVault.ts
function normalizeUserEmail(email) {
  return String(email || "").trim().toLowerCase();
}
function isSeedPasswordRecord(user) {
  if (!user) return false;
  if (user.isSeedDefault === true) return true;
  if (!user.passwordHash) return false;
  const cleanEmail = normalizeUserEmail(user.email);
  if (!cleanEmail) return false;
  return user.passwordHash === hashPasswordVerifier(cleanEmail, "ApexAdmin2026!");
}
function mergeUserProfileRecords(existing, incoming) {
  if (!existing) {
    return {
      ...incoming,
      email: normalizeUserEmail(incoming.email) || incoming.email,
      isSeedDefault: isSeedPasswordRecord(incoming)
    };
  }
  const existingEmail = normalizeUserEmail(existing.email);
  const incomingEmail = normalizeUserEmail(incoming.email);
  const email = incomingEmail || existingEmail;
  const existingIsSeed = isSeedPasswordRecord(existing);
  const incomingIsSeed = isSeedPasswordRecord(incoming);
  const existingHasHash = Boolean(existing.passwordHash);
  const incomingHasHash = Boolean(incoming.passwordHash);
  const existingPwTs = typeof existing.passwordUpdatedAt === "number" ? existing.passwordUpdatedAt : existingIsSeed ? 0 : 1;
  const incomingPwTs = typeof incoming.passwordUpdatedAt === "number" ? incoming.passwordUpdatedAt : incomingIsSeed ? 0 : 1;
  let resolvedPasswordHash = existing.passwordHash;
  let resolvedPwTs = existing.passwordUpdatedAt;
  let resolvedIsSeed = existing.isSeedDefault;
  if (!existingHasHash && incomingHasHash) {
    resolvedPasswordHash = incoming.passwordHash;
    resolvedPwTs = incoming.passwordUpdatedAt;
    resolvedIsSeed = incoming.isSeedDefault;
  } else if (existingHasHash && !incomingHasHash) {
    resolvedPasswordHash = existing.passwordHash;
    resolvedPwTs = existing.passwordUpdatedAt;
    resolvedIsSeed = existing.isSeedDefault;
  } else if (existingHasHash && incomingHasHash) {
    if (existingIsSeed && !incomingIsSeed) {
      resolvedPasswordHash = incoming.passwordHash;
      resolvedPwTs = incoming.passwordUpdatedAt ?? Date.now();
      resolvedIsSeed = false;
    } else if (!existingIsSeed && incomingIsSeed) {
      resolvedPasswordHash = existing.passwordHash;
      resolvedPwTs = existing.passwordUpdatedAt;
      resolvedIsSeed = false;
    } else if (incomingPwTs > existingPwTs) {
      resolvedPasswordHash = incoming.passwordHash;
      resolvedPwTs = incoming.passwordUpdatedAt;
      resolvedIsSeed = incoming.isSeedDefault;
    } else {
      resolvedPasswordHash = existing.passwordHash;
      resolvedPwTs = existing.passwordUpdatedAt ?? incoming.passwordUpdatedAt;
      resolvedIsSeed = existing.isSeedDefault ?? incoming.isSeedDefault;
    }
  }
  const incomingCountry = incoming.country && incoming.country !== "United States" ? incoming.country : existing.country || incoming.country || "United States";
  const rolePriority = {
    user: 0,
    admin: 1,
    super_admin: 2
  };
  const resolvedRole = (rolePriority[incoming.role] ?? 0) >= (rolePriority[existing.role] ?? 0) ? incoming.role || existing.role : existing.role;
  const createdA = existing.createdAt ? Date.parse(existing.createdAt) : Number.MAX_SAFE_INTEGER;
  const createdB = incoming.createdAt ? Date.parse(incoming.createdAt) : Number.MAX_SAFE_INTEGER;
  const earliestCreatedAt = Number.isFinite(createdA) && Number.isFinite(createdB) ? createdA <= createdB ? existing.createdAt : incoming.createdAt : existing.createdAt || incoming.createdAt;
  return {
    ...existing,
    ...incoming,
    uid: existing.uid && !existing.isSeedDefault ? existing.uid : incoming.uid || existing.uid,
    email,
    fullName: incoming.fullName && (!existing.fullName || !incomingIsSeed) ? incoming.fullName : existing.fullName || incoming.fullName,
    country: incomingCountry,
    referralCode: existing.referralCode || incoming.referralCode,
    role: resolvedRole,
    rewardPoints: Math.max(Number(existing.rewardPoints || 0), Number(incoming.rewardPoints || 0)),
    lastSpinDate: incoming.lastSpinDate || existing.lastSpinDate,
    mfaEnabled: Boolean(existing.mfaEnabled || incoming.mfaEnabled),
    deletionRequested: Boolean(incoming.deletionRequested ?? existing.deletionRequested),
    avatarUrl: incoming.avatarUrl || existing.avatarUrl,
    passwordHash: resolvedPasswordHash,
    passwordUpdatedAt: resolvedPwTs,
    isSeedDefault: resolvedIsSeed,
    createdAt: earliestCreatedAt,
    kycStatus: incoming.kycStatus || existing.kycStatus,
    kycDocType: incoming.kycDocType || existing.kycDocType,
    kycSubmittedAt: incoming.kycSubmittedAt || existing.kycSubmittedAt
  };
}
function mergeUserDirectories(existingUsers = [], incomingUsers = []) {
  const byKey = /* @__PURE__ */ new Map();
  const upsert = (userRecord) => {
    if (!userRecord) return;
    const normEmail = normalizeUserEmail(userRecord.email);
    const key = normEmail || String(userRecord.uid || "");
    if (!key) return;
    const prev = byKey.get(key);
    byKey.set(key, mergeUserProfileRecords(prev, userRecord));
  };
  for (const u of existingUsers) upsert(u);
  for (const u of incomingUsers) upsert(u);
  return Array.from(byKey.values());
}

// src/engine/tradingEngine.ts
var INSTRUMENTS = {
  // Metals & Commodities
  XAUUSD: {
    symbol: "XAUUSD",
    name: "Gold Spot / US Dollar",
    shortName: "GOLD",
    category: "Metals",
    tvSymbol: "OANDA:XAUUSD",
    basePrice: 4094,
    spread: 0.45,
    decimals: 2,
    contractSize: 100,
    commissionPerLot: 5,
    volatility: 1.25
  },
  XAGUSD: {
    symbol: "XAGUSD",
    name: "Silver Spot / US Dollar",
    shortName: "SILVER",
    category: "Metals",
    tvSymbol: "OANDA:XAGUSD",
    basePrice: 53.25,
    spread: 0.04,
    decimals: 3,
    contractSize: 5e3,
    commissionPerLot: 5,
    volatility: 0.12
  },
  USOIL: {
    symbol: "USOIL",
    name: "WTI Crude Oil",
    shortName: "CRUDE",
    category: "Commodities",
    tvSymbol: "FX:USOIL",
    basePrice: 84.4,
    spread: 0.04,
    decimals: 2,
    contractSize: 1e3,
    commissionPerLot: 4.5,
    volatility: 0.35
  },
  UKOIL: {
    symbol: "UKOIL",
    name: "Brent Crude Oil",
    shortName: "BRENT",
    category: "Commodities",
    tvSymbol: "FX:UKOIL",
    basePrice: 88.2,
    spread: 0.04,
    decimals: 2,
    contractSize: 1e3,
    commissionPerLot: 4.5,
    volatility: 0.35
  },
  // Forex Majors & Crosses
  EURUSD: {
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    shortName: "EUR/USD",
    category: "Forex",
    tvSymbol: "FX:EURUSD",
    basePrice: 1.1186,
    spread: 12e-5,
    decimals: 5,
    contractSize: 1e5,
    commissionPerLot: 4.5,
    volatility: 25e-5
  },
  GBPUSD: {
    symbol: "GBPUSD",
    name: "British Pound / US Dollar",
    shortName: "GBP/USD",
    category: "Forex",
    tvSymbol: "FX:GBPUSD",
    basePrice: 1.3416,
    spread: 15e-5,
    decimals: 5,
    contractSize: 1e5,
    commissionPerLot: 4.5,
    volatility: 32e-5
  },
  USDJPY: {
    symbol: "USDJPY",
    name: "US Dollar / Japanese Yen",
    shortName: "USD/JPY",
    category: "Forex",
    tvSymbol: "FX:USDJPY",
    basePrice: 158.03,
    spread: 0.014,
    decimals: 3,
    contractSize: 1e5,
    commissionPerLot: 4.5,
    volatility: 0.04
  },
  USDCHF: {
    symbol: "USDCHF",
    name: "US Dollar / Swiss Franc",
    shortName: "USD/CHF",
    category: "Forex",
    tvSymbol: "FX:USDCHF",
    basePrice: 0.819,
    spread: 14e-5,
    decimals: 5,
    contractSize: 1e5,
    commissionPerLot: 4.5,
    volatility: 28e-5
  },
  AUDUSD: {
    symbol: "AUDUSD",
    name: "Australian Dollar / US Dollar",
    shortName: "AUD/USD",
    category: "Forex",
    tvSymbol: "FX:AUDUSD",
    basePrice: 0.6895,
    spread: 14e-5,
    decimals: 5,
    contractSize: 1e5,
    commissionPerLot: 4.5,
    volatility: 26e-5
  },
  USDCAD: {
    symbol: "USDCAD",
    name: "US Dollar / Canadian Dollar",
    shortName: "USD/CAD",
    category: "Forex",
    tvSymbol: "FX:USDCAD",
    basePrice: 1.4099,
    spread: 16e-5,
    decimals: 5,
    contractSize: 1e5,
    commissionPerLot: 4.5,
    volatility: 27e-5
  },
  NZDUSD: {
    symbol: "NZDUSD",
    name: "New Zealand Dollar / US Dollar",
    shortName: "NZD/USD",
    category: "Forex",
    tvSymbol: "FX:NZDUSD",
    basePrice: 0.5611,
    spread: 18e-5,
    decimals: 5,
    contractSize: 1e5,
    commissionPerLot: 4.5,
    volatility: 3e-4
  },
  EURGBP: {
    symbol: "EURGBP",
    name: "Euro / British Pound",
    shortName: "EUR/GBP",
    category: "Forex",
    tvSymbol: "FX:EURGBP",
    basePrice: 0.8338,
    spread: 15e-5,
    decimals: 5,
    contractSize: 1e5,
    commissionPerLot: 4.5,
    volatility: 22e-5
  },
  EURJPY: {
    symbol: "EURJPY",
    name: "Euro / Japanese Yen",
    shortName: "EUR/JPY",
    category: "Forex",
    tvSymbol: "FX:EURJPY",
    basePrice: 176.79,
    spread: 0.018,
    decimals: 3,
    contractSize: 1e5,
    commissionPerLot: 4.5,
    volatility: 0.045
  },
  GBPJPY: {
    symbol: "GBPJPY",
    name: "British Pound / Japanese Yen",
    shortName: "GBP/JPY",
    category: "Forex",
    tvSymbol: "FX:GBPJPY",
    basePrice: 212.02,
    spread: 0.022,
    decimals: 3,
    contractSize: 1e5,
    commissionPerLot: 4.5,
    volatility: 0.055
  },
  // Indices
  NAS100: {
    symbol: "NAS100",
    name: "US Tech 100 Index",
    shortName: "NAS100",
    category: "Indices",
    tvSymbol: "FOREXCOM:NSXUSD",
    basePrice: 28375,
    spread: 2.2,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 3.5,
    volatility: 12.5
  },
  US30: {
    symbol: "US30",
    name: "US Wall Street 30 Index",
    shortName: "US30",
    category: "Indices",
    tvSymbol: "FOREXCOM:DJI",
    basePrice: 51525,
    spread: 3.8,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 3.5,
    volatility: 18
  },
  US500: {
    symbol: "US500",
    name: "US S&P 500 Index",
    shortName: "US500",
    category: "Indices",
    tvSymbol: "FOREXCOM:SPXUSD",
    basePrice: 7212.25,
    spread: 0.8,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 3.5,
    volatility: 4.4
  },
  GER40: {
    symbol: "GER40",
    name: "Germany 40 (DAX)",
    shortName: "GER40",
    category: "Indices",
    tvSymbol: "FOREXCOM:GER40",
    basePrice: 21450,
    spread: 1.5,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 3.5,
    volatility: 7
  },
  UK100: {
    symbol: "UK100",
    name: "UK 100 (FTSE)",
    shortName: "UK100",
    category: "Indices",
    tvSymbol: "FOREXCOM:UK100",
    basePrice: 8840,
    spread: 1.2,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 3.5,
    volatility: 3
  },
  // Crypto
  BTCUSD: {
    symbol: "BTCUSD",
    name: "Bitcoin / US Dollar",
    shortName: "BTC/USD",
    category: "Crypto",
    tvSymbol: "BINANCE:BTCUSDT",
    basePrice: 75870,
    spread: 18.5,
    decimals: 2,
    contractSize: 1,
    commissionPerLot: 8,
    volatility: 55
  },
  ETHUSD: {
    symbol: "ETHUSD",
    name: "Ethereum / US Dollar",
    shortName: "ETH/USD",
    category: "Crypto",
    tvSymbol: "BINANCE:ETHUSDT",
    basePrice: 2105,
    spread: 1.2,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 6,
    volatility: 3.2
  },
  SOLUSD: {
    symbol: "SOLUSD",
    name: "Solana / US Dollar",
    shortName: "SOL/USD",
    category: "Crypto",
    tvSymbol: "BINANCE:SOLUSDT",
    basePrice: 194.5,
    spread: 0.25,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 5,
    volatility: 1.2
  },
  XRPUSD: {
    symbol: "XRPUSD",
    name: "Ripple / US Dollar",
    shortName: "XRP/USD",
    category: "Crypto",
    tvSymbol: "BINANCE:XRPUSDT",
    basePrice: 0.624,
    spread: 12e-4,
    decimals: 4,
    contractSize: 1e3,
    commissionPerLot: 4.5,
    volatility: 5e-3
  },
  BNBUSD: {
    symbol: "BNBUSD",
    name: "Binance Coin / US Dollar",
    shortName: "BNB/USD",
    category: "Crypto",
    tvSymbol: "BINANCE:BNBUSDT",
    basePrice: 624,
    spread: 0.4,
    decimals: 2,
    contractSize: 10,
    commissionPerLot: 5,
    volatility: 2.5
  }
};
function calculateRequiredMargin(symbol, volume, entryPrice, leverage) {
  const spec = INSTRUMENTS[symbol];
  if (volume <= 0 || entryPrice <= 0 || leverage <= 0) return 0;
  const notional = volume * spec.contractSize * entryPrice;
  return Math.round(notional / leverage * 100) / 100;
}
function resolveChallengeRulesForAccount(account) {
  const idLower = (account.challengeId || "").toLowerCase();
  const titleLower = (account.challengeTitle || "").toLowerCase();
  let chType = account.challengeType || "two_step";
  if (account.challengeType === "instant" || idLower.startsWith("instant") || titleLower.includes("instant")) {
    chType = "instant";
  } else if (account.challengeType === "one_step" || idLower.startsWith("one-step") || idLower.startsWith("one_step") || titleLower.includes("one step") || titleLower.includes("1-step")) {
    chType = "one_step";
  } else if (account.challengeType === "three_step" || idLower.startsWith("three-step") || idLower.startsWith("three_step") || titleLower.includes("three step") || titleLower.includes("3-step")) {
    chType = "three_step";
  } else if (account.challengeType === "two_step" || idLower.startsWith("two-step") || idLower.startsWith("two_step") || titleLower.includes("two step") || titleLower.includes("2-step")) {
    chType = "two_step";
  }
  const totalSteps = chType === "instant" ? 0 : chType === "one_step" ? 1 : chType === "two_step" ? 2 : 3;
  const currentStep = totalSteps === 0 ? 1 : Math.min(totalSteps, Math.max(1, account.currentStep || 1));
  const dailyDrawdownPct = chType === "instant" ? 3 : chType === "one_step" ? 4 : 5;
  const maxDrawdownPct = chType === "instant" || chType === "one_step" ? 6 : chType === "two_step" ? 10 : 12;
  let profitTargetPct = 8;
  if (chType === "instant") {
    profitTargetPct = 0;
  } else if (chType === "one_step") {
    profitTargetPct = 10;
  } else if (chType === "two_step") {
    profitTargetPct = currentStep >= 2 ? 5 : 8;
  } else if (chType === "three_step") {
    profitTargetPct = 6;
  }
  const minTradingDays = chType === "instant" ? 0 : 3;
  const leverage = account.leverage && account.leverage > 0 ? account.leverage : chType === "instant" ? 30 : chType === "one_step" ? 50 : 100;
  const profitSplitPct = chType === "instant" ? 80 : chType === "one_step" ? 85 : 90;
  const consistencyRulePct = chType === "instant" ? 15 : 0;
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
    consistencyRulePct
  };
}
var PREDEFINED_CHALLENGE_PASSING_RULES = {
  instant: {
    challengeType: "instant",
    label: "Instant Funding",
    totalSteps: 0,
    stepTargetPcts: [],
    cumulativeProfitTargetPct: 0,
    dailyDrawdownPct: 3,
    maxDrawdownPct: 6,
    minTradingDays: 0,
    consistencyRulePct: 15,
    profitSplitPct: 80
  },
  one_step: {
    challengeType: "one_step",
    label: "1-Step Pro Evaluation",
    totalSteps: 1,
    stepTargetPcts: [10],
    cumulativeProfitTargetPct: 10,
    dailyDrawdownPct: 4,
    maxDrawdownPct: 6,
    minTradingDays: 3,
    consistencyRulePct: 0,
    profitSplitPct: 85
  },
  two_step: {
    challengeType: "two_step",
    label: "2-Step Classic Evaluation",
    totalSteps: 2,
    stepTargetPcts: [8, 5],
    cumulativeProfitTargetPct: 13,
    dailyDrawdownPct: 5,
    maxDrawdownPct: 10,
    minTradingDays: 3,
    consistencyRulePct: 0,
    profitSplitPct: 90
  },
  three_step: {
    challengeType: "three_step",
    label: "3-Step Institutional Evaluation",
    totalSteps: 3,
    stepTargetPcts: [6, 6, 6],
    cumulativeProfitTargetPct: 18,
    dailyDrawdownPct: 5,
    maxDrawdownPct: 12,
    minTradingDays: 3,
    consistencyRulePct: 0,
    profitSplitPct: 90
  }
};
function getMinimumPhaseStartBalance(startingBalance, challengeType, currentStep, recordedPhaseStart) {
  let minRequiredStart = startingBalance;
  if (challengeType === "two_step" && currentStep >= 2) {
    minRequiredStart = Math.round(startingBalance * 1.08 * 100) / 100;
  } else if (challengeType === "three_step") {
    if (currentStep === 2) {
      minRequiredStart = Math.round(startingBalance * 1.06 * 100) / 100;
    } else if (currentStep >= 3) {
      minRequiredStart = Math.round(startingBalance * 1.12 * 100) / 100;
    }
  }
  if (recordedPhaseStart && recordedPhaseStart >= minRequiredStart) {
    return Math.round(recordedPhaseStart * 100) / 100;
  }
  return minRequiredStart;
}
function getRequiredCumulativeEvaluationProfitUsd(startingBalance, challengeType) {
  if (challengeType === "instant") return 0;
  if (challengeType === "one_step") return Math.round(startingBalance * 0.1 * 100) / 100;
  if (challengeType === "two_step") return Math.round(startingBalance * 0.13 * 100) / 100;
  return Math.round(startingBalance * 0.18 * 100) / 100;
}
function evaluateAccountRiskMetrics(account, openOrders) {
  const rules = resolveChallengeRulesForAccount(account);
  const strictlyOpenOrders = openOrders.filter(
    (o) => o.status === "OPEN" && String(o.status).toLowerCase() !== "closed" && !o.closeTime
  );
  const floatingPnl = Math.round(strictlyOpenOrders.reduce((sum, o) => sum + o.netPnl, 0) * 100) / 100;
  const usedMargin = Math.round(
    strictlyOpenOrders.reduce(
      (sum, o) => sum + calculateRequiredMargin(o.symbol, o.volume, o.entryPrice, rules.leverage),
      0
    ) * 100
  ) / 100;
  const equity = Math.round((account.balance + floatingPnl) * 100) / 100;
  const realizedPnl = Math.round((account.balance - account.startingBalance) * 100) / 100;
  const totalNetPnl = Math.round((equity - account.startingBalance) * 100) / 100;
  const freeMargin = Math.round((equity - usedMargin) * 100) / 100;
  const marginLevelPct = usedMargin > 0 ? Math.round(equity / usedMargin * 1e4) / 100 : 0;
  const dailyLossLimitUsd = Math.round(account.startingBalance * (rules.dailyDrawdownPct / 100) * 100) / 100;
  const maxLossLimitUsd = Math.round(account.startingBalance * (rules.maxDrawdownPct / 100) * 100) / 100;
  const profitTargetUsd = Math.round(account.startingBalance * (rules.profitTargetPct / 100) * 100) / 100;
  const currentPeak = Math.max(account.peakEquity || account.startingBalance, equity);
  const currentDailyStart = account.dailyStartingEquity || account.startingBalance;
  const overallDropUsd = equity < account.startingBalance ? Math.max(0, Math.round((account.startingBalance - equity) * 100) / 100) : 0;
  const intradayDropFromDailyStart = currentDailyStart > equity ? Math.max(0, Math.round((currentDailyStart - equity) * 100) / 100) : 0;
  const dailyDropUsd = equity < account.startingBalance ? Math.max(overallDropUsd, intradayDropFromDailyStart) : 0;
  const currentDrawdownUsd = overallDropUsd;
  const currentDrawdownPct = Math.round(currentDrawdownUsd / Math.max(1, account.startingBalance) * 1e4) / 100;
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
  const dailyBreachLevelUsd = Math.round((Math.max(account.startingBalance, currentDailyStart) - dailyLossLimitUsd) * 100) / 100;
  const maxBreachFloorUsd = Math.round((account.startingBalance - maxLossLimitUsd) * 100) / 100;
  const profitTargetLevelUsd = Math.round((phaseStartBalance + profitTargetUsd) * 100) / 100;
  const dailyDrawdownUsedPct = Math.min(
    100,
    Math.round(dailyDropUsd / Math.max(1, dailyLossLimitUsd) * 1e4) / 100
  );
  const maxDrawdownUsedPct = Math.min(
    100,
    Math.round(overallDropUsd / Math.max(1, maxLossLimitUsd) * 1e4) / 100
  );
  const netGainUsd = Math.max(0, Math.round((equity - phaseStartBalance) * 100) / 100);
  const realizedStepGainUsd = Math.max(
    0,
    Math.round((account.balance - phaseStartBalance) * 100) / 100
  );
  const profitProgressPct = profitTargetUsd > 0 ? Math.min(100, Math.round(netGainUsd / profitTargetUsd * 1e4) / 100) : 100;
  let nextStatus = account.status;
  let breachReason = account.breachReason;
  let stepCompleted = false;
  const isInstant = rules.challengeType === "instant";
  if (account.status === "active" || account.status === "passed" || account.status === "completed") {
    if (overallDropUsd >= maxLossLimitUsd || equity <= maxBreachFloorUsd) {
      nextStatus = "failed";
      breachReason = `Maximum Drawdown Limit Breached (${rules.maxDrawdownPct}% | Loss: -$${overallDropUsd.toFixed(2)} | Max Limit: -$${maxLossLimitUsd.toFixed(2)})`;
    } else if (dailyDropUsd >= dailyLossLimitUsd || equity <= dailyBreachLevelUsd) {
      nextStatus = "failed";
      breachReason = `Daily Drawdown Limit Breached (${rules.dailyDrawdownPct}% | Daily Loss: -$${dailyDropUsd.toFixed(2)} | Daily Limit: -$${dailyLossLimitUsd.toFixed(2)})`;
    } else if (account.status === "active" && !isInstant && profitTargetUsd > 0 && netGainUsd >= profitTargetUsd) {
      stepCompleted = true;
      nextStatus = "passed";
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
    stepCompleted
  };
}
function evaluateAccountPayoutEligibility(account, openOrders = [], closedOrders = [], options) {
  const rules = resolveChallengeRulesForAccount(account);
  const predefinedRule = PREDEFINED_CHALLENGE_PASSING_RULES[rules.challengeType];
  const metrics = evaluateAccountRiskMetrics(account, openOrders);
  const totalSteps = predefinedRule.totalSteps;
  const currentStep = account.status === "passed" || account.status === "completed" ? Math.max(rules.currentStep, totalSteps || 1) : rules.currentStep;
  const strictlyOpenOrders = openOrders.filter(
    (o) => o.status === "OPEN" && String(o.status).toLowerCase() !== "closed" && !o.closeTime
  );
  const hasOpenPositions = strictlyOpenOrders.length > 0;
  const realizedProfitUsd = Math.round((account.balance - account.startingBalance) * 100) / 100;
  const effectiveEquityProfitUsd = Math.round((metrics.equity - account.startingBalance) * 100) / 100;
  const netProfitUsd = Math.max(0, Math.min(realizedProfitUsd, effectiveEquityProfitUsd));
  const profitSplitPct = account.profitSplitPct && account.profitSplitPct > 0 ? account.profitSplitPct : predefinedRule.profitSplitPct;
  const isBreached = account.status === "failed" || account.status === "suspended" || metrics.nextStatus === "failed";
  const isInstant = rules.challengeType === "instant";
  const isEvaluationPassed = !isInstant && (account.status === "passed" || account.status === "completed") && currentStep >= totalSteps;
  const consistencyRulePct = predefinedRule.consistencyRulePct;
  const closedForAcc = closedOrders.filter(
    (o) => o.accountId === account.id && (o.status === "CLOSED" || String(o.status).toLowerCase() === "closed")
  );
  const winningClosedForAcc = closedForAcc.filter((o) => o.netPnl > 0);
  const closedRealizedSumUsd = Math.round(closedForAcc.reduce((s, o) => s + (o.netPnl || 0), 0) * 100) / 100;
  const withdrawnGrossUsd = Math.max(0, Number(options?.withdrawnGrossProfitUsd || 0));
  const cumulativeEarnedProfitUsd = Math.round(Math.max(realizedProfitUsd + withdrawnGrossUsd, closedRealizedSumUsd) * 100) / 100;
  const requiredCumulativeProfitUsd = getRequiredCumulativeEvaluationProfitUsd(
    account.startingBalance,
    rules.challengeType
  );
  const hasMetCumulativeTarget = isInstant ? netProfitUsd > 0 : cumulativeEarnedProfitUsd + 0.01 >= requiredCumulativeProfitUsd;
  const totalClosedRealizedProfitUsd = Math.max(netProfitUsd, closedRealizedSumUsd);
  const maxSingleTradeProfitUsd = winningClosedForAcc.length > 0 ? Math.round(Math.max(...winningClosedForAcc.map((o) => o.netPnl)) * 100) / 100 : 0;
  const requiredConsistentProfitUsd = maxSingleTradeProfitUsd > 0 ? Math.round(maxSingleTradeProfitUsd / 0.15 * 100) / 100 : 0;
  const highestTradeSharePct = totalClosedRealizedProfitUsd > 0 && maxSingleTradeProfitUsd > 0 ? Math.round(maxSingleTradeProfitUsd / totalClosedRealizedProfitUsd * 1e4) / 100 : 0;
  const isConsistencyViolated = isInstant && winningClosedForAcc.length > 0 && netProfitUsd > 0 && highestTradeSharePct > consistencyRulePct;
  const isStepCompleted = isInstant || isEvaluationPassed;
  const hasPositiveProfit = netProfitUsd > 0;
  const ruleChecks = [
    {
      id: "drawdown_compliance",
      label: "Daily & Max Drawdown Rules",
      requiredText: `\u2264 ${predefinedRule.dailyDrawdownPct}% Daily / \u2264 ${predefinedRule.maxDrawdownPct}% Max`,
      actualText: isBreached ? "Breached" : `${metrics.dailyDrawdownUsedPct.toFixed(1)}% Daily / ${metrics.maxDrawdownUsedPct.toFixed(1)}% Max`,
      passed: !isBreached
    },
    ...isInstant ? [
      {
        id: "consistency_rule",
        label: "15% Consistency Rule",
        requiredText: "Best Trade \u2264 15% of Total Profit",
        actualText: winningClosedForAcc.length === 0 ? "Awaiting Closed Trades" : `${highestTradeSharePct.toFixed(1)}% Single Trade`,
        passed: !isConsistencyViolated
      }
    ] : [
      {
        id: "evaluation_phases",
        label: `Evaluation Phases (${totalSteps}-Step)`,
        requiredText: `${totalSteps} of ${totalSteps} Steps Passed`,
        actualText: isEvaluationPassed ? `${totalSteps}/${totalSteps} Passed` : `Step ${currentStep}/${totalSteps} Active`,
        passed: isEvaluationPassed
      },
      {
        id: "profit_target",
        label: `Predefined Target (+${predefinedRule.cumulativeProfitTargetPct}%)`,
        requiredText: `+$${requiredCumulativeProfitUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        actualText: `${cumulativeEarnedProfitUsd >= 0 ? "+" : ""}$${cumulativeEarnedProfitUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        passed: hasMetCumulativeTarget
      }
    ],
    {
      id: "open_positions",
      label: "Zero Open Positions",
      requiredText: "0 Open Trades",
      actualText: `${strictlyOpenOrders.length} Open`,
      passed: !hasOpenPositions
    },
    {
      id: "positive_balance_profit",
      label: "Withdrawable Net Profit",
      requiredText: "> $0.00 Available",
      actualText: `${realizedProfitUsd >= 0 ? "+" : ""}$${realizedProfitUsd.toFixed(2)}`,
      passed: hasPositiveProfit
    }
  ];
  const eligible = !isBreached && !hasOpenPositions && isStepCompleted && hasMetCumulativeTarget && hasPositiveProfit && !isConsistencyViolated;
  const maxWithdrawableUsd = eligible ? Math.round(netProfitUsd * (profitSplitPct / 100) * 100) / 100 : 0;
  let reason = "Account has verified all predefined challenge passing rules and is unlocked for profit payout withdrawal.";
  if (isBreached) {
    reason = metrics.breachReason || account.breachReason || "Account is breached due to Daily/Maximum Drawdown violation. Terminal password has been revoked and payouts are permanently disabled.";
  } else if (hasOpenPositions) {
    reason = `Open Position Active: Please close all ${strictlyOpenOrders.length} open position(s) in the terminal before requesting a payout.`;
  } else if (!isStepCompleted) {
    if (rules.challengeType === "two_step") {
      const step1TargetUsd = Math.round(account.startingBalance * 0.08 * 100) / 100;
      const step2TargetUsd = Math.round(account.startingBalance * 0.05 * 100) / 100;
      if (currentStep <= 1) {
        reason = `2-Step Challenge Locked (Step 1 of 2 Active): Pass Step 1 (+8% / +$${step1TargetUsd.toLocaleString()}) and Step 2 (+5% / +$${step2TargetUsd.toLocaleString()}) while staying within 5% Daily & 10% Max Drawdown to become Funded and unlock Payouts.`;
      } else {
        reason = `2-Step Challenge Locked (Step 2 of 2 Active \u2014 Step 1 Passed \u2713): Reach the Step 2 profit target (+5% / +$${step2TargetUsd.toLocaleString()}) above your Step 2 baseline ($${getMinimumPhaseStartBalance(account.startingBalance, "two_step", 2, account.phaseStartingBalance).toLocaleString()}) to become Funded and unlock Payouts.`;
      }
    } else if (rules.challengeType === "three_step") {
      const stepTargetUsd = Math.round(account.startingBalance * 0.06 * 100) / 100;
      reason = `3-Step Challenge Locked (Step ${currentStep} of 3 Active): Pass all 3 evaluation steps (+6% / +$${stepTargetUsd.toLocaleString()} per step) while staying within 5% Daily & 12% Max Drawdown to become Funded and unlock Payouts.`;
    } else {
      const step1TargetUsd = Math.round(account.startingBalance * 0.1 * 100) / 100;
      reason = `1-Step Challenge Locked (Evaluation in progress): Reach the +10% profit target (+$${step1TargetUsd.toLocaleString()}) while staying within 4% Daily & 6% Max Drawdown to pass evaluation and unlock Funded Payouts.`;
    }
  } else if (!hasMetCumulativeTarget) {
    reason = `${predefinedRule.label} Target Not Met: Cumulative verified profit (+$${cumulativeEarnedProfitUsd.toFixed(2)}) is below the required +${predefinedRule.cumulativeProfitTargetPct}% evaluation target (+$${requiredCumulativeProfitUsd.toFixed(2)}).`;
  } else if (!hasPositiveProfit) {
    reason = `No positive realized P&L available to withdraw (Current Realized P&L: ${realizedProfitUsd >= 0 ? "+" : ""}$${realizedProfitUsd.toFixed(2)}). Generate trading profit above $${account.startingBalance.toLocaleString()} starting capital to request a payout.`;
  } else if (isConsistencyViolated) {
    reason = `Instant Funding 15% Consistency Rule: Highest single trade profit (+$${maxSingleTradeProfitUsd.toFixed(2)}) is ${highestTradeSharePct.toFixed(1)}% of total profit (+$${totalClosedRealizedProfitUsd.toFixed(2)}), exceeding the 15% consistency limit. Required total profit to unlock payout: +$${requiredConsistentProfitUsd.toFixed(2)}.`;
  }
  return {
    accountId: account.id,
    accountNumber: account.accountNumber,
    challengeTitle: account.challengeTitle,
    challengeType: rules.challengeType,
    status: metrics.nextStatus === "failed" ? "failed" : account.status,
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
    reason
  };
}
function validatePayoutRequestAgainstRules(params) {
  const { account, amountUsd, method, destination } = params;
  const openOrders = params.openOrders || [];
  const closedOrders = params.closedOrders || [];
  const rules = resolveChallengeRulesForAccount(account);
  const withdrawnGrossProfitUsd = (params.existingPayouts || []).filter((p) => p.accountId === account.id && p.status !== "Rejected").reduce(
    (sum, p) => sum + (Number(p.grossProfitDeducted) || Number(p.amountUsd || 0) / ((rules.profitSplitPct || 80) / 100)),
    0
  );
  const eligibility = evaluateAccountPayoutEligibility(account, openOrders, closedOrders, {
    withdrawnGrossProfitUsd
  });
  if (!eligibility.eligible) {
    return {
      valid: false,
      error: eligibility.reason,
      eligibility
    };
  }
  const requestedUsd = Math.round(Number(amountUsd) * 100) / 100;
  if (!Number.isFinite(requestedUsd) || requestedUsd < 20) {
    return {
      valid: false,
      error: "Minimum payout withdrawal amount is $20.00 USD.",
      eligibility
    };
  }
  if (requestedUsd > eligibility.maxWithdrawableUsd) {
    return {
      valid: false,
      error: `Requested amount ($${requestedUsd.toFixed(2)}) exceeds your ${eligibility.profitSplitPct}% profit split limit ($${eligibility.maxWithdrawableUsd.toFixed(2)}).`,
      eligibility
    };
  }
  if (!String(method || "").trim()) {
    return {
      valid: false,
      error: "Please select a valid payout settlement method.",
      eligibility
    };
  }
  const cleanDest = String(destination || "").trim();
  if (cleanDest.length < 8) {
    return {
      valid: false,
      error: "Please enter a valid receiving wallet address or bank wire destination (minimum 8 characters).",
      eligibility
    };
  }
  return {
    valid: true,
    eligibility
  };
}

// server.ts
function readCliFlag(names) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    for (const name of names) {
      if (arg === name && args[i + 1] && !args[i + 1].startsWith("-")) {
        return args[i + 1];
      }
      if (arg.startsWith(`${name}=`)) {
        return arg.slice(name.length + 1);
      }
    }
  }
  return void 0;
}
var cliPortRaw = readCliFlag(["--port", "-p"]);
var envPortRaw = process.env.PORT && process.env.PORT !== process.env.NGINX_PORT ? process.env.PORT : process.env.DEFAULT_APP_PORT;
var PORT = Number(cliPortRaw || envPortRaw) || 3e3;
var HOST = readCliFlag(["--host"]) || "0.0.0.0";
var isBundledProdServer = typeof __filename !== "undefined" && __filename.endsWith("server.cjs");
var isProduction = isBundledProdServer || process.env.NODE_ENV === "production";
async function startServer() {
  const app = (0, import_express.default)();
  app.use(import_express.default.json({ limit: "15mb" }));
  app.get("/api/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "fundedapex.com",
      supportEmail: "fundedapexsupport@gmail.com",
      mode: isProduction ? "production" : "development",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
  });
  const DATA_DIR = import_node_path.default.resolve(process.cwd(), ".data");
  const VAULT_FILE = import_node_path.default.join(DATA_DIR, "apex_vault.json");
  let memoryVaultCache = null;
  function readServerVault() {
    if (memoryVaultCache !== null) {
      return memoryVaultCache;
    }
    try {
      if (import_node_fs.default.existsSync(VAULT_FILE)) {
        const raw = import_node_fs.default.readFileSync(VAULT_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          memoryVaultCache = parsed;
          return parsed;
        }
      }
    } catch {
    }
    memoryVaultCache = {};
    return memoryVaultCache;
  }
  function writeServerVault(incoming) {
    try {
      if (!import_node_fs.default.existsSync(DATA_DIR)) {
        import_node_fs.default.mkdirSync(DATA_DIR, { recursive: true });
      }
      const existing = readServerVault();
      const mergeById = (arrA = [], arrB = [], keyField = "id") => {
        const map = /* @__PURE__ */ new Map();
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
      let incomingPurchaseRequests = incoming.purchaseRequests || incoming.purchase_requests || [];
      if (incoming.purchaseRequest && typeof incoming.purchaseRequest === "object") {
        incomingPurchaseRequests = [incoming.purchaseRequest, ...Array.isArray(incomingPurchaseRequests) ? incomingPurchaseRequests : []];
      }
      let incomingPayouts = incoming.payouts || incoming.payout_requests || [];
      if (incoming.payoutRequest && typeof incoming.payoutRequest === "object") {
        incomingPayouts = [
          incoming.payoutRequest,
          ...Array.isArray(incomingPayouts) ? incomingPayouts : []
        ];
      }
      const incomingDeletedPayoutIds = Array.isArray(incoming.deletedPayoutIds) ? incoming.deletedPayoutIds.map((id) => String(id)) : [];
      const existingDeletedPayoutIds = Array.isArray(existing.deletedPayoutIds) ? existing.deletedPayoutIds.map((id) => String(id)) : [];
      const unarchivedIds = new Set(
        incoming.payoutRequest?.id ? [String(incoming.payoutRequest.id)] : []
      );
      const deletedPayoutSet = new Set(
        [...existingDeletedPayoutIds, ...incomingDeletedPayoutIds].filter(
          (id) => id && !unarchivedIds.has(id)
        )
      );
      const mergedPayouts = mergeById(existing.payouts, incomingPayouts, "id").filter(
        (p) => p?.id && !deletedPayoutSet.has(String(p.id))
      );
      const merged = {
        ...existing,
        ...incoming,
        users: mergeUserDirectories(existing.users, incoming.users),
        accounts: mergeById(existing.accounts, incoming.accounts || incoming.trading_accounts, "id"),
        orders: mergeById(existing.orders, incoming.orders, "id"),
        purchaseRequests: mergeById(existing.purchaseRequests, incomingPurchaseRequests, "id"),
        coupons: mergeById(existing.coupons, incoming.coupons, "id"),
        adminCoupons: mergeById(existing.adminCoupons, incoming.adminCoupons, "id"),
        payouts: mergedPayouts,
        deletedPayoutIds: Array.from(deletedPayoutSet),
        emailNotifications: mergeById(
          existing.emailNotifications,
          incoming.emailNotifications,
          "id"
        ),
        paymentSettings: incoming.paymentSettings ? { ...existing.paymentSettings || {}, ...incoming.paymentSettings } : existing.paymentSettings,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      memoryVaultCache = merged;
      import_node_fs.default.writeFileSync(VAULT_FILE, JSON.stringify(merged), "utf-8");
      return merged;
    } catch {
      return incoming;
    }
  }
  app.get("/api/vault/sync", (_req, res) => {
    const data = readServerVault();
    res.status(200).json({ ok: true, vault: data });
  });
  app.post("/api/vault/sync", (req, res) => {
    const merged = writeServerVault(req.body || {});
    res.status(200).json({ ok: true, vault: merged });
  });
  app.post("/api/vault/save", (req, res) => {
    const merged = writeServerVault(req.body || {});
    res.status(200).json({ ok: true, vault: merged });
  });
  app.post("/api/vault/purchase-request", (req, res) => {
    const payload = req.body;
    if (!payload || !payload.id && !payload.orderNumber) {
      res.status(400).json({ ok: false, error: "Invalid purchase request payload." });
      return;
    }
    const merged = writeServerVault({ purchaseRequest: payload });
    res.status(200).json({
      ok: true,
      message: "Purchase request received and secured in institutional vault.",
      purchaseRequests: merged.purchaseRequests
    });
  });
  app.get("/api/vault/purchase-requests", (_req, res) => {
    const data = readServerVault();
    res.status(200).json({
      ok: true,
      purchaseRequests: Array.isArray(data.purchaseRequests) ? data.purchaseRequests : []
    });
  });
  app.post("/api/vault/payout-request", (req, res) => {
    const payload = req.body;
    if (!payload || !payload.id) {
      res.status(400).json({ ok: false, error: "Invalid payout request payload." });
      return;
    }
    const amountUsd = Number(payload.amountUsd);
    const destination = String(payload.destination || "").trim();
    const method = String(payload.currency || payload.paymentMethod || "USDT").trim();
    if (!Number.isFinite(amountUsd) || amountUsd < 20) {
      res.status(400).json({ ok: false, error: "Minimum payout withdrawal amount is $20.00 USD." });
      return;
    }
    if (destination.length < 8) {
      res.status(400).json({
        ok: false,
        error: "Please enter a valid receiving wallet address or bank wire destination (minimum 8 characters)."
      });
      return;
    }
    const existingVault = readServerVault();
    const storedAcc = Array.isArray(existingVault.accounts) ? existingVault.accounts.find((a) => a && a.id === payload.accountId) : null;
    if (storedAcc) {
      const vaultOrders = Array.isArray(existingVault.orders) ? existingVault.orders : [];
      const openOrders = vaultOrders.filter(
        (o) => o && o.accountId === storedAcc.id && o.status === "OPEN"
      );
      const closedOrders = vaultOrders.filter(
        (o) => o && o.accountId === storedAcc.id && o.status === "CLOSED"
      );
      const existingPayouts = Array.isArray(existingVault.payouts) ? existingVault.payouts : [];
      const serverCheck = validatePayoutRequestAgainstRules({
        account: storedAcc,
        amountUsd,
        method,
        destination,
        openOrders,
        closedOrders,
        existingPayouts
      });
      if (!serverCheck.valid) {
        res.status(400).json({
          ok: false,
          error: serverCheck.error || serverCheck.eligibility.reason,
          eligibility: serverCheck.eligibility
        });
        return;
      }
    }
    const merged = writeServerVault({ payoutRequest: payload });
    res.status(200).json({
      ok: true,
      message: "Payout request received and synced to Admin Panel vault.",
      payouts: merged.payouts
    });
  });
  app.get("/api/vault/payouts", (_req, res) => {
    const data = readServerVault();
    res.status(200).json({
      ok: true,
      payouts: Array.isArray(data.payouts) ? data.payouts : [],
      deletedPayoutIds: Array.isArray(data.deletedPayoutIds) ? data.deletedPayoutIds : []
    });
  });
  app.delete("/api/vault/payout/:id", (req, res) => {
    const payoutId = String(req.params.id || "").trim();
    if (!payoutId) {
      res.status(400).json({ ok: false, error: "Missing payout id." });
      return;
    }
    try {
      if (!import_node_fs.default.existsSync(DATA_DIR)) {
        import_node_fs.default.mkdirSync(DATA_DIR, { recursive: true });
      }
      const existing = readServerVault();
      const nextPayouts = Array.isArray(existing.payouts) ? existing.payouts.filter((p) => p?.id !== payoutId) : [];
      const prevDeleted = Array.isArray(existing.deletedPayoutIds) ? existing.deletedPayoutIds.map((id) => String(id)) : [];
      const deletedPayoutIds = Array.from(/* @__PURE__ */ new Set([...prevDeleted, payoutId]));
      const updated = {
        ...existing,
        payouts: nextPayouts,
        deletedPayoutIds,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      memoryVaultCache = updated;
      import_node_fs.default.writeFileSync(VAULT_FILE, JSON.stringify(updated), "utf-8");
      res.status(200).json({ ok: true, payouts: nextPayouts, deletedPayoutIds });
    } catch {
      res.status(500).json({ ok: false, error: "Failed to delete payout." });
    }
  });
  app.post("/api/email/dispatch", (req, res) => {
    const mail = req.body;
    if (!mail || !mail.to || !mail.subject) {
      res.status(400).json({ ok: false, error: "Missing required email fields (to, subject)." });
      return;
    }
    const existing = readServerVault();
    const list = Array.isArray(existing.emailNotifications) ? existing.emailNotifications : [];
    const enriched = {
      ...mail,
      id: mail.id || `mail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sentAt: mail.sentAt || (/* @__PURE__ */ new Date()).toISOString(),
      deliveryStatus: "delivered"
    };
    writeServerVault({ emailNotifications: [enriched, ...list.slice(0, 199)] });
    res.status(200).json({
      ok: true,
      email: enriched,
      provider: "FUNDED APEX Transactional Mail Relay (fundedapexsupport@gmail.com)"
    });
  });
  app.get("/api/email/inbox", (req, res) => {
    const emailFilter = String(req.query.email || "").trim().toLowerCase();
    const existing = readServerVault();
    const list = Array.isArray(existing.emailNotifications) ? existing.emailNotifications : [];
    const filtered = emailFilter ? list.filter(
      (m) => String(m.to || "").toLowerCase() === emailFilter || String(m.to || "").toLowerCase() === "all@fundedapex.com"
    ) : list;
    res.status(200).json({ ok: true, emails: filtered });
  });
  let cachedQuotesResponse = null;
  let inFlightQuotesPromise = null;
  const fetchMarketQuotesSnapshot = async () => {
    const now = Date.now();
    if (cachedQuotesResponse && now - cachedQuotesResponse.ts < 2200) {
      return cachedQuotesResponse.payload;
    }
    if (inFlightQuotesPromise) {
      return inFlightQuotesPromise;
    }
    const symbolsParam = encodeURIComponent(
      JSON.stringify([
        "BTCUSDT",
        "ETHUSDT",
        "SOLUSDT",
        "XRPUSDT",
        "BNBUSDT",
        "PAXGUSDT"
      ])
    );
    const swissquotePairs = [
      ["XAUUSD", "XAU/USD"],
      ["XAGUSD", "XAG/USD"],
      ["EURUSD", "EUR/USD"],
      ["GBPUSD", "GBP/USD"],
      ["USDJPY", "USD/JPY"],
      ["USDCHF", "USD/CHF"],
      ["AUDUSD", "AUD/USD"],
      ["USDCAD", "USD/CAD"],
      ["NZDUSD", "NZD/USD"],
      ["EURGBP", "EUR/GBP"],
      ["EURJPY", "EUR/JPY"],
      ["GBPJPY", "GBP/JPY"]
    ];
    const spotQuotes = {};
    const fetchSwissquote = async () => {
      await Promise.all(
        swissquotePairs.map(async ([sym, sqPath]) => {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 2200);
            const r = await fetch(
              `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${sqPath}`,
              { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } }
            );
            clearTimeout(timer);
            if (r.ok) {
              const j = await r.json();
              const prices = j?.[0]?.spreadProfilePrices;
              const best = prices?.find(
                (p) => /zero|prime|premium|standard|elite/i.test(p.spreadProfile || "")
              ) || prices?.[0];
              if (best && Number(best.bid) > 0 && Number(best.ask) > 0) {
                spotQuotes[sym] = {
                  bid: Number(best.bid),
                  ask: Number(best.ask)
                };
              }
            }
          } catch {
          }
        })
      );
      if (!spotQuotes.XAUUSD) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 2e3);
          const r = await fetch("https://api.gold-api.com/price/XAU", { signal: ctrl.signal });
          clearTimeout(timer);
          if (r.ok) {
            const j = await r.json();
            const price = Number(j?.price);
            if (price > 0) {
              spotQuotes.XAUUSD = { bid: price - 0.18, ask: price + 0.18 };
            }
          }
        } catch {
        }
      }
    };
    const fetchBinance = async () => {
      for (const host of ["https://data-api.binance.vision", "https://api.binance.com"]) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 2500);
          const r = await fetch(`${host}/api/v3/ticker/24hr?symbols=${symbolsParam}`, {
            signal: ctrl.signal
          });
          clearTimeout(timer);
          if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data)) return data;
          }
        } catch {
        }
      }
      return [];
    };
    inFlightQuotesPromise = (async () => {
      const [, tickers] = await Promise.all([fetchSwissquote(), fetchBinance()]);
      const payload = {
        ok: tickers.length > 0 || Object.keys(spotQuotes).length > 0,
        tickers,
        spotQuotes
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
  app.get("/api/market/quotes", async (_req, res) => {
    try {
      const result = await fetchMarketQuotesSnapshot();
      res.status(200).json(result);
    } catch {
      res.status(200).json({ ok: false, tickers: [], spotQuotes: {} });
    }
  });
  const klinesCache = /* @__PURE__ */ new Map();
  app.get("/api/market/klines", async (req, res) => {
    const rawSymbol = String(req.query.symbol || "XAUUSD").toUpperCase();
    const interval = String(req.query.interval || "15m");
    const limit = Math.min(500, Math.max(20, Number(req.query.limit) || 350));
    const cacheKey = `${rawSymbol}:${interval}:${limit}`;
    const cachedKline = klinesCache.get(cacheKey);
    if (cachedKline && Date.now() - cachedKline.ts < 6e3) {
      res.status(200).json(cachedKline.payload);
      return;
    }
    const yahooSymbolMap = {
      XAUUSD: "GC=F",
      GOLD: "GC=F",
      PAXGUSDT: "GC=F",
      XAGUSD: "SI=F",
      USOIL: "CL=F",
      UKOIL: "BZ=F",
      EURUSD: "EURUSD=X",
      GBPUSD: "GBPUSD=X",
      USDJPY: "JPY=X",
      USDCHF: "CHF=X",
      AUDUSD: "AUDUSD=X",
      USDCAD: "CAD=X",
      NZDUSD: "NZDUSD=X",
      EURGBP: "EURGBP=X",
      EURJPY: "EURJPY=X",
      GBPJPY: "GBPJPY=X",
      NAS100: "NQ=F",
      US30: "YM=F",
      US500: "ES=F",
      GER40: "^GDAXI",
      UK100: "^FTSE"
    };
    const yahooTicker = yahooSymbolMap[rawSymbol];
    if (yahooTicker) {
      try {
        const normInt = interval === "1M" ? "1mo" : interval.toLowerCase();
        const is4h = normInt === "4h";
        const yfInterval = normInt === "1m" ? "1m" : normInt === "5m" ? "5m" : normInt === "15m" ? "15m" : normInt === "30m" ? "30m" : normInt === "1h" || is4h ? "60m" : normInt === "1w" ? "1wk" : normInt === "1mo" ? "1mo" : "1d";
        const yfRange = normInt === "1m" ? "5d" : normInt === "5m" || normInt === "15m" || normInt === "30m" ? "1mo" : normInt === "1h" || is4h ? "6mo" : normInt === "1w" || normInt === "1mo" ? "5y" : "2y";
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3200);
        const yfRes = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            yahooTicker
          )}?interval=${yfInterval}&range=${yfRange}`,
          {
            signal: ctrl.signal,
            headers: { "User-Agent": "Mozilla/5.0" }
          }
        );
        clearTimeout(timer);
        if (yfRes.ok) {
          const yfJson = await yfRes.json();
          const result = yfJson?.chart?.result?.[0];
          const timestamps = result?.timestamp || [];
          const quoteObj = result?.indicators?.quote?.[0] || {};
          const opens = quoteObj.open || [];
          const highs = quoteObj.high || [];
          const lows = quoteObj.low || [];
          const closes = quoteObj.close || [];
          const volumes = quoteObj.volume || [];
          const parsedBars = [];
          for (let i = 0; i < timestamps.length; i++) {
            const o = opens[i];
            const h = highs[i];
            const l = lows[i];
            const c = closes[i];
            if (o === null || h === null || l === null || c === null || !Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c) || o <= 0 || c <= 0) {
              continue;
            }
            const rawVol = volumes[i];
            const v = rawVol && Number.isFinite(rawVol) && Number(rawVol) > 0 ? Number(rawVol) : Math.max(40, Math.round((h - l) / Math.max(1e-6, c) * 35e3));
            parsedBars.push([
              timestamps[i] * 1e3,
              String(o),
              String(h),
              String(l),
              String(c),
              String(v)
            ]);
          }
          if (parsedBars.length >= 25) {
            if (parsedBars.length >= 2) {
              const lastBar = parsedBars[parsedBars.length - 1];
              const prevBar = parsedBars[parsedBars.length - 2];
              const lastO = parseFloat(lastBar[1]);
              const lastH = parseFloat(lastBar[2]);
              const lastL = parseFloat(lastBar[3]);
              const lastC = parseFloat(lastBar[4]);
              if (lastO === lastH && lastH === lastL && lastL === lastC) {
                prevBar[2] = String(Math.max(parseFloat(prevBar[2]), lastC));
                prevBar[3] = String(Math.min(parseFloat(prevBar[3]), lastC));
                prevBar[4] = String(lastC);
                parsedBars.pop();
              }
            }
            if (is4h) {
              const agg4h = [];
              for (let i = 0; i < parsedBars.length; i += 4) {
                const chunk = parsedBars.slice(i, i + 4);
                if (chunk.length === 0) continue;
                const open = chunk[0][1];
                const close = chunk[chunk.length - 1][4];
                const high = String(Math.max(...chunk.map((b) => parseFloat(b[2]))));
                const low = String(Math.min(...chunk.map((b) => parseFloat(b[3]))));
                const vol = String(chunk.reduce((s, b) => s + parseFloat(b[5]), 0));
                agg4h.push([chunk[0][0], open, high, low, close, vol]);
              }
              const payload4h = { ok: true, klines: agg4h.slice(-limit), source: "yahoo" };
              klinesCache.set(cacheKey, { ts: Date.now(), payload: payload4h });
              res.status(200).json(payload4h);
              return;
            }
            const payloadStd = { ok: true, klines: parsedBars.slice(-limit), source: "yahoo" };
            klinesCache.set(cacheKey, { ts: Date.now(), payload: payloadStd });
            res.status(200).json(payloadStd);
            return;
          }
        }
      } catch {
      }
    }
    const binanceSymbol = rawSymbol === "XAUUSD" || rawSymbol === "GOLD" ? "PAXGUSDT" : rawSymbol === "BTCUSD" ? "BTCUSDT" : rawSymbol === "ETHUSD" ? "ETHUSDT" : rawSymbol === "SOLUSD" ? "SOLUSDT" : rawSymbol === "XRPUSD" ? "XRPUSDT" : rawSymbol === "BNBUSD" ? "BNBUSDT" : rawSymbol;
    for (const host of ["https://data-api.binance.vision", "https://api.binance.com"]) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3e3);
        const r = await fetch(
          `${host}/api/v3/klines?symbol=${encodeURIComponent(
            binanceSymbol
          )}&interval=${encodeURIComponent(interval)}&limit=${limit}`,
          { signal: ctrl.signal }
        );
        clearTimeout(timer);
        if (r.ok) {
          const data = await r.json();
          const payloadBin = { ok: true, klines: data, source: "binance" };
          klinesCache.set(cacheKey, { ts: Date.now(), payload: payloadBin });
          res.status(200).json(payloadBin);
          return;
        }
      } catch {
      }
    }
    res.status(200).json({ ok: false, klines: [] });
  });
  const httpServer = import_node_http.default.createServer(app);
  const ohlcWss = new import_ws.WebSocketServer({ noServer: true });
  const ohlcSubscribers = /* @__PURE__ */ new Map();
  const formingOhlcBars = /* @__PURE__ */ new Map();
  const resolveIntervalSeconds = (intervalRaw) => {
    const key = String(intervalRaw || "15m").trim();
    const map = {
      "1s": 1,
      "1m": 60,
      "3m": 180,
      "5m": 300,
      "15m": 900,
      "30m": 1800,
      "1h": 3600,
      "2h": 7200,
      "4h": 14400,
      "1d": 86400,
      "1D": 86400,
      "1w": 604800,
      "1W": 604800,
      "1M": 2592e3,
      "1mo": 2592e3
    };
    return map[key] || map[key.toLowerCase()] || 900;
  };
  const resolveLatestBarFromKlineCache = (symbol, interval) => {
    const cached = klinesCache.get(`${symbol}:${interval}:350`) || klinesCache.get(`${symbol}:${interval}:150`) || Array.from(klinesCache.entries()).find(([k]) => k.startsWith(`${symbol}:${interval}:`))?.[1];
    const klines = cached?.payload?.klines;
    if (!Array.isArray(klines) || klines.length === 0) return null;
    const last = klines[klines.length - 1];
    if (!Array.isArray(last) || last.length < 5) return null;
    const rawTs = Number(last[0]);
    const timeSec = rawTs > 1e11 ? Math.floor(rawTs / 1e3) : Math.floor(rawTs);
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
      volume: Number.isFinite(volume) && volume > 0 ? volume : 100
    };
  };
  const resolvePriceFromSnapshot = (symbol, snapshot) => {
    const spot = snapshot.spotQuotes?.[symbol];
    if (spot && Number(spot.bid) > 0) {
      return Number(spot.bid);
    }
    const binanceMap = {
      BTCUSD: "BTCUSDT",
      ETHUSD: "ETHUSDT",
      SOLUSD: "SOLUSDT",
      XRPUSD: "XRPUSDT",
      BNBUSD: "BNBUSDT",
      XAUUSD: "PAXGUSDT"
    };
    const bSym = binanceMap[symbol];
    if (bSym && Array.isArray(snapshot.tickers)) {
      const t = snapshot.tickers.find((x) => String(x?.symbol).toUpperCase() === bSym);
      const px = Number(t?.bidPrice || t?.lastPrice || 0);
      if (px > 0) return px;
    }
    return null;
  };
  const buildAndUpdateFormingBar = (symbol, interval, price) => {
    const secStep = resolveIntervalSeconds(interval);
    const nowSec = Math.floor(Date.now() / 1e3);
    const bucketSec = Math.floor(nowSec / secStep) * secStep;
    const key = `${symbol}:${interval}`;
    const prev = formingOhlcBars.get(key);
    if (!prev || prev.time !== bucketSec) {
      const seedOpen = prev ? prev.close : price;
      const nextBar = {
        time: bucketSec,
        open: seedOpen,
        high: Math.max(seedOpen, price),
        low: Math.min(seedOpen, price),
        close: price,
        volume: 25
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
      volume: prev.volume + 1
    };
    formingOhlcBars.set(key, updatedBar);
    return updatedBar;
  };
  let ohlcBroadcastTimer = null;
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
          if (clientWs.readyState !== import_ws.WebSocket.OPEN) return;
          const price = resolvePriceFromSnapshot(sub.symbol, snapshot);
          const bar = price && price > 0 ? buildAndUpdateFormingBar(sub.symbol, sub.interval, price) : resolveLatestBarFromKlineCache(sub.symbol, sub.interval);
          if (!bar) return;
          clientWs.send(
            JSON.stringify({
              type: "ohlc",
              symbol: sub.symbol,
              interval: sub.interval,
              bar,
              source: snapshot.spotQuotes?.[sub.symbol] ? "swissquote-spot-ws" : price ? "binance-ws" : "yahoo-kline-ws",
              serverTime
            })
          );
        });
      } catch {
      }
    }, 2e3);
  };
  httpServer.on("upgrade", (request, socket, head) => {
    try {
      const reqUrl = new URL(request.url || "/", "http://localhost");
      if (reqUrl.pathname === "/ws/ohlc") {
        ohlcWss.handleUpgrade(request, socket, head, (ws) => {
          ohlcWss.emit("connection", ws, request);
        });
      }
    } catch {
      socket.destroy();
    }
  });
  ohlcWss.on("connection", (ws) => {
    ohlcSubscribers.set(ws, { symbol: "XAUUSD", interval: "15m" });
    ensureOhlcBroadcastLoop();
    ws.on("message", async (rawData) => {
      try {
        const msg = JSON.parse(String(rawData || "{}"));
        if (msg?.type === "ping") {
          if (ws.readyState === import_ws.WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "pong", serverTime: Date.now() }));
          }
          return;
        }
        if (msg?.type === "subscribe") {
          const symbol = String(msg.symbol || "XAUUSD").toUpperCase();
          const interval = String(msg.interval || "15m");
          ohlcSubscribers.set(ws, { symbol, interval });
          ensureOhlcBroadcastLoop();
          if (ws.readyState === import_ws.WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "subscribed",
                symbol,
                interval,
                serverTime: Date.now()
              })
            );
            const snapshot = await fetchMarketQuotesSnapshot().catch(() => null);
            const price = snapshot ? resolvePriceFromSnapshot(symbol, snapshot) : null;
            if (price && price > 0 && ws.readyState === import_ws.WebSocket.OPEN) {
              const bar = buildAndUpdateFormingBar(symbol, interval, price);
              ws.send(
                JSON.stringify({
                  type: "ohlc",
                  symbol,
                  interval,
                  bar,
                  source: snapshot?.spotQuotes?.[symbol] ? "swissquote-spot-ws" : "binance-ws",
                  serverTime: Date.now()
                })
              );
            }
          }
        }
      } catch {
      }
    });
    ws.on("close", () => {
      ohlcSubscribers.delete(ws);
      if (ohlcSubscribers.size === 0 && ohlcBroadcastTimer) {
        clearInterval(ohlcBroadcastTimer);
        ohlcBroadcastTimer = null;
      }
    });
  });
  let viteInstance = null;
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const disableHmr = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        ...disableHmr ? { watch: null } : {}
      },
      appType: "spa"
    });
    viteInstance = vite;
    app.use(vite.middlewares);
  } else {
    const candidateDist = import_node_path.default.resolve(process.cwd(), "dist");
    const distPath = import_node_fs.default.existsSync(import_node_path.default.join(candidateDist, "index.html")) ? candidateDist : process.cwd();
    app.use(
      import_express.default.static(distPath, {
        index: false,
        maxAge: "1h"
      })
    );
    app.get("*", (_req, res) => {
      const indexFile = import_node_path.default.join(distPath, "index.html");
      if (import_node_fs.default.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(200).send("FUNDED APEX Platform is running.");
      }
    });
  }
  httpServer.on("error", (err) => {
    console.error("[FUNDED APEX] HTTP server error:", err);
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
    }
    try {
      if (viteInstance) await viteInstance.close();
    } catch {
    }
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await new Promise((resolve) => {
    httpServer.listen(PORT, HOST, () => {
      console.log(
        `[FUNDED APEX] Server listening on http://${HOST}:${PORT} (mode: ${isProduction ? "production" : "development"})`
      );
      resolve();
    });
  });
}
startServer().catch((err) => {
  console.error("[FUNDED APEX] Failed to start server:", err);
  process.exit(1);
});
