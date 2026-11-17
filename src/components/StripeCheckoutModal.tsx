import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlatform } from '../context/PlatformContext';
import {
  COUNTRIES,
  INITIAL_CHALLENGES,
} from '../data/platformData';
import { computeStripeCheckoutBreakdown } from '../engine/stripeCheckout';
import { FundedApexLogo } from './FundedApexLogo';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Coins,
  Copy,
  CreditCard,
  Lock,
  RefreshCw,
  ShieldCheck,
  Tag,
  Upload,
  X,
} from 'lucide-react';

interface CryptoNetworkOption {
  id: string;
  coin: string;
  network: string;
  standard: string;
  iconSymbol: string;
  defaultAddress: string;
}

const CRYPTO_NETWORKS: CryptoNetworkOption[] = [
  {
    id: 'usdt_bep20',
    coin: 'USDT',
    network: 'BNB Chain',
    standard: 'BSC (BEP20)',
    iconSymbol: '₮',
    defaultAddress: '0x8F49aC7E219B40FundedApex7291E8823c91A421',
  },
  {
    id: 'usdt_trc20',
    coin: 'USDT',
    network: 'TRON',
    standard: 'TRC20 (TRON)',
    iconSymbol: '₮',
    defaultAddress: 'TX9k8pApexPropFirmVault7729LmQ2WzB',
  },
  {
    id: 'bnb_bep20',
    coin: 'BNB',
    network: 'BNB Chain',
    standard: 'BSC (BEP20)',
    iconSymbol: 'BNB',
    defaultAddress: '0x8F49aC7E219B40FundedApex7291E8823c91A421',
  },
  {
    id: 'btc',
    coin: 'BTC',
    network: 'Bitcoin',
    standard: 'BTC',
    iconSymbol: '₿',
    defaultAddress: 'bc1qapex7729lmq2wzbfundedpropfirm9982k',
  },
  {
    id: 'usdt_erc20',
    coin: 'USDT',
    network: 'Ethereum',
    standard: 'ERC20 (Ethereum)',
    iconSymbol: '₮',
    defaultAddress: '0x8F49aC7E219B40FundedApex7291E8823c91A421',
  },
  {
    id: 'eth_erc20',
    coin: 'ETH',
    network: 'Ethereum',
    standard: 'ERC20 (Ethereum)',
    iconSymbol: 'Ξ',
    defaultAddress: '0x8F49aC7E219B40FundedApex7291E8823c91A421',
  },
  {
    id: 'sol',
    coin: 'SOL',
    network: 'Solana',
    standard: 'Solana',
    iconSymbol: '◎',
    defaultAddress: 'APEX7729LmQ2WzBFundedPropFirmVaultSolanaKey',
  },
  {
    id: 'usdt_arbitrum',
    coin: 'USDT',
    network: 'Arbitrum',
    standard: 'Arbitrum One (USDT)',
    iconSymbol: '₮',
    defaultAddress: '0x8F49aC7E219B40FundedApex7291E8823c91A421',
  },
  {
    id: 'usdt_aptos',
    coin: 'USDT',
    network: 'Aptos',
    standard: 'Aptos',
    iconSymbol: '₮',
    defaultAddress: '0x8F49aC7E219B40FundedApex7291E8823c91A421',
  },
];

type CheckoutStep =
  | 'INITIAL_LOADING'
  | 'CHOOSE_PAYMENT_METHOD'
  | 'PROCESSING_METHOD'
  | 'SELECT_COIN_NETWORK'
  | 'PREPARING_STRINGS'
  | 'SEND_CRYPTO'
  | 'VERIFYING_DEPOSIT'
  | 'CONFIRMED';

interface CheckoutProcessingScreenProps {
  testId: string;
  title: string;
  subtitle: string;
  steps: string[];
  durationMs: number;
  icon?: 'lock' | 'coins' | 'shield';
}

const CheckoutProcessingScreen: React.FC<CheckoutProcessingScreenProps> = ({
  testId,
  title,
  subtitle,
  steps,
  durationMs,
  icon = 'shield',
}) => {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    setActiveIdx(0);
    if (steps.length <= 1) return;
    const intervalMs = Math.max(120, Math.floor((durationMs * 0.85) / steps.length));
    const timer = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1 < steps.length ? prev + 1 : prev));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [steps.length, durationMs, title]);

  const IconComp = icon === 'lock' ? Lock : icon === 'coins' ? Coins : ShieldCheck;

  return (
    <div
      data-testid={testId}
      className="py-10 sm:py-12 px-2 flex flex-col items-center text-center space-y-5"
    >
      <div className="relative w-16 h-16 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-[#00E5B0]/18" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#00E5B0] border-r-[#2AFADF]/70 animate-spin" />
        <div className="w-11 h-11 rounded-full bg-[#00E5B0]/12 border border-[#00E5B0]/35 flex items-center justify-center shadow-[0_0_24px_rgba(0,229,176,0.22)]">
          <IconComp className="w-5 h-5 text-[#00E5B0]" />
        </div>
      </div>

      <div className="space-y-1.5 max-w-sm">
        <h3 className="text-lg font-display font-extrabold text-white tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-[#A3BDB8] leading-relaxed">{subtitle}</p>
      </div>

      {/* Smooth GPU progress bar */}
      <div className="w-full max-w-xs h-1.5 rounded-full bg-[#08151B] border border-[#00E5B0]/20 overflow-hidden">
        <motion.div
          key={title}
          initial={{ scaleX: 0.08 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: Math.max(0.3, durationMs / 1000), ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: 'left center', willChange: 'transform' }}
          className="h-full w-full bg-gradient-to-r from-[#00E5B0] via-[#2AFADF] to-[#00E676] rounded-full"
        />
      </div>

      {/* Progressive sub-step milestones */}
      <div className="w-full max-w-xs rounded-[14px] bg-[#050E13] border border-[#00E5B0]/18 p-3 space-y-2 text-left">
        {steps.map((label, idx) => {
          const isDone = idx < activeIdx;
          const isCurrent = idx === activeIdx;
          return (
            <div key={label} className="flex items-center gap-2.5 text-[11px] font-mono">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  isDone
                    ? 'bg-[#00E5B0] text-[#03120F]'
                    : isCurrent
                    ? 'bg-[#00E5B0]/20 border border-[#00E5B0] text-[#00E5B0]'
                    : 'bg-white/5 border border-white/10 text-[#728F8A]'
                }`}
              >
                {isDone ? (
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                ) : isCurrent ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00E5B0] animate-pulse" />
                ) : (
                  <span className="w-1 h-1 rounded-full bg-[#728F8A]" />
                )}
              </span>
              <span
                className={
                  isDone
                    ? 'text-[#00E5B0] font-semibold'
                    : isCurrent
                    ? 'text-white font-semibold'
                    : 'text-[#728F8A]'
                }
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const StripeCheckoutModal: React.FC = () => {
  const {
    user,
    navigate,
    challenges,
    userCoupons,
    adminCoupons,
    userPurchaseRequests,
    paymentSettings,
    stripeCheckoutSession,
    closeStripeCheckout,
    submitAccountPurchaseRequest,
    pushNotification,
  } = usePlatform();

  const [step, setStep] = useState<CheckoutStep>('INITIAL_LOADING');
  const [selectedMethod, setSelectedMethod] = useState<'crypto' | 'cards' | 'upi' | 'paypal'>('crypto');
  const [selectedNetworkId, setSelectedNetworkId] = useState<string>('usdt_bep20');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Address & Country state
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [billingName, setBillingName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingCountry, setBillingCountry] = useState('India');

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [couponFeedback, setCouponFeedback] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  // Verification & Status check state
  const [orderNumber, setOrderNumber] = useState('');
  const [submittedOrderNumber, setSubmittedOrderNumber] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [copiedState, setCopiedState] = useState(false);
  const [statusChecking, setStatusChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const submittedOrderRef = useRef<string | null>(null);
  const stepTimerRef = useRef<number | null>(null);

  const clearStepTimer = () => {
    if (stepTimerRef.current !== null) {
      window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearStepTimer();
  }, []);

  // 15-Minute Countdown Timer
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(15 * 60);

  useEffect(() => {
    if (stripeCheckoutSession) {
      clearStepTimer();
      setStep('INITIAL_LOADING');
      setSelectedMethod('crypto');
      setSelectedNetworkId('usdt_bep20');
      setIsEditingAddress(false);
      setSubmittedOrderNumber('');
      setTransactionRef('');
      setScreenshotUrl('');
      setStatusChecking(false);
      setStatusMessage(null);
      setStatusError(null);
      submittedOrderRef.current = null;
      setCopiedState(false);
      setTimeLeftSeconds(15 * 60);

      const generatedOrd = `ORD-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      setOrderNumber(generatedOrd);

      setBillingName(user?.fullName || 'Trader');
      setBillingEmail(user?.email || '');
      setBillingCountry(user?.country || 'India');
      setIsEditingAddress(!user?.email);

      const initCode = (stripeCheckoutSession.initialCouponCode || '').trim().toUpperCase();
      setCouponInput(initCode);
      if (initCode) {
        const initTarget =
          challenges.find((c) => c.id === stripeCheckoutSession.challengeId) ||
          INITIAL_CHALLENGES.find((c) => c.id === stripeCheckoutSession.challengeId) ||
          challenges[0] ||
          INITIAL_CHALLENGES[0];
        const usedCodes = userPurchaseRequests
          .filter((r) => r.status !== 'rejected' && r.couponCode)
          .map((r) => String(r.couponCode));
        const initTest = computeStripeCheckoutBreakdown(
          initTarget,
          initCode,
          userCoupons,
          adminCoupons,
          usedCodes
        );
        if (initTest.validCode) {
          setAppliedCoupon(initCode);
          setCouponFeedback({
            type: 'success',
            msg: `Coupon code ${initCode} applied! (-${initTest.discountPct}% OFF)`,
          });
        } else {
          setAppliedCoupon('');
          setCouponFeedback({
            type: 'error',
            msg: initTest.errorMessage || 'Coupon is not valid for this evaluation.',
          });
        }
      } else {
        setAppliedCoupon('');
        setCouponFeedback(null);
      }

      // Brief smooth initial encrypted checkout session screen
      stepTimerRef.current = window.setTimeout(() => {
        stepTimerRef.current = null;
        setStep('CHOOSE_PAYMENT_METHOD');
      }, 450);
    } else {
      clearStepTimer();
    }
  }, [stripeCheckoutSession?.challengeId, stripeCheckoutSession?.initialCouponCode]);

  // Lock body scroll and listen for Escape key when modal is open
  useEffect(() => {
    if (stripeCheckoutSession && typeof document !== 'undefined') {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeStripeCheckout();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = orig;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [stripeCheckoutSession, closeStripeCheckout]);

  // Countdown clock tick
  useEffect(() => {
    if (step !== 'SEND_CRYPTO') return;
    const interval = setInterval(() => {
      setTimeLeftSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const activeId = stripeCheckoutSession?.challengeId || 'two-step-100000';

  const baseChallenge = useMemo(() => {
    return (
      challenges.find((c) => c.id === activeId) ||
      INITIAL_CHALLENGES.find((c) => c.id === activeId) ||
      challenges[0] ||
      INITIAL_CHALLENGES[0]
    );
  }, [activeId, challenges]);

  const usedCodesByUser = useMemo(
    () =>
      userPurchaseRequests
        .filter((r) => r.status !== 'rejected' && r.couponCode)
        .map((r) => String(r.couponCode)),
    [userPurchaseRequests]
  );

  const breakdown = useMemo(
    () =>
      computeStripeCheckoutBreakdown(
        baseChallenge,
        appliedCoupon,
        userCoupons,
        adminCoupons,
        usedCodesByUser
      ),
    [baseChallenge, appliedCoupon, userCoupons, adminCoupons, usedCodesByUser]
  );

  const effectiveChallenge = useMemo(() => {
    return (
      challenges.find((c) => c.id === breakdown.targetChallengeId) ||
      INITIAL_CHALLENGES.find((c) => c.id === breakdown.targetChallengeId) ||
      baseChallenge
    );
  }, [challenges, breakdown.targetChallengeId, baseChallenge]);

  const selectedNetwork = useMemo(() => {
    return (
      CRYPTO_NETWORKS.find((n) => n.id === selectedNetworkId) ||
      CRYPTO_NETWORKS[0]
    );
  }, [selectedNetworkId]);

  // Active wallet address based on network
  const activeDepositAddress = useMemo(() => {
    if (selectedNetwork.id === 'usdt_trc20' && paymentSettings.cryptoUsdtTrc20) {
      return paymentSettings.cryptoUsdtTrc20;
    }
    if (selectedNetwork.id === 'usdt_erc20' && paymentSettings.cryptoUsdtErc20) {
      return paymentSettings.cryptoUsdtErc20;
    }
    if (selectedNetwork.id === 'bnb_bep20' && paymentSettings.cryptoBnbBep20) {
      return paymentSettings.cryptoBnbBep20;
    }
    if (selectedNetwork.id === 'btc' && paymentSettings.cryptoBtcAddress) {
      return paymentSettings.cryptoBtcAddress;
    }
    if (selectedNetwork.id === 'eth_erc20' && paymentSettings.cryptoEthAddress) {
      return paymentSettings.cryptoEthAddress;
    }
    if (selectedNetwork.id === 'sol' && paymentSettings.cryptoSolAddress) {
      return paymentSettings.cryptoSolAddress;
    }
    if (selectedNetwork.id === 'usdt_arbitrum' && paymentSettings.cryptoArbitrumAddress) {
      return paymentSettings.cryptoArbitrumAddress;
    }
    if (selectedNetwork.id === 'usdt_aptos' && paymentSettings.cryptoAptosAddress) {
      return paymentSettings.cryptoAptosAddress;
    }
    if (selectedNetwork.id === 'usdt_bep20' && paymentSettings.cryptoUsdtBep20) {
      return paymentSettings.cryptoUsdtBep20;
    }
    return selectedNetwork.defaultAddress;
  }, [selectedNetwork, paymentSettings]);

  // Active QR Code (Uses Admin Uploaded Custom QR Image if available, otherwise dynamic QR server)
  const activeQrCodeUrl = useMemo(() => {
    if (selectedNetwork.id === 'usdt_bep20' && paymentSettings.cryptoUsdtBep20Qr) {
      return paymentSettings.cryptoUsdtBep20Qr;
    }
    if (selectedNetwork.id === 'usdt_trc20' && paymentSettings.cryptoUsdtTrc20Qr) {
      return paymentSettings.cryptoUsdtTrc20Qr;
    }
    if (selectedNetwork.id === 'usdt_erc20' && paymentSettings.cryptoUsdtErc20Qr) {
      return paymentSettings.cryptoUsdtErc20Qr;
    }
    if (selectedNetwork.id === 'bnb_bep20' && paymentSettings.cryptoBnbBep20Qr) {
      return paymentSettings.cryptoBnbBep20Qr;
    }
    if (selectedNetwork.id === 'btc' && paymentSettings.cryptoBtcQr) {
      return paymentSettings.cryptoBtcQr;
    }
    if (selectedNetwork.id === 'eth_erc20' && paymentSettings.cryptoEthQr) {
      return paymentSettings.cryptoEthQr;
    }
    if (selectedNetwork.id === 'sol' && paymentSettings.cryptoSolQr) {
      return paymentSettings.cryptoSolQr;
    }
    if (selectedNetwork.id === 'usdt_arbitrum' && paymentSettings.cryptoArbitrumQr) {
      return paymentSettings.cryptoArbitrumQr;
    }
    if (selectedNetwork.id === 'usdt_aptos' && paymentSettings.cryptoAptosQr) {
      return paymentSettings.cryptoAptosQr;
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=400x400&color=00FFA3&bgcolor=030F0C&margin=0&qzone=1&data=${encodeURIComponent(
      activeDepositAddress
    )}`;
  }, [selectedNetwork, paymentSettings, activeDepositAddress]);

  if (!stripeCheckoutSession) return null;

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedState(true);
    pushNotification('Copied to Clipboard', text, 'info');
    setTimeout(() => setCopiedState(false), 2500);
  };

  const handleApplyCoupon = () => {
    const clean = couponInput.trim().toUpperCase();
    if (!clean) {
      setAppliedCoupon('');
      setCouponFeedback(null);
      return;
    }
    const test = computeStripeCheckoutBreakdown(
      baseChallenge,
      clean,
      userCoupons,
      adminCoupons,
      usedCodesByUser
    );
    if (!test.validCode) {
      setAppliedCoupon('');
      setCouponFeedback({
        type: 'error',
        msg: test.errorMessage || 'Invalid or expired coupon code.',
      });
      return;
    }
    setAppliedCoupon(clean);
    setCouponFeedback({
      type: 'success',
      msg: `Coupon ${clean} applied! (-${test.discountPct}% OFF)`,
    });
  };

  const transitionWithProcessing = (
    processingStep: CheckoutStep,
    nextStep: CheckoutStep,
    delayMs: number
  ) => {
    clearStepTimer();
    setStep(processingStep);
    stepTimerRef.current = window.setTimeout(() => {
      stepTimerRef.current = null;
      setStep(nextStep);
    }, delayMs);
  };

  const handleContinueToCoinSelection = () => {
    if (!billingEmail || !billingEmail.includes('@')) {
      setIsEditingAddress(true);
      pushNotification('Email Required', 'Please enter your email address for terminal account credentials delivery.', 'warning');
      return;
    }
    transitionWithProcessing('PROCESSING_METHOD', 'SELECT_COIN_NETWORK', 540);
  };

  const handleContinueToPreparing = () => {
    transitionWithProcessing('PREPARING_STRINGS', 'SEND_CRYPTO', 640);
  };

  const handleCheckStatus = async () => {
    if (statusChecking) return;
    setStatusError(null);
    if (!billingEmail || !billingEmail.includes('@')) {
      setStatusError('Valid email address is required before submitting payment confirmation.');
      return;
    }

    if (submittedOrderRef.current) {
      setSubmittedOrderNumber(submittedOrderRef.current);
      setStep('CONFIRMED');
      return;
    }

    clearStepTimer();
    setStatusChecking(true);
    setStep('VERIFYING_DEPOSIT');
    setStatusMessage('Verifying and submitting your payment confirmation...');

    try {
      const req = submitAccountPurchaseRequest({
        challengeId: effectiveChallenge.id,
        couponCode: appliedCoupon || undefined,
        paymentMethod: 'CRYPTO',
        transactionRef: transactionRef.trim() || `TXID-${orderNumber}`,
        paymentScreenshotUrl: screenshotUrl || undefined,
        payerNotes: `${selectedNetwork.coin} on ${selectedNetwork.standard} · Address: ${activeDepositAddress}`,
        finalAmountUsd: breakdown.finalAmountUsd,
        discountPct: breakdown.discountPct,
        guestEmail: billingEmail,
        guestName: billingName,
      });
      submittedOrderRef.current = req.orderNumber;
      setSubmittedOrderNumber(req.orderNumber);

      await new Promise((r) => setTimeout(r, 720));
      setStatusMessage(
        `Payment queued (#${req.orderNumber})! Our desk is verifying your deposit and will activate your terminal account shortly.`
      );
      pushNotification(
        'Payment Queued for Verification ✓',
        `Order #${req.orderNumber} submitted cleanly for Admin approval.`,
        'success'
      );
      setStep('CONFIRMED');
    } catch (err: any) {
      setStatusMessage(null);
      setStatusError(err?.message || 'Unable to submit payment request. Please verify your email.');
      setStep('SEND_CRYPTO');
    } finally {
      setStatusChecking(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        data-checkout-modal="true"
        data-interactive-container
        style={{ willChange: 'opacity' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closeStripeCheckout();
          }
        }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/88 p-3 sm:p-4 overflow-y-auto"
      >
        <motion.div
          data-interactive-container
          style={{ willChange: 'transform, opacity', transform: 'translate3d(0, 0, 0)' }}
          initial={{ opacity: 0, y: 6, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.99 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-[24px] bg-[#071318] border border-[#00E5B0]/35 shadow-[0_32px_95px_rgba(0,0,0,0.96),inset_0_1px_0_rgba(56,248,210,0.18)] overflow-hidden my-auto"
        >
        {/* HEADER BAR — Compact 1-Line "Secure checkout" badge */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 border-b border-[#00E5B0]/18 bg-[#050E13] shrink-0">
          <div className="flex items-center gap-2 min-w-0 shrink">
            <FundedApexLogo size="sm" showText={true} />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#00E5B0]/14 border border-[#00E5B0]/35 text-[10px] font-mono font-bold text-[#00E5B0] whitespace-nowrap leading-tight shrink-0">
              <ShieldCheck className="w-3 h-3 shrink-0" />
              <span className="whitespace-nowrap">Secure checkout</span>
            </div>
            <button
              type="button"
              onClick={closeStripeCheckout}
              aria-label="Close checkout"
              className="p-1.5 rounded-full text-[#A3BDB8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* STEP PROGRESS SEGMENTS (Visible across every checkout & processing step) */}
        {(() => {
          const activeStepIdx =
            step === 'INITIAL_LOADING' || step === 'CHOOSE_PAYMENT_METHOD'
              ? 1
              : step === 'PROCESSING_METHOD' || step === 'SELECT_COIN_NETWORK'
              ? 2
              : step === 'PREPARING_STRINGS' || step === 'SEND_CRYPTO'
              ? 3
              : 4;
          const stepItems = [
            { idx: 1, label: 'Method' },
            { idx: 2, label: 'Network' },
            { idx: 3, label: 'Deposit' },
            { idx: 4, label: 'Confirm' },
          ];
          return (
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-3 sm:px-4 bg-[#050B0E] border-b border-[#00E5B0]/12 shrink-0">
              {stepItems.map((item, i) => {
                const isDone =
                  step === 'CONFIRMED' ? true : item.idx < activeStepIdx;
                const isCurrent = step !== 'CONFIRMED' && item.idx === activeStepIdx;
                return (
                  <React.Fragment key={item.idx}>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono font-bold">
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] transition-all ${
                          isDone
                            ? 'bg-[#00E5B0] text-[#03120F]'
                            : isCurrent
                            ? 'bg-[#00E5B0] text-[#03120F] ring-2 ring-[#00E5B0]/35'
                            : 'bg-[#0D1E26] text-[#A3BDB8]'
                        }`}
                      >
                        {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : item.idx}
                      </span>
                      <span
                        className={
                          isDone || isCurrent ? 'text-[#00E5B0]' : 'text-[#728F8A]'
                        }
                      >
                        {item.label}
                      </span>
                    </div>
                    {i < stepItems.length - 1 && (
                      <span
                        className={`w-3 sm:w-4 h-[1px] transition-colors ${
                          isDone ? 'bg-[#00E5B0]/60' : 'bg-white/15'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}

        {/* CONTENT AREA */}
        <div
          data-interactive-container
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5 custom-scrollbar"
        >
          <AnimatePresence mode="wait">
          {/* 1. INITIAL LOADING STATE */}
          {step === 'INITIAL_LOADING' && (
            <motion.div
              key="INITIAL_LOADING"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
            >
              <CheckoutProcessingScreen
                testId="checkout-step-loading"
                title="Securing Your Checkout..."
                subtitle={`Initializing encrypted order session for ${effectiveChallenge.typeLabel} · $${(effectiveChallenge.accountSize / 1000).toFixed(0)}K`}
                steps={[
                  'Encrypting checkout session',
                  'Syncing live challenge pricing',
                  'Preparing payment rails',
                ]}
                durationMs={450}
                icon="lock"
              />
            </motion.div>
          )}

          {/* 2. CHOOSE PAYMENT METHOD SCREEN */}
          {step === 'CHOOSE_PAYMENT_METHOD' && (
            <motion.div
              key="CHOOSE_PAYMENT_METHOD"
              data-testid="checkout-step-method"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="space-y-4"
            >
              <div>
                <h2 className="text-xl font-display font-extrabold text-white">
                  Choose payment method
                </h2>
                <p className="text-xs text-[#A7B1AA] mt-0.5">
                  Select how you want to pay. Only available methods can be selected.
                </p>
              </div>

              {/* BILLING & COUNTRY SELECTOR CARD */}
              <div className="p-3.5 rounded-[16px] bg-[#050E13] border border-[#00E5B0]/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#728F8A]">
                    TRADER BILLING &amp; COUNTRY
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingAddress(!isEditingAddress)}
                    className="text-xs font-semibold text-[#00E5B0] hover:underline cursor-pointer"
                  >
                    {isEditingAddress ? 'Done' : 'Edit details'}
                  </button>
                </div>

                {isEditingAddress ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5 text-xs">
                    <input
                      type="text"
                      value={billingName}
                      onChange={(e) => setBillingName(e.target.value)}
                      placeholder="Full Name"
                      className="w-full px-3 py-2 rounded-[10px] bg-[#08161D] border border-[#00E5B0]/25 text-white focus:outline-none focus:border-[#00E5B0]"
                    />
                    <input
                      type="email"
                      value={billingEmail}
                      onChange={(e) => setBillingEmail(e.target.value)}
                      placeholder="Email Address"
                      className="w-full px-3 py-2 rounded-[10px] bg-[#08161D] border border-[#00E5B0]/25 text-white focus:outline-none focus:border-[#00E5B0]"
                    />
                  </div>
                ) : (
                  <div className="text-xs font-semibold text-white truncate">
                    {billingName} · <span className="text-[#A3BDB8]">{billingEmail || 'Enter email'}</span>
                  </div>
                )}

                <div className="relative">
                  <select
                    value={billingCountry}
                    onChange={(e) => setBillingCountry(e.target.value)}
                    data-testid="checkout-country-select"
                    aria-label="Billing Country"
                    className="w-full appearance-none pl-3 pr-8 py-2 rounded-[10px] bg-[#08161D] border border-[#00E5B0]/25 text-xs font-semibold text-white focus:outline-none focus:border-[#00E5B0] cursor-pointer"
                  >
                    {COUNTRIES.map((countryName) => (
                      <option
                        key={countryName}
                        value={countryName}
                        className="bg-[#061015] text-white"
                      >
                        {countryName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#00E5B0] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* AMOUNT TO PAY CARD */}
              <div className="p-4 rounded-[16px] bg-[#050E13] border border-[#00E5B0]/25 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#728F8A]">
                    AMOUNT TO PAY
                  </span>
                  <div className="text-xs text-[#A3BDB8] mt-0.5">
                    {effectiveChallenge.typeLabel} · ${(effectiveChallenge.accountSize / 1000).toFixed(0)}K · Order {orderNumber}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-mono font-extrabold text-[#00E5B0]">
                    ${breakdown.finalAmountUsd.toFixed(2)}
                  </div>
                  {breakdown.discountPct > 0 && (
                    <div className="text-[10px] font-mono font-bold text-[#38F8D2]">
                      -{breakdown.discountPct}% OFF applied
                    </div>
                  )}
                </div>
              </div>

              {/* COUPON INPUT */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Coupon code (e.g. 5K30OFF)"
                  className="flex-1 px-3.5 py-2.5 rounded-[12px] bg-[#08151B] border border-[#00E5B0]/20 text-xs font-mono uppercase text-[#00E5B0] placeholder:normal-case placeholder:text-[#728F8A] focus:outline-none focus:border-[#00E5B0]"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="px-4 py-2.5 rounded-[12px] bg-[#00E5B0]/15 hover:bg-[#00E5B0]/25 border border-[#00E5B0]/35 text-xs font-semibold text-[#00E5B0] cursor-pointer transition-colors"
                >
                  Apply
                </button>
              </div>

              {couponFeedback && (
                <div
                  className={`p-3 rounded-[12px] text-xs font-medium ${
                    couponFeedback.type === 'success'
                      ? 'bg-[#00E5B0]/12 text-[#00E5B0] border border-[#00E5B0]/30'
                      : 'bg-red-500/12 text-red-300 border border-red-500/30'
                  }`}
                >
                  {couponFeedback.msg}
                </div>
              )}

              {/* PAYMENT METHOD OPTIONS */}
              <div className="space-y-2 pt-1">
                {/* 1. Cards (Locked) */}
                <div className="p-3.5 rounded-[14px] bg-[#050E13]/60 border border-white/6 opacity-60 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-[#728F8A]" />
                    <span className="text-sm font-semibold text-[#728F8A]">Cards</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-white/5 border border-white/10 text-[#728F8A]">
                      Locked
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#728F8A]">
                    <span>VISA</span>
                    <span>•</span>
                    <span>MC</span>
                    <span>•</span>
                    <span>Apple Pay</span>
                  </div>
                </div>

                {/* 2. Crypto (ACTIVE SELECTABLE) */}
                <div
                  onClick={() => setSelectedMethod('crypto')}
                  className={`p-3.5 rounded-[16px] border transition-all cursor-pointer flex items-center justify-between ${
                    selectedMethod === 'crypto'
                      ? 'bg-[#08151B] border-[#00E5B0] shadow-[0_0_24px_rgba(0,229,176,0.2)]'
                      : 'bg-[#050E13] border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[#00E5B0]/20 border border-[#00E5B0] flex items-center justify-center font-bold text-xs text-[#00E5B0]">
                      ₮
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Instant Crypto Deposit</span>
                        <span className="px-2 py-0.5 rounded-full bg-[#00E5B0]/15 border border-[#00E5B0]/30 text-[9px] font-mono font-bold text-[#00E5B0]">
                          Zero Fee
                        </span>
                      </div>
                      <div className="text-[11px] text-[#A3BDB8] mt-0.5">
                        USDT (BEP-20 / TRC-20), BNB, BTC, ETH, SOL
                      </div>
                    </div>
                  </div>
                  <span className="w-4 h-4 rounded-full border-2 border-[#00E5B0] flex items-center justify-center">
                    {selectedMethod === 'crypto' && <span className="w-2 h-2 rounded-full bg-[#00E5B0]" />}
                  </span>
                </div>

                {/* 3. UPI (Locked) */}
                <div className="p-3.5 rounded-[12px] bg-[#050806]/70 border border-white/8 opacity-65 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Coins className="w-5 h-5 text-[#77837B]" />
                    <span className="text-sm font-semibold text-[#A7B1AA]">UPI</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-white/5 border border-white/10 text-[#77837B]">
                      Locked
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[#77837B]">GPay / PhonePe</span>
                </div>

                {/* 4. PayPal (Locked) */}
                <div className="p-3.5 rounded-[12px] bg-[#050806]/70 border border-white/8 opacity-65 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-[#77837B]" />
                    <span className="text-sm font-semibold text-[#A7B1AA]">PayPal</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-white/5 border border-white/10 text-[#77837B]">
                      Locked
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[#77837B]">PayPal</span>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  data-testid="checkout-continue-network-btn"
                  onClick={handleContinueToCoinSelection}
                  className="w-full py-3.5 px-4 rounded-[14px] bg-[#00E5B0] hover:bg-[#2AFADF] text-[#03120F] font-display font-bold text-sm cursor-pointer transition-all shadow-[0_8px_24px_rgba(0,229,176,0.3)]"
                >
                  Continue to Network Selection →
                </button>
                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={closeStripeCheckout}
                    className="text-[#A3BDB8] hover:text-white cursor-pointer"
                  >
                    ← Back to site
                  </button>
                  <button
                    type="button"
                    onClick={closeStripeCheckout}
                    className="text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    Cancel payment
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* 2B. PROCESSING METHOD -> NETWORK SELECTION */}
          {step === 'PROCESSING_METHOD' && (
            <motion.div
              key="PROCESSING_METHOD"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              <CheckoutProcessingScreen
                testId="checkout-step-processing-method"
                title="Processing Order & Payment Method..."
                subtitle={`Locking $${breakdown.finalAmountUsd.toFixed(2)} USD${appliedCoupon ? ` (${appliedCoupon})` : ''} for ${billingEmail}`}
                steps={[
                  'Billing details & discount validated',
                  `Order #${orderNumber} reserved`,
                  'Loading multi-chain deposit networks',
                ]}
                durationMs={540}
                icon="coins"
              />
            </motion.div>
          )}

          {/* 3. SELECT COIN & NETWORK SCREEN */}
          {step === 'SELECT_COIN_NETWORK' && (
            <motion.div
              key="SELECT_COIN_NETWORK"
              data-testid="checkout-step-network"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="space-y-4"
            >
              <button
                type="button"
                onClick={() => {
                  clearStepTimer();
                  setStep('CHOOSE_PAYMENT_METHOD');
                }}
                className="text-xs font-semibold text-[#A3BDB8] hover:text-[#00E5B0] flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Payment methods</span>
              </button>

              <div>
                <h2 className="text-xl font-display font-extrabold text-white">
                  Select coin &amp; network
                </h2>
                <p className="text-xs text-[#A3BDB8] mt-0.5">
                  Choose the asset and network from the list. Send only on the matching network.
                </p>
              </div>

              {/* BILLING ADDRESS & AMOUNT PREVIEW */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-[14px] bg-[#050E13] border border-[#00E5B0]/20">
                  <span className="text-[10px] font-mono text-[#728F8A] uppercase font-bold">BILLING</span>
                  <div className="font-semibold text-white truncate mt-0.5">{billingName}</div>
                  <div className="text-[#A3BDB8] truncate text-[11px]">{billingEmail}</div>
                </div>
                <div className="p-3.5 rounded-[14px] bg-[#050E13] border border-[#00E5B0]/25 text-right">
                  <span className="text-[10px] font-mono text-[#728F8A] uppercase font-bold">AMOUNT TO PAY</span>
                  <div className="text-lg font-mono font-extrabold text-[#00E5B0] mt-0.5">
                    ${breakdown.finalAmountUsd.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* COIN / NETWORK SELECTOR */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[#A3BDB8]">
                  COIN / NETWORK
                </label>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full p-3.5 rounded-[16px] bg-[#050E13] border border-[#00E5B0]/35 text-left flex items-center justify-between cursor-pointer hover:border-[#00E5B0]/60 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full bg-[#00E5B0]/20 border border-[#00E5B0] flex items-center justify-center font-bold text-xs text-[#00E5B0]">
                        {selectedNetwork.iconSymbol}
                      </span>
                      <div>
                        <div className="text-sm font-bold text-white">
                          {selectedNetwork.coin} - {selectedNetwork.network}
                        </div>
                        <div className="text-xs font-mono font-bold text-[#00E5B0]">
                          {selectedNetwork.standard}
                        </div>
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-[#A3BDB8] transition-transform ${isDropdownOpen ? 'rotate-180 text-[#00E5B0]' : ''}`} />
                  </button>

                  {isDropdownOpen && (
                    <div className="mt-2 max-h-[250px] overflow-y-auto overscroll-contain rounded-[16px] bg-[#050E13] border border-[#00E5B0]/40 shadow-[0_16px_40px_rgba(0,0,0,0.85)] divide-y divide-white/5 custom-scrollbar">
                      {CRYPTO_NETWORKS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setSelectedNetworkId(opt.id);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full p-3 text-left flex items-center justify-between hover:bg-[#08151B] transition-colors cursor-pointer ${
                            selectedNetworkId === opt.id ? 'bg-[#08151B] text-[#00E5B0]' : 'text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-full bg-[#050E13] border border-white/20 flex items-center justify-center text-[11px] font-bold text-white">
                              {opt.iconSymbol}
                            </span>
                            <div>
                              <div className="text-xs font-bold">{opt.coin} - {opt.network}</div>
                              <div className="text-[11px] font-mono text-[#A3BDB8]">{opt.standard}</div>
                            </div>
                          </div>
                          {selectedNetworkId === opt.id && <Check className="w-4 h-4 text-[#00E5B0]" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  data-testid="checkout-generate-address-btn"
                  onClick={handleContinueToPreparing}
                  className="w-full py-3.5 px-4 rounded-[14px] bg-[#00E5B0] hover:bg-[#2AFADF] text-[#03120F] font-display font-bold text-sm cursor-pointer transition-all shadow-[0_8px_24px_rgba(0,229,176,0.3)]"
                >
                  Generate Deposit Address →
                </button>
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={closeStripeCheckout}
                    className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    Cancel payment
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* 4. PREPARING STRINGS / ADDRESS GENERATOR LOADER */}
          {step === 'PREPARING_STRINGS' && (
            <motion.div
              key="PREPARING_STRINGS"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              <CheckoutProcessingScreen
                testId="checkout-step-preparing-address"
                title="Generating Secure Deposit Address..."
                subtitle={`Allocating ${selectedNetwork.coin} (${selectedNetwork.standard}) gateway & 15:00 quote lock`}
                steps={[
                  `${selectedNetwork.coin} · ${selectedNetwork.standard} rail active`,
                  'Encoding encrypted QR & wallet address',
                  'Activating 15:00 checkout countdown',
                ]}
                durationMs={640}
                icon="shield"
              />
            </motion.div>
          )}

          {/* 5. SEND CRYPTO SCREEN */}
          {step === 'SEND_CRYPTO' && (
            <motion.div
              key="SEND_CRYPTO"
              data-testid="checkout-step-deposit"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="space-y-4"
            >
              <button
                type="button"
                onClick={() => {
                  clearStepTimer();
                  setStep('SELECT_COIN_NETWORK');
                }}
                className="text-xs font-semibold text-[#A7B1AA] hover:text-[#00E676] flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change network</span>
              </button>

              <div>
                <h2 className="text-xl font-display font-extrabold text-white">
                  Send {selectedNetwork.coin}
                </h2>
                <p className="text-xs text-[#A7B1AA] mt-0.5">
                  Network: <strong className="text-[#00E676]">{selectedNetwork.standard}</strong> · Send exactly the amount below. Payment window is 15 minutes.
                </p>
              </div>

              {/* SPECIFICATION CARD */}
              <div className="p-4 rounded-[16px] bg-[#050E13] border border-[#00E5B0]/20 space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-[#00E5B0]/10">
                  <span className="font-mono text-[#728F8A] uppercase font-bold text-[10px]">COIN</span>
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[#00E5B0]/15 border border-[#00E5B0] flex items-center justify-center text-[10px] text-[#00E5B0]">
                      {selectedNetwork.iconSymbol}
                    </span>
                    <span>{selectedNetwork.coin}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-[#00E5B0]/10">
                  <span className="font-mono text-[#728F8A] uppercase font-bold text-[10px]">NETWORK</span>
                  <span className="font-mono font-bold text-[#00E5B0]">{selectedNetwork.standard}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-[#00E5B0]/10">
                  <span className="font-mono text-[#728F8A] uppercase font-bold text-[10px]">AMOUNT</span>
                  <span className="font-mono font-extrabold text-base text-[#00E5B0]">
                    ${breakdown.finalAmountUsd.toFixed(2)} USD
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="font-mono text-[#728F8A] uppercase font-bold text-[10px]">ORDER ID</span>
                  <span className="font-mono font-semibold text-white">{orderNumber}</span>
                </div>
              </div>

              {/* TIMER & QR CODE BOX */}
              <div className="p-4 rounded-[18px] bg-[#050E13] border border-[#00E5B0]/25 flex flex-col items-center text-center space-y-3.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#08151B] border border-[#00E5B0]/35 text-xs font-mono font-bold text-[#00E5B0]">
                  <span className="w-2 h-2 rounded-full bg-[#00E5B0] animate-pulse" />
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatTimer(timeLeftSeconds)}</span>
                </div>

                {/* White Frame for high-contrast QR readability */}
                <div className="p-3 bg-white rounded-[16px] shadow-[0_12px_36px_rgba(0,0,0,0.6)]">
                  <img
                    src={activeQrCodeUrl}
                    alt={`${selectedNetwork.coin} QR Code`}
                    className="w-40 h-40 object-contain block"
                  />
                </div>

                <div className="text-xs font-mono text-[#A3BDB8]">
                  {selectedNetwork.coin} · {selectedNetwork.network} deposit address
                </div>

                {/* COPY ADDRESS BOX */}
                <div className="w-full space-y-2">
                  <div className="p-2.5 rounded-[12px] bg-[#08151B] border border-[#00E5B0]/35 font-mono text-[11px] sm:text-xs text-[#00E5B0] break-all select-all">
                    {activeDepositAddress}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(activeDepositAddress)}
                    className="w-full py-2.5 px-3 rounded-[12px] bg-[#00E5B0]/15 hover:bg-[#00E5B0]/25 border border-[#00E5B0]/40 text-xs font-mono font-bold text-[#00E5B0] flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-[0_4px_16px_rgba(0,229,176,0.15)]"
                  >
                    {copiedState ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedState ? 'Address Copied!' : 'Copy deposit address'}</span>
                  </button>
                </div>
              </div>

              {/* OPTIONAL TXID / PROOF INPUT */}
              <div className="space-y-1.5 text-xs">
                <label className="block text-[#A7B1AA] font-mono">
                  Transaction Hash / TxID (Optional for instant matching)
                </label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="Paste transaction hash / TxID..."
                  className="w-full px-3.5 py-2.5 rounded-[12px] bg-[#08151B] border border-[#00E5B0]/25 text-[#00E5B0] font-mono text-xs focus:outline-none focus:border-[#00E5B0] placeholder:text-[#728F8A]"
                />
              </div>

              {/* PAYMENT SCREENSHOT PROOF UPLOADER */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <label className="block text-[#A7B1AA] font-mono">
                    Payment Screenshot / Receipt (Recommended)
                  </label>
                  {screenshotUrl && (
                    <button
                      type="button"
                      onClick={() => setScreenshotUrl('')}
                      className="text-[11px] text-red-400 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <label className="flex items-center justify-center gap-2 p-3 rounded-[12px] bg-[#08151B] border border-dashed border-[#00E5B0]/30 hover:border-[#00E5B0] text-[#A3BDB8] hover:text-white cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-[#00E5B0]" />
                  <span className="font-mono text-xs">
                    {screenshotUrl ? '✓ Screenshot attached (Click to change)' : 'Upload payment screenshot'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const res = ev.target?.result;
                        if (typeof res === 'string') {
                          setScreenshotUrl(res);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {screenshotUrl && (
                  <div className="flex items-center gap-2 pt-1">
                    <img
                      src={screenshotUrl}
                      alt="Proof Preview"
                      className="w-12 h-12 object-cover rounded-lg border border-[#00E5B0]/40"
                    />
                    <span className="text-[11px] font-mono text-[#00E5B0]">
                      Screenshot attached and will be sent directly to Admin
                    </span>
                  </div>
                )}
              </div>

              {statusError && (
                <div className="p-3.5 rounded-[12px] bg-red-500/10 border border-red-500/35 text-xs text-red-300">
                  {statusError}
                </div>
              )}

              {statusMessage && (
                <div className="p-3.5 rounded-[12px] bg-[#00E5B0]/10 border border-[#00E5B0]/30 text-xs text-[#00E5B0] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#00E5B0]" />
                  <span>{statusMessage}</span>
                </div>
              )}

              {/* CHECK STATUS & CANCEL BUTTONS */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  data-testid="checkout-verify-payment-btn"
                  onClick={handleCheckStatus}
                  disabled={statusChecking}
                  className="w-full py-3.5 px-4 rounded-[14px] bg-[#00E5B0] hover:bg-[#2AFADF] text-[#03120F] font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all shadow-[0_8px_24px_rgba(0,229,176,0.3)]"
                >
                  {statusChecking ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-[#03120F]" />
                      <span>Verifying Payment...</span>
                    </>
                  ) : (
                    <span>I Have Paid · Verify &amp; Submit Order →</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={closeStripeCheckout}
                  className="w-full py-2 text-xs font-semibold text-red-400 hover:text-red-300 cursor-pointer transition-colors"
                >
                  Cancel payment
                </button>
              </div>
            </motion.div>
          )}

          {/* 6. VERIFYING DEPOSIT PROCESSING SCREEN */}
          {step === 'VERIFYING_DEPOSIT' && (
            <motion.div
              key="VERIFYING_DEPOSIT"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              <CheckoutProcessingScreen
                testId="checkout-step-verifying"
                title="Processing & Submitting Payment..."
                subtitle={`Registering ${selectedNetwork.coin} deposit for Order #${submittedOrderNumber || orderNumber}`}
                steps={[
                  `Scanning ${selectedNetwork.standard} reference`,
                  screenshotUrl ? 'Attaching payment receipt screenshot' : 'Recording transaction details',
                  'Dispatching to Admin Approval Desk',
                ]}
                durationMs={720}
                icon="shield"
              />
            </motion.div>
          )}

          {/* 7. CONFIRMED COMPLETION SCREEN */}
          {step === 'CONFIRMED' && (
            <motion.div
              key="CONFIRMED"
              data-testid="checkout-step-confirmed"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="py-4 space-y-5 text-center"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-[#00E5B0]/15 border-2 border-[#00E5B0] flex items-center justify-center shadow-[0_0_32px_rgba(0,229,176,0.28)]">
                <CheckCircle2 className="w-8 h-8 text-[#00E5B0]" />
              </div>

              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#00E5B0]/15 border border-[#00E5B0]/35 text-[10px] font-mono font-bold text-[#00E5B0] uppercase tracking-wider">
                  Payment Queued for Verification
                </div>
                <h2 className="text-xl font-display font-extrabold text-white">
                  Order #{submittedOrderNumber || orderNumber} Submitted
                </h2>
                <p className="text-xs text-[#A3BDB8] max-w-sm mx-auto leading-relaxed">
                  Your deposit request has been dispatched to our Admin Approval Desk. Your trading credentials will be delivered to <strong className="text-white">{billingEmail}</strong> upon confirmation.
                </p>
              </div>

              <div className="p-4 rounded-[16px] bg-[#050E13] border border-[#00E5B0]/22 space-y-2.5 text-xs text-left">
                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="font-mono text-[10px] uppercase text-[#728F8A]">Evaluation</span>
                  <span className="font-bold text-white">
                    {effectiveChallenge.typeLabel} · ${(effectiveChallenge.accountSize / 1000).toFixed(0)}K
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="font-mono text-[10px] uppercase text-[#728F8A]">Amount Paid</span>
                  <span className="font-mono font-extrabold text-[#00E5B0]">
                    ${breakdown.finalAmountUsd.toFixed(2)} USD
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="font-mono text-[10px] uppercase text-[#728F8A]">Network</span>
                  <span className="font-mono font-semibold text-white">
                    {selectedNetwork.coin} · {selectedNetwork.standard}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="font-mono text-[10px] uppercase text-[#728F8A]">Status</span>
                  <span className="font-mono font-bold text-[#38F8D2]">Pending Admin Approval</span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {user && (
                  <button
                    type="button"
                    onClick={() => {
                      closeStripeCheckout();
                      navigate('dashboard');
                    }}
                    className="w-full py-3.5 px-4 rounded-[14px] bg-[#00E5B0] hover:bg-[#2AFADF] text-[#03120F] font-display font-bold text-sm cursor-pointer transition-all shadow-[0_8px_24px_rgba(0,229,176,0.3)]"
                  >
                    Go to Dashboard &amp; Track Order →
                  </button>
                )}
                <button
                  type="button"
                  data-testid="checkout-done-btn"
                  onClick={closeStripeCheckout}
                  className={`w-full py-3 px-4 rounded-[14px] font-display font-bold text-sm cursor-pointer transition-all ${
                    user
                      ? 'bg-[#08151B] hover:bg-[#0D212A] border border-[#00E5B0]/25 text-white'
                      : 'bg-[#00E5B0] hover:bg-[#2AFADF] text-[#03120F] shadow-[0_8px_24px_rgba(0,229,176,0.3)]'
                  }`}
                >
                  Done &amp; Close Checkout
                </button>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
