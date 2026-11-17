import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  type AreaData,
  type BarData,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts';
import {
  INSTRUMENTS,
  OrderSide,
  SymbolCode,
  TradeOrderRecord,
  calculatePositionPnl,
  computeChartSlTpDragPrice,
  computeDefaultQuickSlTpForPosition,
  computeSlTpPresets,
  formatCandleCountdown,
  getMarketStatus,
  resolveChartPriceOrderType,
  roundPrice,
  validateAndComputeSlTpPreview,
} from '../engine/tradingEngine';
import {
  LightweightOhlcBar,
  OhlcWsStatus,
  buildSpotAnchoredCandles,
  computeBollingerBands,
  computeCurrentPriceFocusLogicalRange,
  computeEmaSeries,
  computeVwapSeries,
  fetchLiveInstrumentCandles,
  getCachedExchangeCandles,
  isDirectExchangeSymbol,
  mergeRealtimeOhlcBar,
  mergeSpotTickIntoLatestCandle,
  normalizeCandlesForLightweightCharts,
  reconcileCandlesWithLiveQuote,
  resolveChartPriceInteractionOptions,
  shouldAutoFocusChartOnTick,
  subscribeLiveOhlcWebSocket,
  transformCandlesToHeikinAshi,
} from '../engine/liveMarketFeed';
import { ChartTypeMode } from './ApexLiveCandlestickChart';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  GripVertical,
  Magnet,
  Maximize2,
  Minus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';

export interface TradingTerminalChartProps {
  symbol: SymbolCode;
  timeframeLabel: string;
  timeframeSeconds: number;
  candleCountdown?: string;
  bid?: number;
  ask?: number;
  currentBid?: number;
  currentAsk?: number;
  focusTrigger?: number;
  openPositions?: TradeOrderRecord[];
  pendingOrders?: TradeOrderRecord[];
  chartType?: ChartTypeMode;
  onChartTypeChange?: (next: ChartTypeMode) => void;
  showDrawingToolbar?: boolean;
  tradeVolume?: string;
  onTradeVolumeChange?: (nextVolume: string) => void;
  onExecuteMarketOrder?: (side: OrderSide, targetSymbol: SymbolCode) => void;
  onPlacePendingOrderAtPrice?: (side: OrderSide, price: number, targetSymbol: SymbolCode) => void;
  onClosePosition?: (orderId: string) => void;
  onCancelPendingOrder?: (orderId: string) => void;
  onModifyPositionSlTp?: (orderId: string, nextSl: number, nextTp: number) => void;
  onEditPositionModal?: (pos: TradeOrderRecord) => void;
  onQuickCreateAlert?: (price: number) => void;
  draftSl?: number;
  draftTp?: number;
  draftSide?: OrderSide;
  draftEntryPrice?: number;
  draftLots?: number;
}

type MainSeriesApi = ISeriesApi<SeriesType>;

interface ContextMenuState {
  x: number;
  y: number;
  price: number;
}

interface ActiveSlTpDragState {
  orderId: string;
  targetType: 'sl' | 'tp';
  price: number;
  riskUsd: number | null;
  rewardUsd: number | null;
  rrRatio: number | null;
}

const CHART_TYPE_OPTIONS: { id: ChartTypeMode; label: string }[] = [
  { id: 'candles', label: 'Candles' },
  { id: 'hollow', label: 'Hollow Candles' },
  { id: 'bars', label: 'OHLC Bars' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'heikin_ashi', label: 'Heikin Ashi' },
];

function resolveExchangeBadge(symbol: SymbolCode): string {
  const spec = INSTRUMENTS[symbol];
  if (!spec) return 'OANDA';
  if (spec.category === 'Crypto') return 'BINANCE';
  if (symbol === 'XAUUSD' || symbol === 'XAGUSD') return 'OANDA';
  if (symbol === 'USOIL' || symbol === 'UKOIL') return 'NYMEX';
  if (symbol === 'GER40') return 'XETR';
  if (symbol === 'UK100') return 'FTSE';
  if (spec.category === 'Indices') return 'CME';
  return 'OANDA';
}

function toSeriesBar(
  bar: LightweightOhlcBar,
  mode: ChartTypeMode
): CandlestickData<UTCTimestamp> | BarData<UTCTimestamp> | LineData<UTCTimestamp> | AreaData<UTCTimestamp> {
  const time = bar.time as UTCTimestamp;
  if (mode === 'line' || mode === 'area') {
    return { time, value: bar.close };
  }
  if (mode === 'hollow') {
    const bull = bar.close >= bar.open;
    return {
      time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      color: bull ? 'transparent' : '#F23645',
      borderColor: bull ? '#089981' : '#F23645',
      wickColor: bull ? '#089981' : '#F23645',
    };
  }
  return {
    time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  };
}

function toVolumeBar(bar: LightweightOhlcBar): HistogramData<UTCTimestamp> {
  const bull = bar.close >= bar.open;
  return {
    time: bar.time as UTCTimestamp,
    value: bar.volume,
    color: bull ? 'rgba(8, 153, 129, 0.36)' : 'rgba(242, 54, 69, 0.36)',
  };
}

export const TradingTerminalChart: React.FC<TradingTerminalChartProps> = React.memo(
  ({
    symbol,
    timeframeLabel,
    timeframeSeconds,
    candleCountdown,
    bid,
    ask,
    currentBid,
    currentAsk,
    focusTrigger = 0,
    openPositions = [],
    pendingOrders = [],
    chartType: externalChartType,
    onChartTypeChange,
    showDrawingToolbar = true,
    onExecuteMarketOrder,
    onPlacePendingOrderAtPrice,
    onClosePosition,
    onCancelPendingOrder,
    onModifyPositionSlTp,
    onEditPositionModal,
    onQuickCreateAlert,
    draftSl = 0,
    draftTp = 0,
    draftSide = 'BUY',
    draftEntryPrice = 0,
    draftLots = 0.01,
  }) => {
    const spec = INSTRUMENTS[symbol] || INSTRUMENTS.XAUUSD;
    const marketStatus = getMarketStatus(symbol);
    const exchangeBadge = useMemo(() => resolveExchangeBadge(symbol), [symbol]);

    const [exchangeAnchorPrice, setExchangeAnchorPrice] = useState<number>(0);

    const rawBidProp = currentBid ?? bid ?? 0;
    const rawAskProp = currentAsk ?? ask ?? 0;
    const isPropStaticSeed =
      rawBidProp <= 0 || Math.abs(rawBidProp - spec.basePrice) < 1e-6;

    // If the parent quote is still sitting at the static seed before /api/market/quotes resolves, use the authentic exchange candle close!
    const displayBid =
      isPropStaticSeed && exchangeAnchorPrice > 0
        ? exchangeAnchorPrice
        : rawBidProp > 0
        ? rawBidProp
        : rawAskProp > 0
        ? roundPrice(rawAskProp - spec.spread, symbol)
        : spec.basePrice;

    const displayAsk =
      isPropStaticSeed && exchangeAnchorPrice > 0
        ? roundPrice(exchangeAnchorPrice + spec.spread, symbol)
        : rawAskProp > 0
        ? rawAskProp
        : roundPrice(displayBid + spec.spread, symbol);

    const [internalChartType, setInternalChartType] = useState<ChartTypeMode>('candles');
    const activeChartType = externalChartType ?? internalChartType;
    const handleChartTypeSelect = (next: ChartTypeMode) => {
      setInternalChartType(next);
      onChartTypeChange?.(next);
    };

    const [showEma, setShowEma] = useState(true);
    const [showBollinger, setShowBollinger] = useState(false);
    const [showVwap, setShowVwap] = useState(false);
    const [showVolume, setShowVolume] = useState(true);
    const [legendCollapsed, setLegendCollapsed] = useState(() =>
      typeof window !== 'undefined' ? window.innerWidth < 640 : false
    );
    const [crosshairMagnet, setCrosshairMagnet] = useState(false);
    const [isLogScale, setIsLogScale] = useState(false);
    const [isAutoScale, setIsAutoScale] = useState(true);
    const [drawingHLineMode, setDrawingHLineMode] = useState(false);
    const [drawnPriceLevels, setDrawnPriceLevels] = useState<number[]>([]);

    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [wsStatus, setWsStatus] = useState<OhlcWsStatus>('connecting');
    const [wsSourceLabel, setWsSourceLabel] = useState<string>('Connecting WS...');
    const [legendBar, setLegendBar] = useState<LightweightOhlcBar | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [lastFocusPrice, setLastFocusPrice] = useState<number>(displayBid);
    const [dragState, setDragState] = useState<ActiveSlTpDragState | null>(null);
    const [coordTick, setCoordTick] = useState<number>(0);
    const coordRafRef = useRef<number | null>(null);

    const scheduleCoordTick = useCallback(() => {
      if (coordRafRef.current !== null) return;
      coordRafRef.current = window.requestAnimationFrame(() => {
        coordRafRef.current = null;
        setCoordTick((n) => n + 1);
      });
    }, []);

    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const chartContainerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const mainSeriesRef = useRef<MainSeriesApi | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
    const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbMiddleSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const priceLinesRef = useRef<IPriceLine[]>([]);
    const drawnLinesRef = useRef<IPriceLine[]>([]);
    const openEntryLinesRef = useRef<Map<string, { line: IPriceLine; pos: TradeOrderRecord }>>(new Map());
    const openSlTpLinesRef = useRef<
      Map<string, { slLine?: IPriceLine; tpLine?: IPriceLine; pos: TradeOrderRecord }>
    >(new Map());
    const lastPriceLinesSigRef = useRef<string>('');
    const dragStateRef = useRef<ActiveSlTpDragState | null>(null);
    const dragRafRef = useRef<number | null>(null);
    const optimisticSlTpRef = useRef<
      Map<string, { sl?: number; tp?: number; expiresAt: number }>
    >(new Map());
    dragStateRef.current = dragState;

    const barsRef = useRef<LightweightOhlcBar[]>([]);
    const ema20MapRef = useRef<Map<number, number>>(new Map());
    const ema50MapRef = useRef<Map<number, number>>(new Map());
    const vwapMapRef = useRef<Map<number, number>>(new Map());
    const bbMapRef = useRef<Map<number, { upper: number; middle: number; lower: number }>>(new Map());

    const activeChartTypeRef = useRef<ChartTypeMode>(activeChartType);
    const symbolRef = useRef<SymbolCode>(symbol);
    const displayBidRef = useRef<number>(displayBid);
    const displayAskRef = useRef<number>(displayAsk);
    const lastAppliedSpotRef = useRef<number>(0);
    const hasInitialFocusedRef = useRef<boolean>(false);
    const isUserTouchingChartRef = useRef<boolean>(false);
    const pendingFocusOnTouchEndRef = useRef<boolean>(false);
    const lastPriceLineTitleTsRef = useRef<number>(0);
    const showEmaRef = useRef<boolean>(showEma);
    const showBollingerRef = useRef<boolean>(showBollinger);
    const showVwapRef = useRef<boolean>(showVwap);
    const showVolumeRef = useRef<boolean>(showVolume);
    const drawingHLineModeRef = useRef<boolean>(drawingHLineMode);

    activeChartTypeRef.current = activeChartType;
    symbolRef.current = symbol;
    displayBidRef.current = displayBid;
    displayAskRef.current = displayAsk;
    showEmaRef.current = showEma;
    showBollingerRef.current = showBollinger;
    showVwapRef.current = showVwap;
    showVolumeRef.current = showVolume;
    drawingHLineModeRef.current = drawingHLineMode;

    const minMove = useMemo(() => {
      const step = Math.pow(10, -spec.decimals);
      return Number(step.toFixed(spec.decimals)) || 0.01;
    }, [spec.decimals]);

    const clearPriceLines = useCallback(() => {
      const series = mainSeriesRef.current;
      if (series && priceLinesRef.current.length > 0) {
        for (const pl of priceLinesRef.current) {
          try {
            series.removePriceLine(pl);
          } catch {
            // ignore already removed line
          }
        }
      }
      priceLinesRef.current = [];
      openEntryLinesRef.current.clear();
      openSlTpLinesRef.current.clear();
      lastPriceLinesSigRef.current = '';
    }, []);

    const clearDrawnLines = useCallback(() => {
      const series = mainSeriesRef.current;
      if (series && drawnLinesRef.current.length > 0) {
        for (const dl of drawnLinesRef.current) {
          try {
            series.removePriceLine(dl);
          } catch {}
        }
      }
      drawnLinesRef.current = [];
    }, []);

    const syncDrawnPriceLines = useCallback(
      (levels: number[]) => {
        clearDrawnLines();
        const series = mainSeriesRef.current;
        if (!series || levels.length === 0) return;
        const created: IPriceLine[] = [];
        for (const lvl of levels) {
          try {
            created.push(
              series.createPriceLine({
                price: lvl,
                color: '#2962FF',
                lineWidth: 1,
                lineStyle: LineStyle.Solid,
                axisLabelVisible: true,
                title: 'H-Line',
              })
            );
          } catch {}
        }
        drawnLinesRef.current = created;
      },
      [clearDrawnLines]
    );

    const syncPriceInteractionOptions = useCallback((barCount: number) => {
      const chart = chartRef.current;
      if (!chart) return;
      const { enablePriceAxisScale, enableVertTouchDrag } =
        resolveChartPriceInteractionOptions(barCount);
      try {
        chart.applyOptions({
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: enableVertTouchDrag,
          },
          handleScale: {
            axisPressedMouseMove: {
              time: true,
              price: enablePriceAxisScale,
            },
            axisDoubleClickReset: {
              time: true,
              price: true,
            },
            mouseWheel: true,
            pinch: true,
          },
        });
      } catch {
        // ignore if chart unmounted
      }
    }, []);

    const focusChartOnCurrentPrice = useCallback(
      (barCount?: number, forceImmediate = false) => {
        const chart = chartRef.current;
        if (!chart) return;
        if (!forceImmediate && isUserTouchingChartRef.current) {
          pendingFocusOnTouchEndRef.current = true;
          return;
        }
        pendingFocusOnTouchEndRef.current = false;
        const count = barCount ?? barsRef.current.length;
        try {
          hasInitialFocusedRef.current = true;
          setIsAutoScale(true);
          chart.priceScale('right').applyOptions({
            autoScale: true,
            scaleMargins: { top: 0.12, bottom: 0.16 },
          });
          if (count > 0) {
            const range = computeCurrentPriceFocusLogicalRange(count, 65, 6);
            chart.timeScale().setVisibleLogicalRange(range);
          }
          chart.timeScale().scrollToRealTime();
          const latest = barsRef.current[barsRef.current.length - 1];
          setLastFocusPrice(latest ? latest.close : displayBidRef.current);
          scheduleCoordTick();
        } catch {
          // ignore if chart unmounted
        }
      },
      [scheduleCoordTick]
    );

    const syncIndicatorOverlays = useCallback((rawBars: LightweightOhlcBar[]) => {
      const ema20 = ema20SeriesRef.current;
      const ema50 = ema50SeriesRef.current;
      const vwap = vwapSeriesRef.current;
      const bbUpper = bbUpperSeriesRef.current;
      const bbMiddle = bbMiddleSeriesRef.current;
      const bbLower = bbLowerSeriesRef.current;
      const volSeries = volumeSeriesRef.current;

      if (volSeries) {
        volSeries.applyOptions({ visible: showVolumeRef.current });
        if (showVolumeRef.current && rawBars.length > 0) {
          volSeries.setData(rawBars.map(toVolumeBar));
        } else {
          volSeries.setData([]);
        }
      }

      ema20MapRef.current.clear();
      ema50MapRef.current.clear();
      if (ema20 && ema50) {
        ema20.applyOptions({ visible: showEmaRef.current });
        ema50.applyOptions({ visible: showEmaRef.current });
        if (rawBars.length >= 20) {
          const e20 = computeEmaSeries(rawBars, 20);
          const e50 = computeEmaSeries(rawBars, 50);
          for (const d of e20) ema20MapRef.current.set(d.time, d.value);
          for (const d of e50) ema50MapRef.current.set(d.time, d.value);
          if (showEmaRef.current) {
            ema20.setData(e20.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
            ema50.setData(e50.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
          } else {
            ema20.setData([]);
            ema50.setData([]);
          }
        } else {
          ema20.setData([]);
          ema50.setData([]);
        }
      }

      vwapMapRef.current.clear();
      if (vwap) {
        vwap.applyOptions({ visible: showVwapRef.current });
        if (rawBars.length > 0) {
          const vSeries = computeVwapSeries(rawBars);
          for (const d of vSeries) vwapMapRef.current.set(d.time, d.value);
          if (showVwapRef.current) {
            vwap.setData(vSeries.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })));
          } else {
            vwap.setData([]);
          }
        } else {
          vwap.setData([]);
        }
      }

      bbMapRef.current.clear();
      if (bbUpper && bbMiddle && bbLower) {
        bbUpper.applyOptions({ visible: showBollingerRef.current });
        bbMiddle.applyOptions({ visible: showBollingerRef.current });
        bbLower.applyOptions({ visible: showBollingerRef.current });
        if (rawBars.length >= 20) {
          const bb = computeBollingerBands(rawBars, 20, 2);
          for (let i = 0; i < bb.middle.length; i++) {
            bbMapRef.current.set(bb.middle[i].time, {
              upper: bb.upper[i].value,
              middle: bb.middle[i].value,
              lower: bb.lower[i].value,
            });
          }
          if (showBollingerRef.current) {
            bbUpper.setData(
              bb.upper.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }))
            );
            bbMiddle.setData(
              bb.middle.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }))
            );
            bbLower.setData(
              bb.lower.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }))
            );
          } else {
            bbUpper.setData([]);
            bbMiddle.setData([]);
            bbLower.setData([]);
          }
        } else {
          bbUpper.setData([]);
          bbMiddle.setData([]);
          bbLower.setData([]);
        }
      }
    }, []);

    const createOrReplaceMainSeries = useCallback(
      (mode: ChartTypeMode, precision: number, stepMinMove: number, rawBars: LightweightOhlcBar[]) => {
        const chart = chartRef.current;
        if (!chart) return;

        clearPriceLines();
        clearDrawnLines();
        syncPriceInteractionOptions(0);
        if (mainSeriesRef.current) {
          try {
            chart.removeSeries(mainSeriesRef.current);
          } catch {}
          mainSeriesRef.current = null;
        }

        const priceFormat = {
          type: 'price' as const,
          precision,
          minMove: stepMinMove,
        };

        chart.applyOptions({
          localization: {
            priceFormatter: (price: number) => price.toFixed(precision),
          },
        });

        // Clear overlay series before setting new mainSeries data so the right price scale never combines two pairs' price ranges
        ema20SeriesRef.current?.applyOptions({ priceFormat });
        ema50SeriesRef.current?.applyOptions({ priceFormat });
        vwapSeriesRef.current?.applyOptions({ priceFormat });
        bbUpperSeriesRef.current?.applyOptions({ priceFormat });
        bbMiddleSeriesRef.current?.applyOptions({ priceFormat });
        bbLowerSeriesRef.current?.applyOptions({ priceFormat });
        ema20SeriesRef.current?.setData([]);
        ema50SeriesRef.current?.setData([]);
        vwapSeriesRef.current?.setData([]);
        bbUpperSeriesRef.current?.setData([]);
        bbMiddleSeriesRef.current?.setData([]);
        bbLowerSeriesRef.current?.setData([]);
        volumeSeriesRef.current?.setData([]);

        let nextSeries: MainSeriesApi;
        if (mode === 'line') {
          nextSeries = chart.addSeries(LineSeries, {
            color: '#2962FF',
            lineWidth: 2,
            priceFormat,
            lastValueVisible: false,
            priceLineVisible: true,
            priceLineColor: '#2962FF',
            priceLineStyle: LineStyle.Dotted,
          });
        } else if (mode === 'area') {
          nextSeries = chart.addSeries(AreaSeries, {
            lineColor: '#2962FF',
            topColor: 'rgba(41, 98, 255, 0.28)',
            bottomColor: 'rgba(41, 98, 255, 0.00)',
            lineWidth: 2,
            priceFormat,
            lastValueVisible: false,
            priceLineVisible: true,
            priceLineColor: '#2962FF',
            priceLineStyle: LineStyle.Dotted,
          });
        } else if (mode === 'bars') {
          nextSeries = chart.addSeries(BarSeries, {
            upColor: '#089981',
            downColor: '#F23645',
            thinBars: false,
            priceFormat,
            lastValueVisible: false,
            priceLineVisible: true,
            priceLineStyle: LineStyle.Dotted,
          });
        } else if (mode === 'hollow') {
          nextSeries = chart.addSeries(CandlestickSeries, {
            upColor: 'transparent',
            downColor: '#F23645',
            borderVisible: true,
            borderUpColor: '#089981',
            borderDownColor: '#F23645',
            wickUpColor: '#089981',
            wickDownColor: '#F23645',
            priceFormat,
            lastValueVisible: false,
            priceLineVisible: true,
            priceLineStyle: LineStyle.Dotted,
          });
        } else {
          // Authentic TradingView Supercharts Candlestick colors (#089981 Bull / #F23645 Bear)
          nextSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#089981',
            downColor: '#F23645',
            borderVisible: true,
            borderUpColor: '#089981',
            borderDownColor: '#F23645',
            wickUpColor: '#089981',
            wickDownColor: '#F23645',
            priceFormat,
            lastValueVisible: false,
            priceLineVisible: true,
            priceLineStyle: LineStyle.Dotted,
          });
        }

        mainSeriesRef.current = nextSeries;
        const displayBars =
          mode === 'heikin_ashi' ? transformCandlesToHeikinAshi(rawBars) : rawBars;
        if (displayBars.length > 0) {
          nextSeries.setData(displayBars.map((b) => toSeriesBar(b, mode)) as any);
          syncPriceInteractionOptions(displayBars.length);
        } else {
          syncPriceInteractionOptions(0);
        }
      },
      [clearDrawnLines, clearPriceLines, syncPriceInteractionOptions]
    );

    const orderStructureSig = useMemo(() => {
      const openSig = openPositions
        .filter((p) => p.symbol === symbol)
        .map((p) => `${p.id}:${p.side}:${p.volume}:${p.entryPrice}:${p.stopLoss}:${p.takeProfit}`)
        .join('|');
      const pendSig = pendingOrders
        .filter((o) => o.symbol === symbol)
        .map((o) => `${o.id}:${o.orderType}:${o.volume}:${o.entryPrice}:${o.stopLoss}:${o.takeProfit}`)
        .join('|');
      const draftSig = `${draftSide}:${draftEntryPrice}:${draftLots}:${draftSl}:${draftTp}`;
      return `${symbol}::${activeChartType}::${openSig}::${pendSig}::${draftSig}`;
    }, [openPositions, pendingOrders, symbol, activeChartType, draftSide, draftEntryPrice, draftLots, draftSl, draftTp]);

    const syncOrderPriceLines = useCallback(() => {
      const series = mainSeriesRef.current;
      if (!series) return;
      if (lastPriceLinesSigRef.current === orderStructureSig) {
        return;
      }
      clearPriceLines();
      lastPriceLinesSigRef.current = orderStructureSig;

      const nextLines: IPriceLine[] = [];
      const bidNow = displayBidRef.current;
      const askNow = displayAskRef.current;

      for (const pos of openPositions) {
        if (pos.symbol !== symbol) continue;
        try {
          const entryLine = series.createPriceLine({
            price: pos.entryPrice,
            color: pos.side === 'BUY' ? '#089981' : '#F23645',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: '',
          });
          nextLines.push(entryLine);
          openEntryLinesRef.current.set(pos.id, { line: entryLine, pos });

          let slLine: IPriceLine | undefined;
          let tpLine: IPriceLine | undefined;

          if (pos.stopLoss > 0) {
            slLine = series.createPriceLine({
              price: pos.stopLoss,
              color: '#F23645',
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: '',
            });
            nextLines.push(slLine);
          }
          if (pos.takeProfit > 0) {
            tpLine = series.createPriceLine({
              price: pos.takeProfit,
              color: '#089981',
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: '',
            });
            nextLines.push(tpLine);
          }

          openSlTpLinesRef.current.set(pos.id, { slLine, tpLine, pos });
        } catch {
          // ignore if series unmounted
        }
      }

      for (const ord of pendingOrders) {
        if (ord.symbol !== symbol) continue;
        try {
          nextLines.push(
            series.createPriceLine({
              price: ord.entryPrice,
              color: '#F59E0B',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: true,
              title: '',
            })
          );
          if (ord.stopLoss > 0) {
            nextLines.push(
              series.createPriceLine({
                price: ord.stopLoss,
                color: 'rgba(242, 54, 69, 0.78)',
                lineWidth: 1,
                lineStyle: LineStyle.Dotted,
                axisLabelVisible: true,
                title: `ORD SL ${ord.stopLoss.toFixed(spec.decimals)}`,
              })
            );
          }
          if (ord.takeProfit > 0) {
            nextLines.push(
              series.createPriceLine({
                price: ord.takeProfit,
                color: 'rgba(8, 153, 129, 0.78)',
                lineWidth: 1,
                lineStyle: LineStyle.Dotted,
                axisLabelVisible: true,
                title: `ORD TP ${ord.takeProfit.toFixed(spec.decimals)}`,
              })
            );
          }
        } catch {}
      }

      // Pre-trade Draft SL / TP Preview Lines on Chart
      if (draftSl > 0 || draftTp > 0) {
        const refEntry =
          draftEntryPrice > 0
            ? draftEntryPrice
            : draftSide === 'BUY'
            ? askNow
            : bidNow;
        const draftPreview = validateAndComputeSlTpPreview({
          symbol,
          side: draftSide,
          referencePrice: refEntry,
          liveBid: bidNow,
          liveAsk: askNow,
          volume: Math.max(0.01, Number(draftLots) || 0.01),
          stopLoss: draftSl > 0 ? draftSl : undefined,
          takeProfit: draftTp > 0 ? draftTp : undefined,
          allowAutoClamp: true,
        });
        try {
          if (draftSl > 0) {
            nextLines.push(
              series.createPriceLine({
                price: draftSl,
                color: '#FB7185',
                lineWidth: 1,
                lineStyle: LineStyle.LargeDashed,
                axisLabelVisible: true,
                title: `DRAFT SL${draftPreview.riskUsd !== null ? ` (-$${draftPreview.riskUsd.toFixed(2)})` : ''}`,
              })
            );
          }
          if (draftTp > 0) {
            nextLines.push(
              series.createPriceLine({
                price: draftTp,
                color: '#34D399',
                lineWidth: 1,
                lineStyle: LineStyle.LargeDashed,
                axisLabelVisible: true,
                title: `DRAFT TP${draftPreview.rewardUsd !== null ? ` (+$${draftPreview.rewardUsd.toFixed(2)})` : ''}`,
              })
            );
          }
        } catch {}
      }

      priceLinesRef.current = nextLines;
      scheduleCoordTick();
    }, [
      clearPriceLines,
      draftEntryPrice,
      draftLots,
      draftSide,
      draftSl,
      draftTp,
      openPositions,
      orderStructureSig,
      pendingOrders,
      scheduleCoordTick,
      spec.decimals,
      symbol,
    ]);

    // 1. Initialize TradingView Lightweight Charts instance once on mount
    useEffect(() => {
      const container = chartContainerRef.current;
      if (!container) return;

      const initialWidth = Math.max(280, container.clientWidth || 640);
      const initialHeight = Math.max(260, container.clientHeight || 420);

      const chart = createChart(container, {
        width: initialWidth,
        height: initialHeight,
        layout: {
          background: { type: ColorType.Solid, color: '#131722' },
          textColor: '#B2B5BE',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: '#1E222D' },
          horzLines: { color: '#1E222D' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: '#9598A1',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#2A2E39',
          },
          horzLine: {
            color: '#9598A1',
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: '#2A2E39',
          },
        },
        rightPriceScale: {
          borderColor: '#2A2E39',
          scaleMargins: { top: 0.12, bottom: 0.16 },
          autoScale: true,
          ticksVisible: true,
        },
        timeScale: {
          borderColor: '#2A2E39',
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 7,
          barSpacing: 9,
          minBarSpacing: 2.5,
          shiftVisibleRangeOnNewBar: false,
          lockVisibleTimeRangeOnResize: true,
        },
        kineticScroll: {
          mouse: true,
          touch: true,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        },
        handleScale: {
          axisPressedMouseMove: {
            time: true,
            price: false,
          },
          axisDoubleClickReset: {
            time: true,
            price: true,
          },
          mouseWheel: true,
          pinch: true,
        },
      });

      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });

      const ema20Series = chart.addSeries(LineSeries, {
        color: '#2962FF',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const ema50Series = chart.addSeries(LineSeries, {
        color: '#FF9800',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      const vwapSeries = chart.addSeries(LineSeries, {
        color: '#E040FB',
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        visible: false,
      });
      const bbUpperSeries = chart.addSeries(LineSeries, {
        color: 'rgba(33, 150, 243, 0.72)',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        visible: false,
      });
      const bbMiddleSeries = chart.addSeries(LineSeries, {
        color: 'rgba(255, 109, 0, 0.72)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        visible: false,
      });
      const bbLowerSeries = chart.addSeries(LineSeries, {
        color: 'rgba(33, 150, 243, 0.72)',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        visible: false,
      });

      chartRef.current = chart;
      volumeSeriesRef.current = volumeSeries;
      ema20SeriesRef.current = ema20Series;
      ema50SeriesRef.current = ema50Series;
      vwapSeriesRef.current = vwapSeries;
      bbUpperSeriesRef.current = bbUpperSeries;
      bbMiddleSeriesRef.current = bbMiddleSeries;
      bbLowerSeriesRef.current = bbLowerSeries;

      const handleCrosshairMove = (param: any) => {
        const series = mainSeriesRef.current;
        if (!param?.time || !series) {
          const last = barsRef.current[barsRef.current.length - 1] || null;
          setLegendBar(last);
          return;
        }
        const tNum = Number(param.time);
        const match = barsRef.current.find((b) => b.time === tNum);
        if (match) {
          setLegendBar(match);
        }
      };

      const handleChartClick = (param: any) => {
        if (!drawingHLineModeRef.current) return;
        const series = mainSeriesRef.current;
        if (!series || !param?.point) return;
        const rawPrice = series.coordinateToPrice(param.point.y);
        if (rawPrice === null || !Number.isFinite(Number(rawPrice)) || Number(rawPrice) <= 0) return;
        const rounded = roundPrice(Number(rawPrice), symbolRef.current);
        setDrawnPriceLevels((prev) => [...prev, rounded]);
        setDrawingHLineMode(false);
      };

      const handleRangeChange = () => {
        scheduleCoordTick();
      };

      const handleTouchOrPointerStart = () => {
        isUserTouchingChartRef.current = true;
      };

      const handleTouchOrPointerEnd = () => {
        isUserTouchingChartRef.current = false;
        try {
          const scaleOpts = chart.priceScale('right').options();
          setIsAutoScale(Boolean(scaleOpts.autoScale));
        } catch {}
        if (pendingFocusOnTouchEndRef.current && barsRef.current.length > 0) {
          pendingFocusOnTouchEndRef.current = false;
          try {
            hasInitialFocusedRef.current = true;
            setIsAutoScale(true);
            chart.priceScale('right').applyOptions({
              autoScale: true,
              scaleMargins: { top: 0.12, bottom: 0.16 },
            });
            const range = computeCurrentPriceFocusLogicalRange(barsRef.current.length, 65, 6);
            chart.timeScale().setVisibleLogicalRange(range);
            chart.timeScale().scrollToRealTime();
            scheduleCoordTick();
          } catch {}
        }
      };

      const handleContainerDblClick = (evt: MouseEvent) => {
        if (barsRef.current.length === 0) return;
        const rect = container.getBoundingClientRect();
        const fromRight = rect.right - evt.clientX;
        if (fromRight >= 0 && fromRight <= 86) {
          setIsAutoScale(true);
          try {
            chart.priceScale('right').applyOptions({ autoScale: true });
          } catch {}
          scheduleCoordTick();
        }
      };

      container.addEventListener('touchstart', handleTouchOrPointerStart, { passive: true });
      container.addEventListener('pointerdown', handleTouchOrPointerStart, { passive: true });
      window.addEventListener('touchend', handleTouchOrPointerEnd, { passive: true });
      window.addEventListener('touchcancel', handleTouchOrPointerEnd, { passive: true });
      window.addEventListener('pointerup', handleTouchOrPointerEnd, { passive: true });
      window.addEventListener('pointercancel', handleTouchOrPointerEnd, { passive: true });
      container.addEventListener('dblclick', handleContainerDblClick);
      chart.subscribeCrosshairMove(handleCrosshairMove);
      chart.subscribeClick(handleChartClick);
      chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);

      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 40 && height > 40) {
            chart.resize(Math.floor(width), Math.floor(height));
            scheduleCoordTick();
          }
        }
      });
      resizeObserver.observe(container);

      return () => {
        if (coordRafRef.current !== null) {
          window.cancelAnimationFrame(coordRafRef.current);
          coordRafRef.current = null;
        }
        if (dragRafRef.current !== null) {
          window.cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = null;
        }
        isUserTouchingChartRef.current = false;
        pendingFocusOnTouchEndRef.current = false;
        container.removeEventListener('touchstart', handleTouchOrPointerStart);
        container.removeEventListener('pointerdown', handleTouchOrPointerStart);
        window.removeEventListener('touchend', handleTouchOrPointerEnd);
        window.removeEventListener('touchcancel', handleTouchOrPointerEnd);
        window.removeEventListener('pointerup', handleTouchOrPointerEnd);
        window.removeEventListener('pointercancel', handleTouchOrPointerEnd);
        container.removeEventListener('dblclick', handleContainerDblClick);
        resizeObserver.disconnect();
        chart.unsubscribeCrosshairMove(handleCrosshairMove);
        chart.unsubscribeClick(handleChartClick);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
        clearPriceLines();
        clearDrawnLines();
        chart.remove();
        chartRef.current = null;
        mainSeriesRef.current = null;
        volumeSeriesRef.current = null;
        ema20SeriesRef.current = null;
        ema50SeriesRef.current = null;
        vwapSeriesRef.current = null;
        bbUpperSeriesRef.current = null;
        bbMiddleSeriesRef.current = null;
        bbLowerSeriesRef.current = null;
      };
    }, [clearDrawnLines, clearPriceLines, scheduleCoordTick]);

    // 2. Rebuild primary series cleanly when chartType changes
    useEffect(() => {
      if (barsRef.current.length === 0) return;
      createOrReplaceMainSeries(
        activeChartType,
        spec.decimals,
        minMove,
        barsRef.current
      );
      syncIndicatorOverlays(barsRef.current);
      syncOrderPriceLines();
      syncDrawnPriceLines(drawnPriceLevels);
      focusChartOnCurrentPrice(barsRef.current.length);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChartType]);

    // 3. Refresh indicator overlays when toggles change
    useEffect(() => {
      syncIndicatorOverlays(barsRef.current);
    }, [showEma, showBollinger, showVwap, showVolume, syncIndicatorOverlays]);

    // 3b. Sync user-drawn horizontal lines
    useEffect(() => {
      syncDrawnPriceLines(drawnPriceLevels);
    }, [drawnPriceLevels, syncDrawnPriceLines]);

    // 3c. Sync Crosshair mode (Normal vs Magnet) and PriceScale mode (Normal vs Logarithmic)
    // autoScale is updated directly inside explicit user handlers so async React effects never mutate it mid-touch
    useEffect(() => {
      chartRef.current?.applyOptions({
        crosshair: {
          mode: crosshairMagnet ? CrosshairMode.Magnet : CrosshairMode.Normal,
        },
        rightPriceScale: {
          mode: isLogScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
        },
      });
    }, [crosshairMagnet, isLogScale]);

    // 4. Sync timeScale secondsVisible with timeframeSeconds
    useEffect(() => {
      chartRef.current?.timeScale().applyOptions({
        secondsVisible: timeframeSeconds < 60,
      });
    }, [timeframeSeconds]);

    // 5. Load authentic historical OHLC & subscribe to real-time WebSocket OHLC stream (1:1 reflection of TradingView market data)
    useEffect(() => {
      let cancelled = false;
      setIsLoadingHistory(true);
      setContextMenu(null);
      setDrawnPriceLevels([]);
      lastAppliedSpotRef.current = 0;
      hasInitialFocusedRef.current = false;

      const currentLivePrice = displayBidRef.current > 0 ? displayBidRef.current : spec.basePrice;
      const isDirectCrypto = isDirectExchangeSymbol(symbol) && symbol !== 'XAUUSD';

      // Use cached authentic exchange klines immediately if available; otherwise wait for /api/market/klines so we never flash synthetic candles
      const cachedExchange = getCachedExchangeCandles(symbol, timeframeLabel, currentLivePrice);
      if (cachedExchange && cachedExchange.length > 0) {
        const seedBars = normalizeCandlesForLightweightCharts(cachedExchange);
        barsRef.current = seedBars;
        if (mainSeriesRef.current) {
          mainSeriesRef.current.applyOptions({
            priceFormat: { type: 'price', precision: spec.decimals, minMove },
          });
          const mode = activeChartTypeRef.current;
          mainSeriesRef.current.setData(seedBars.map((b) => toSeriesBar(b, mode)) as any);
          syncPriceInteractionOptions(seedBars.length);
        } else {
          createOrReplaceMainSeries(activeChartTypeRef.current, spec.decimals, minMove, seedBars);
        }
        syncIndicatorOverlays(seedBars);
        syncOrderPriceLines();
        if (seedBars.length > 0) {
          const lastClose = seedBars[seedBars.length - 1].close;
          setExchangeAnchorPrice(lastClose);
          setLegendBar(seedBars[seedBars.length - 1]);
        }
        if (shouldAutoFocusChartOnTick(hasInitialFocusedRef.current, false)) {
          focusChartOnCurrentPrice(seedBars.length);
        }
      }

      fetchLiveInstrumentCandles(symbol, timeframeLabel, currentLivePrice)
        .then((candles) => {
          if (cancelled) return;
          const rawLastClose =
            candles.length > 0 ? candles[candles.length - 1].close : currentLivePrice;
          const propBidNow = displayBidRef.current;
          const isStillStaticSeed =
            propBidNow <= 0 || Math.abs(propBidNow - spec.basePrice) < 1e-6;
          const latestSpot = isStillStaticSeed ? rawLastClose : propBidNow;

          const reconciled = reconcileCandlesWithLiveQuote(
            candles,
            symbol,
            latestSpot,
            isDirectCrypto ? 'binance' : 'yahoo'
          );
          const normalized = normalizeCandlesForLightweightCharts(reconciled);
          if (normalized.length > 0) {
            barsRef.current = normalized;
            const latestClose = normalized[normalized.length - 1].close;
            lastAppliedSpotRef.current = latestClose;
            setExchangeAnchorPrice(latestClose);
            if (mainSeriesRef.current) {
              mainSeriesRef.current.applyOptions({
                priceFormat: { type: 'price', precision: spec.decimals, minMove },
              });
              const mode = activeChartTypeRef.current;
              mainSeriesRef.current.setData(normalized.map((b) => toSeriesBar(b, mode)) as any);
              syncPriceInteractionOptions(normalized.length);
            } else {
              createOrReplaceMainSeries(
                activeChartTypeRef.current,
                spec.decimals,
                minMove,
                normalized
              );
            }
            syncIndicatorOverlays(normalized);
            syncOrderPriceLines();
            setLegendBar(normalized[normalized.length - 1]);
            focusChartOnCurrentPrice(normalized.length);
          }
          setIsLoadingHistory(false);
        })
        .catch(() => {
          if (cancelled) return;
          if (barsRef.current.length === 0) {
            const fallbackBars = normalizeCandlesForLightweightCharts(
              buildSpotAnchoredCandles(symbol, timeframeLabel, currentLivePrice)
            );
            barsRef.current = fallbackBars;
            const mode = activeChartTypeRef.current;
            mainSeriesRef.current?.setData(
              fallbackBars.map((b) => toSeriesBar(b, mode)) as any
            );
            syncPriceInteractionOptions(fallbackBars.length);
            syncIndicatorOverlays(fallbackBars);
            syncOrderPriceLines();
            if (fallbackBars.length > 0) {
              setLegendBar(fallbackBars[fallbackBars.length - 1]);
            }
            focusChartOnCurrentPrice(fallbackBars.length);
          }
          setIsLoadingHistory(false);
        });

      const unsubscribeWs = subscribeLiveOhlcWebSocket({
        symbol,
        intervalLabel: timeframeLabel,
        onStatus: (status, label) => {
          if (!cancelled) {
            setWsStatus(status);
            setWsSourceLabel(label);
          }
        },
        onBar: (incomingBar, meta) => {
          if (cancelled) return;
          const currentBars = barsRef.current;
          if (currentBars.length === 0) return;

          const activeBid = displayBidRef.current;
          const isBidReal = activeBid > 0 && Math.abs(activeBid - spec.basePrice) > 1e-6;
          if (!isBidReal) {
            setExchangeAnchorPrice(incomingBar.close);
          }

          // For non-direct-Binance symbols, use one unified spot price (displayBid when available) so candles never fight two competing tick values
          if (meta?.source !== 'binance-kline-ws') {
            if (isBidReal) {
              return;
            }
            const tickPrice = roundPrice(incomingBar.close, symbol);

            const prevLastTime = barsRef.current[barsRef.current.length - 1]?.time || 0;
            const { bars: nextBars, updatedBar } = mergeSpotTickIntoLatestCandle(
              barsRef.current,
              tickPrice,
              timeframeSeconds
            );
            if (!updatedBar) return;
            barsRef.current = nextBars;

            const mode = activeChartTypeRef.current;
            const didShiftHistory =
              nextBars.length >= 2 &&
              prevLastTime > 0 &&
              nextBars[nextBars.length - 2].time !== prevLastTime &&
              updatedBar.time !== prevLastTime;

            if (mainSeriesRef.current) {
              if (didShiftHistory) {
                const disp =
                  mode === 'heikin_ashi' ? transformCandlesToHeikinAshi(nextBars) : nextBars;
                mainSeriesRef.current.setData(disp.map((b) => toSeriesBar(b, mode)) as any);
                syncIndicatorOverlays(nextBars);
              } else if (mode === 'heikin_ashi') {
                const haBars = transformCandlesToHeikinAshi(nextBars);
                const latestHa = haBars[haBars.length - 1];
                if (latestHa) {
                  mainSeriesRef.current.update(toSeriesBar(latestHa, mode) as any);
                }
              } else {
                mainSeriesRef.current.update(toSeriesBar(updatedBar, mode) as any);
              }
            }
            if (!didShiftHistory && volumeSeriesRef.current && showVolumeRef.current) {
              volumeSeriesRef.current.update(toVolumeBar(updatedBar));
            }
            setLegendBar(updatedBar);
            scheduleCoordTick();
            return;
          }

          // Direct Binance @kline_<interval> WebSocket stream for Crypto pairs
          const barToMerge: LightweightOhlcBar =
            isBidReal &&
            Math.abs(incomingBar.close - activeBid) / Math.max(1e-9, incomingBar.close) < 0.01
              ? {
                  ...incomingBar,
                  close: roundPrice(activeBid, symbol),
                  high: roundPrice(Math.max(incomingBar.high, incomingBar.open, activeBid), symbol),
                  low: roundPrice(Math.min(incomingBar.low, incomingBar.open, activeBid), symbol),
                }
              : incomingBar;

          const merged = mergeRealtimeOhlcBar(barsRef.current, barToMerge, 500);
          if (!merged.updatedBar || merged.action === 'ignore') return;
          barsRef.current = merged.bars;

          const mode = activeChartTypeRef.current;
          if (mainSeriesRef.current) {
            if (mode === 'heikin_ashi') {
              const haBars = transformCandlesToHeikinAshi(merged.bars);
              const latestHa = haBars[haBars.length - 1];
              if (latestHa) {
                mainSeriesRef.current.update(toSeriesBar(latestHa, mode) as any);
              }
            } else {
              mainSeriesRef.current.update(toSeriesBar(merged.updatedBar, mode) as any);
            }
          }
          if (volumeSeriesRef.current && showVolumeRef.current) {
            volumeSeriesRef.current.update(toVolumeBar(merged.updatedBar));
          }
          setLegendBar(merged.updatedBar);
          scheduleCoordTick();
        },
      });

      return () => {
        cancelled = true;
        unsubscribeWs();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol, timeframeLabel]);

    // 6. Keep right-most candle 1:1 with live Bid quote (reconciles Friday close on closed markets; updates forming bar on open markets)
    useEffect(() => {
      if (!Number.isFinite(displayBid) || displayBid <= 0 || barsRef.current.length === 0) {
        return;
      }
      // Never shift authentic exchange klines to the static fallback basePrice seed
      if (Math.abs(displayBid - spec.basePrice) < 1e-6) {
        return;
      }
      if (displayBid === lastAppliedSpotRef.current) {
        return;
      }
      lastAppliedSpotRef.current = displayBid;

      const isMarketOpen = getMarketStatus(symbol).isOpen;
      const isDirectCrypto = isDirectExchangeSymbol(symbol) && symbol !== 'XAUUSD';
      const lastExisting = barsRef.current[barsRef.current.length - 1];

      // When market is closed (Sat–Sun), never append weekend bars; update only closed candle without hijacking scroll
      if (!isMarketOpen) {
        if (lastExisting && Math.abs(lastExisting.close - displayBid) >= minMove) {
          const reconciledClosed = normalizeCandlesForLightweightCharts(
            reconcileCandlesWithLiveQuote(
              barsRef.current.map((b) => ({ ...b, time: b.time * 1000, isExchangeKline: true })),
              symbol,
              displayBid,
              'yahoo'
            )
          );
          if (reconciledClosed.length > 0) {
            barsRef.current = reconciledClosed;
            const mode = activeChartTypeRef.current;
            const disp =
              mode === 'heikin_ashi'
                ? transformCandlesToHeikinAshi(reconciledClosed)
                : reconciledClosed;
            mainSeriesRef.current?.setData(disp.map((b) => toSeriesBar(b, mode)) as any);
            syncIndicatorOverlays(reconciledClosed);
            setLegendBar(reconciledClosed[reconciledClosed.length - 1]);
            if (shouldAutoFocusChartOnTick(hasInitialFocusedRef.current, false)) {
              focusChartOnCurrentPrice(reconciledClosed.length);
            }
          }
        }
        return;
      }

      if (
        !isDirectCrypto &&
        !hasInitialFocusedRef.current &&
        lastExisting &&
        Math.abs(lastExisting.close - displayBid) / Math.max(1e-9, displayBid) > 0.0025
      ) {
        const reAnchored = normalizeCandlesForLightweightCharts(
          reconcileCandlesWithLiveQuote(
            barsRef.current.map((b) => ({ ...b, time: b.time * 1000, isExchangeKline: true })),
            symbol,
            displayBid,
            'yahoo'
          )
        );
        if (reAnchored.length > 0) {
          barsRef.current = reAnchored;
          const mode = activeChartTypeRef.current;
          const disp =
            mode === 'heikin_ashi' ? transformCandlesToHeikinAshi(reAnchored) : reAnchored;
          mainSeriesRef.current?.setData(disp.map((b) => toSeriesBar(b, mode)) as any);
          syncIndicatorOverlays(reAnchored);
          setLegendBar(reAnchored[reAnchored.length - 1]);
          focusChartOnCurrentPrice(reAnchored.length);
          return;
        }
      }

      const prevLastTime = lastExisting ? lastExisting.time : 0;
      const { bars, updatedBar } = mergeSpotTickIntoLatestCandle(
        barsRef.current,
        displayBid,
        timeframeSeconds
      );
      if (!updatedBar) return;
      barsRef.current = bars;

      const didShiftHistory =
        bars.length >= 2 &&
        prevLastTime > 0 &&
        bars[bars.length - 2].time !== prevLastTime &&
        updatedBar.time !== prevLastTime;

      const mode = activeChartTypeRef.current;
      if (mainSeriesRef.current) {
        if (didShiftHistory) {
          const disp = mode === 'heikin_ashi' ? transformCandlesToHeikinAshi(bars) : bars;
          mainSeriesRef.current.setData(disp.map((b) => toSeriesBar(b, mode)) as any);
          syncIndicatorOverlays(bars);
        } else if (mode === 'heikin_ashi') {
          const ha = transformCandlesToHeikinAshi(bars);
          const latestHa = ha[ha.length - 1];
          if (latestHa) {
            mainSeriesRef.current.update(toSeriesBar(latestHa, mode) as any);
          }
        } else {
          mainSeriesRef.current.update(toSeriesBar(updatedBar, mode) as any);
        }
      }
      if (!didShiftHistory && volumeSeriesRef.current && showVolumeRef.current) {
        volumeSeriesRef.current.update(toVolumeBar(updatedBar));
      }

      setLegendBar(updatedBar);
      scheduleCoordTick();

      const nowTs = Date.now();
      if (openEntryLinesRef.current.size > 0 && nowTs - lastPriceLineTitleTsRef.current >= 1000) {
        lastPriceLineTitleTsRef.current = nowTs;
      }
    }, [
      displayAsk,
      displayBid,
      focusChartOnCurrentPrice,
      minMove,
      spec.basePrice,
      spec.category,
      symbol,
      syncIndicatorOverlays,
      timeframeSeconds,
    ]);

    // 7. Re-sync order & SL/TP price lines ONLY when position/order structure changes
    useEffect(() => {
      syncOrderPriceLines();
    }, [syncOrderPriceLines]);

    // 8. Redirect chart viewport to current live price whenever user clicks any pair (even if already active)
    useEffect(() => {
      if (!focusTrigger || barsRef.current.length === 0) return;
      const liveSpot = displayBidRef.current;
      if (liveSpot > 0 && Math.abs(liveSpot - spec.basePrice) > 1e-6) {
        const isDirectCrypto = isDirectExchangeSymbol(symbol) && symbol !== 'XAUUSD';
        const reSynced = normalizeCandlesForLightweightCharts(
          reconcileCandlesWithLiveQuote(
            barsRef.current.map((b) => ({ ...b, time: b.time * 1000, isExchangeKline: true })),
            symbol,
            liveSpot,
            isDirectCrypto ? 'binance' : 'yahoo'
          )
        );
        if (reSynced.length > 0) {
          barsRef.current = reSynced;
          const mode = activeChartTypeRef.current;
          const disp =
            mode === 'heikin_ashi' ? transformCandlesToHeikinAshi(reSynced) : reSynced;
          mainSeriesRef.current?.setData(disp.map((b) => toSeriesBar(b, mode)) as any);
          syncIndicatorOverlays(reSynced);
          setLegendBar(reSynced[reSynced.length - 1]);
        }
      }
      focusChartOnCurrentPrice(barsRef.current.length);
    }, [focusTrigger, focusChartOnCurrentPrice, spec.basePrice, symbol, syncIndicatorOverlays]);

    // 9. Interactive 120fps vertical drag of SL / TP handles & lines directly on the chart
    const startSlTpDrag = useCallback(
      (
        e: React.PointerEvent<HTMLElement>,
        pos: TradeOrderRecord,
        targetType: 'sl' | 'tp',
        initialPrice: number
      ) => {
        e.preventDefault();
        e.stopPropagation();
        if (!onModifyPositionSlTp) return;

        const chart = chartRef.current;
        const series = mainSeriesRef.current;
        const container = chartContainerRef.current;
        if (!chart || !series || !container) return;

        const captureEl = e.currentTarget as HTMLElement | null;
        const pointerId = e.pointerId;
        try {
          captureEl?.setPointerCapture?.(pointerId);
        } catch {}

        // Temporarily disable chart drag-scroll while dragging SL/TP line
        try {
          chart.applyOptions({
            handleScroll: {
              mouseWheel: true,
              pressedMouseMove: false,
              horzTouchDrag: false,
              vertTouchDrag: false,
            },
          });
        } catch {}

        const initialCalc = computeChartSlTpDragPrice({
          symbol: pos.symbol,
          side: pos.side,
          entryPrice: pos.entryPrice,
          currentReferencePrice: pos.side === 'BUY' ? displayBidRef.current : displayAskRef.current,
          lots: pos.volume,
          targetType,
          rawPrice: initialPrice,
          existingSl: pos.stopLoss,
          existingTp: pos.takeProfit,
          isOpenPosition: true,
        });

        const startState: ActiveSlTpDragState = {
          orderId: pos.id,
          targetType,
          price: initialCalc.clampedPrice,
          riskUsd: initialCalc.riskUsd,
          rewardUsd: initialCalc.rewardUsd,
          rrRatio: initialCalc.rrRatio,
        };
        dragStateRef.current = startState;
        setDragState(startState);

        let latestClientY = e.clientY;
        let finished = false;

        const applyDragAtY = (clientY: number) => {
          const rect = container.getBoundingClientRect();
          const y = Math.max(12, Math.min(rect.height - 20, clientY - rect.top));
          const rawCoordPrice = series.coordinateToPrice(y);
          if (rawCoordPrice === null || !Number.isFinite(Number(rawCoordPrice))) return;

          const computed = computeChartSlTpDragPrice({
            symbol: pos.symbol,
            side: pos.side,
            entryPrice: pos.entryPrice,
            currentReferencePrice: pos.side === 'BUY' ? displayBidRef.current : displayAskRef.current,
            lots: pos.volume,
            targetType,
            rawPrice: Number(rawCoordPrice),
            existingSl: pos.stopLoss,
            existingTp: pos.takeProfit,
            isOpenPosition: true,
          });

          const nextDrag: ActiveSlTpDragState = {
            orderId: pos.id,
            targetType,
            price: computed.clampedPrice,
            riskUsd: computed.riskUsd,
            rewardUsd: computed.rewardUsd,
            rrRatio: computed.rrRatio,
          };
          dragStateRef.current = nextDrag;

          // Immediately sync Lightweight Charts horizontal price line at native refresh rate
          const linePair = openSlTpLinesRef.current.get(pos.id);
          if (linePair) {
            try {
              if (targetType === 'sl' && linePair.slLine) {
                linePair.slLine.applyOptions({
                  price: computed.clampedPrice,
                  title: '',
                });
              } else if (targetType === 'tp' && linePair.tpLine) {
                linePair.tpLine.applyOptions({
                  price: computed.clampedPrice,
                  title: '',
                });
              }
            } catch {}
          }
          setDragState(nextDrag);
        };

        const handlePointerMove = (moveEvt: PointerEvent) => {
          if (finished) return;
          latestClientY = moveEvt.clientY;
          if (dragRafRef.current !== null) return;
          dragRafRef.current = window.requestAnimationFrame(() => {
            dragRafRef.current = null;
            if (!finished) {
              applyDragAtY(latestClientY);
            }
          });
        };

        const handlePointerUp = () => {
          if (finished) return;
          finished = true;
          if (dragRafRef.current !== null) {
            window.cancelAnimationFrame(dragRafRef.current);
            dragRafRef.current = null;
            applyDragAtY(latestClientY);
          }
          try {
            if (captureEl?.hasPointerCapture?.(pointerId)) {
              captureEl.releasePointerCapture(pointerId);
            }
          } catch {}
          window.removeEventListener('pointermove', handlePointerMove);
          window.removeEventListener('pointerup', handlePointerUp);
          window.removeEventListener('pointercancel', handlePointerUp);
          syncPriceInteractionOptions(barsRef.current.length);

          const finalDrag = dragStateRef.current;
          dragStateRef.current = null;

          if (finalDrag && finalDrag.price > 0) {
            const nextSl = finalDrag.targetType === 'sl' ? finalDrag.price : pos.stopLoss;
            const nextTp = finalDrag.targetType === 'tp' ? finalDrag.price : pos.takeProfit;
            // Hold optimistic position synchronously to avoid 1-frame snap-back flicker on drop
            optimisticSlTpRef.current.set(pos.id, {
              sl: nextSl,
              tp: nextTp,
              expiresAt: Date.now() + 900,
            });
            onModifyPositionSlTp(pos.id, nextSl, nextTp);
          }
          setDragState(null);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
      },
      [onModifyPositionSlTp, syncPriceInteractionOptions]
    );

    const handleQuickAddSlOrTp = useCallback(
      (pos: TradeOrderRecord, targetType: 'sl' | 'tp') => {
        if (!onModifyPositionSlTp) return;
        const currentPrice = pos.side === 'BUY' ? displayBidRef.current : displayAskRef.current;
        const quick = computeDefaultQuickSlTpForPosition({
          symbol: pos.symbol,
          side: pos.side,
          entryPrice: pos.entryPrice,
          currentPrice,
          lots: pos.volume,
          existingSl: pos.stopLoss,
          existingTp: pos.takeProfit,
          targetType,
          defaultRiskUsd: 25,
        });

        let nextSl = quick.nextSl;
        let nextTp = quick.nextTp;

        // Ensure quick +SL / +TP lands comfortably inside the visible chart price scale
        const series = mainSeriesRef.current;
        const container = chartContainerRef.current;
        if (series && container) {
          const h = container.clientHeight || 380;
          const refCoord = series.priceToCoordinate(currentPrice);
          const baseY =
            refCoord !== null && Number.isFinite(Number(refCoord))
              ? Math.max(90, Math.min(h - 90, Number(refCoord)))
              : Math.round(h * 0.5);

          if (targetType === 'sl') {
            const slCoord = series.priceToCoordinate(nextSl);
            if (slCoord === null || Number(slCoord) < 56 || Number(slCoord) > h - 52) {
              const targetY = pos.side === 'BUY' ? Math.min(h - 56, baseY + 54) : Math.max(56, baseY - 54);
              const visPrice = series.coordinateToPrice(targetY);
              if (visPrice !== null && Number.isFinite(Number(visPrice)) && Number(visPrice) > 0) {
                const dragged = computeChartSlTpDragPrice({
                  symbol: pos.symbol,
                  side: pos.side,
                  entryPrice: pos.entryPrice,
                  currentReferencePrice: currentPrice,
                  lots: pos.volume,
                  targetType: 'sl',
                  rawPrice: Number(visPrice),
                  existingSl: pos.stopLoss,
                  existingTp: pos.takeProfit,
                });
                if (dragged.clampedPrice > 0) nextSl = dragged.clampedPrice;
              }
            }
          } else {
            const tpCoord = series.priceToCoordinate(nextTp);
            if (tpCoord === null || Number(tpCoord) < 56 || Number(tpCoord) > h - 52) {
              const targetY = pos.side === 'BUY' ? Math.max(56, baseY - 62) : Math.min(h - 56, baseY + 62);
              const visPrice = series.coordinateToPrice(targetY);
              if (visPrice !== null && Number.isFinite(Number(visPrice)) && Number(visPrice) > 0) {
                const dragged = computeChartSlTpDragPrice({
                  symbol: pos.symbol,
                  side: pos.side,
                  entryPrice: pos.entryPrice,
                  currentReferencePrice: currentPrice,
                  lots: pos.volume,
                  targetType: 'tp',
                  rawPrice: Number(visPrice),
                  existingSl: pos.stopLoss,
                  existingTp: pos.takeProfit,
                });
                if (dragged.clampedPrice > 0) nextTp = dragged.clampedPrice;
              }
            }
          }
        }

        onModifyPositionSlTp(pos.id, nextSl, nextTp);
      },
      [onModifyPositionSlTp]
    );

    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const series = mainSeriesRef.current;
      const container = chartContainerRef.current;
      if (!series || !container) return;
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const x = e.clientX - rect.left;
      const rawPrice = series.coordinateToPrice(y);
      if (rawPrice === null || !Number.isFinite(Number(rawPrice)) || Number(rawPrice) <= 0) {
        return;
      }
      setContextMenu({
        x: Math.min(x, Math.max(16, rect.width - 240)),
        y: Math.min(y, Math.max(16, rect.height - 230)),
        price: roundPrice(Number(rawPrice), symbol),
      });
    };

    const activeBar = legendBar || barsRef.current[barsRef.current.length - 1] || null;
    const isBullBar = activeBar ? activeBar.close >= activeBar.open : true;
    const barDiff = activeBar ? activeBar.close - activeBar.open : 0;
    const barDiffPct =
      activeBar && activeBar.open > 0 ? (barDiff / activeBar.open) * 100 : 0;

    const activeIndicatorValues = useMemo(() => {
      if (!activeBar) {
        return { ema20: null, ema50: null, vwap: null, bb: null };
      }
      const t = activeBar.time;
      const resolveVal = <T,>(m: Map<number, T>): T | null => {
        if (m.has(t)) return m.get(t)!;
        let latestVal: T | null = null;
        m.forEach((v) => {
          latestVal = v;
        });
        return latestVal;
      };
      return {
        ema20: resolveVal(ema20MapRef.current),
        ema50: resolveVal(ema50MapRef.current),
        vwap: resolveVal(vwapMapRef.current),
        bb: resolveVal(bbMapRef.current),
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeBar, coordTick, showEma, showVwap, showBollinger]);

    const computedCountdown =
      candleCountdown || formatCandleCountdown(Date.now(), timeframeSeconds);

    const symbolOpenPositions = useMemo(
      () => openPositions.filter((p) => p.symbol === symbol),
      [openPositions, symbol]
    );
    const symbolPendingOrders = useMemo(
      () => pendingOrders.filter((o) => o.symbol === symbol),
      [pendingOrders, symbol]
    );
    const primaryOpenPosition = symbolOpenPositions[0] || null;

    const pendingOrderPreview = contextMenu
      ? {
          buyType: resolveChartPriceOrderType('BUY', contextMenu.price, displayBid, displayAsk),
          sellType: resolveChartPriceOrderType('SELL', contextMenu.price, displayBid, displayAsk),
          slPreview: primaryOpenPosition
            ? computeChartSlTpDragPrice({
                symbol,
                side: primaryOpenPosition.side,
                entryPrice: primaryOpenPosition.entryPrice,
                currentReferencePrice: primaryOpenPosition.side === 'BUY' ? displayBid : displayAsk,
                lots: primaryOpenPosition.volume,
                targetType: 'sl',
                rawPrice: contextMenu.price,
                existingSl: primaryOpenPosition.stopLoss,
                existingTp: primaryOpenPosition.takeProfit,
              })
            : null,
          tpPreview: primaryOpenPosition
            ? computeChartSlTpDragPrice({
                symbol,
                side: primaryOpenPosition.side,
                entryPrice: primaryOpenPosition.entryPrice,
                currentReferencePrice: primaryOpenPosition.side === 'BUY' ? displayBid : displayAsk,
                lots: primaryOpenPosition.volume,
                targetType: 'tp',
                rawPrice: contextMenu.price,
                existingSl: primaryOpenPosition.stopLoss,
                existingTp: primaryOpenPosition.takeProfit,
              })
            : null,
        }
      : null;

    // Compute Y coordinates for on-chart position & SL/TP badges and right-axis live price + countdown badge
    const chartOverlayItems = useMemo(() => {
      const series = mainSeriesRef.current;
      const container = chartContainerRef.current;
      const height = container?.clientHeight || 380;
      const nowMs = Date.now();
      const clampY = (rawCoord: number | null, fallbackY: number): number => {
        if (rawCoord === null || !Number.isFinite(Number(rawCoord))) return fallbackY;
        return Math.max(28, Math.min(height - 28, Math.round(Number(rawCoord))));
      };

      return symbolOpenPositions.map((pos, idx) => {
        const opt = optimisticSlTpRef.current.get(pos.id);
        let optSl: number | undefined;
        let optTp: number | undefined;
        if (opt) {
          const synced =
            (opt.sl === undefined || Math.abs(pos.stopLoss - opt.sl) < 1e-6) &&
            (opt.tp === undefined || Math.abs(pos.takeProfit - opt.tp) < 1e-6);
          if (synced || opt.expiresAt < nowMs) {
            optimisticSlTpRef.current.delete(pos.id);
          } else {
            optSl = opt.sl;
            optTp = opt.tp;
          }
        }

        const isDraggingSl = dragState?.orderId === pos.id && dragState.targetType === 'sl';
        const isDraggingTp = dragState?.orderId === pos.id && dragState.targetType === 'tp';

        const effectiveSl = isDraggingSl
          ? dragState.price
          : optSl !== undefined
          ? optSl
          : pos.stopLoss;
        const effectiveTp = isDraggingTp
          ? dragState.price
          : optTp !== undefined
          ? optTp
          : pos.takeProfit;

        const entryCoord = series ? series.priceToCoordinate(pos.entryPrice) : null;
        const slCoord = series && effectiveSl > 0 ? series.priceToCoordinate(effectiveSl) : null;
        const tpCoord = series && effectiveTp > 0 ? series.priceToCoordinate(effectiveTp) : null;

        const pnl = calculatePositionPnl(
          pos.symbol,
          pos.side,
          pos.volume,
          pos.entryPrice,
          pos.side === 'BUY' ? displayBid : displayAsk
        );
        const preview = validateAndComputeSlTpPreview({
          symbol: pos.symbol,
          side: pos.side,
          referencePrice: pos.entryPrice,
          liveBid: displayBid,
          liveAsk: displayAsk,
          isOpenPosition: true,
          volume: pos.volume,
          stopLoss: effectiveSl > 0 ? effectiveSl : undefined,
          takeProfit: effectiveTp > 0 ? effectiveTp : undefined,
          allowAutoClamp: true,
        });
        const slDiffSigned =
          effectiveSl > 0
            ? pos.side === 'BUY'
              ? effectiveSl - pos.entryPrice
              : pos.entryPrice - effectiveSl
            : 0;
        const isSlLockedProfit = effectiveSl > 0 && slDiffSigned >= 0;
        const slSignedUsd =
          effectiveSl > 0
            ? Math.round(slDiffSigned * spec.contractSize * pos.volume * 100) / 100
            : null;
        const bePresets = computeSlTpPresets({
          symbol: pos.symbol,
          side: pos.side,
          volume: pos.volume,
          entryPrice: pos.entryPrice,
          liveBid: displayBid,
          liveAsk: displayAsk,
          currentSl: effectiveSl > 0 ? effectiveSl : undefined,
          isOpenPosition: true,
        });
        const breakevenPrice = bePresets.breakevenSl;
        const showBreakevenBtn =
          breakevenPrice !== null &&
          (effectiveSl <= 0 ||
            (pos.side === 'BUY' ? effectiveSl < breakevenPrice - minMove : effectiveSl > breakevenPrice + minMove));

        const entryY = clampY(entryCoord, 82 + idx * 34);
        let slY = effectiveSl > 0 ? clampY(slCoord, entryY + (pos.side === 'BUY' ? 38 : -38)) : null;
        let tpY = effectiveTp > 0 ? clampY(tpCoord, entryY + (pos.side === 'BUY' ? -38 : 38)) : null;

        // Only separate resting labels; never jump an actively dragged SL/TP handle off the cursor
        if (!isDraggingSl && !isDraggingTp) {
          if (slY !== null && Math.abs(slY - entryY) < 26) {
            slY = Math.max(30, Math.min(height - 30, entryY + (pos.side === 'BUY' ? 28 : -28)));
          }
          if (tpY !== null && Math.abs(tpY - entryY) < 26) {
            tpY = Math.max(30, Math.min(height - 30, entryY + (pos.side === 'BUY' ? -28 : 28)));
          }
          if (slY !== null && tpY !== null && Math.abs(slY - tpY) < 26) {
            tpY = Math.max(30, Math.min(height - 30, slY + (pos.side === 'BUY' ? -28 : 28)));
          }
        }

        return {
          pos,
          pnlUsd: pnl.netPnl,
          effectiveSl,
          effectiveTp,
          riskUsd:
            isDraggingSl && dragState.riskUsd !== null
              ? dragState.riskUsd
              : preview.riskUsd,
          rewardUsd:
            isDraggingTp && dragState.rewardUsd !== null
              ? dragState.rewardUsd
              : preview.rewardUsd,
          rrRatio: isDraggingSl || isDraggingTp ? dragState?.rrRatio ?? preview.rrRatio : preview.rrRatio,
          isSlLockedProfit,
          slSignedUsd,
          breakevenPrice,
          showBreakevenBtn,
          entryY,
          slY,
          tpY,
        };
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbolOpenPositions, dragState, displayBid, displayAsk, coordTick, minMove, spec.contractSize]);

    const latestSeriesBar = barsRef.current[barsRef.current.length - 1] || activeBar;
    const liveTagPrice =
      !isPropStaticSeed && displayBid > 0
        ? displayBid
        : latestSeriesBar
        ? latestSeriesBar.close
        : displayBid;
    const isLatestBull = latestSeriesBar
      ? liveTagPrice >= latestSeriesBar.open
      : true;

    // Right Price Axis Live Price + Countdown Badge Y-coordinate (TradingView signature price + timer badge)
    const livePriceAxisY = useMemo(() => {
      const series = mainSeriesRef.current;
      const container = chartContainerRef.current;
      if (!series || !container || (!latestSeriesBar && liveTagPrice <= 0)) return null;
      const rawCoord = series.priceToCoordinate(liveTagPrice);
      if (rawCoord === null || !Number.isFinite(Number(rawCoord))) return null;
      const h = container.clientHeight || 380;
      const y = Number(rawCoord);
      return Math.max(18, Math.min(h - 32, Math.round(y)));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latestSeriesBar, liveTagPrice, coordTick]);

    const pillHorizontalClass = 'right-[84px] sm:right-[92px]';

    return (
      <div
        ref={wrapperRef}
        data-testid="trading-terminal-chart"
        data-no-global-processing="true"
        data-symbol={symbol}
        data-timeframe={timeframeLabel}
        data-chart-type={activeChartType}
        data-market-open={marketStatus.isOpen ? 'true' : 'false'}
        data-ws-status={wsStatus}
        data-bar-count={String(barsRef.current.length)}
        data-last-bar-time={latestSeriesBar ? String(latestSeriesBar.time) : '0'}
        data-expected-bucket-time={String(
          Math.floor(Date.now() / 1000 / Math.max(1, timeframeSeconds)) *
            Math.max(1, timeframeSeconds)
        )}
        data-last-bar-close={latestSeriesBar ? latestSeriesBar.close.toFixed(spec.decimals) : ''}
        data-live-bid={displayBid.toFixed(spec.decimals)}
        data-live-ask={displayAsk.toFixed(spec.decimals)}
        data-focused-price={lastFocusPrice.toFixed(spec.decimals)}
        data-open-positions-count={String(symbolOpenPositions.length)}
        onClick={() => contextMenu && setContextMenu(null)}
        onContextMenu={handleContextMenu}
        className={`relative w-full h-full min-h-[260px] bg-[#131722] select-none overflow-hidden flex ${
          drawingHLineMode ? 'cursor-crosshair' : ''
        }`}
      >
        {/* TradingView Left Vertical Drawing & Scale Sidebar (Desktop sm+) */}
        {showDrawingToolbar && (
          <div
            data-testid="chart-tv-left-toolbar"
            className="hidden sm:flex w-8 shrink-0 bg-[#131722] border-r border-[#2A2E39] flex-col items-center py-2 gap-1.5 z-20"
          >
            <button
              type="button"
              onClick={() => setCrosshairMagnet(false)}
              title="Normal Crosshair"
              className={`p-1.5 rounded-[4px] transition-colors cursor-pointer ${
                !crosshairMagnet && !drawingHLineMode
                  ? 'bg-[#2962FF]/20 text-[#2962FF]'
                  : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setCrosshairMagnet((v) => !v)}
              title="Magnet Mode Crosshair (Snaps to OHLC)"
              className={`p-1.5 rounded-[4px] transition-colors cursor-pointer ${
                crosshairMagnet
                  ? 'bg-[#2962FF]/20 text-[#2962FF]'
                  : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
              }`}
            >
              <Magnet className="w-3.5 h-3.5" />
            </button>

            <div className="w-4 h-px bg-[#2A2E39] my-0.5" />

            <button
              type="button"
              data-testid="chart-draw-hline-btn"
              onClick={() => setDrawingHLineMode((v) => !v)}
              title="Draw Horizontal Price Line (Click chart to place)"
              className={`p-1.5 rounded-[4px] transition-colors cursor-pointer ${
                drawingHLineMode
                  ? 'bg-[#2962FF] text-white'
                  : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
              }`}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            {drawnPriceLevels.length > 0 && (
              <button
                type="button"
                onClick={() => setDrawnPriceLevels([])}
                title="Clear Drawn Price Lines"
                className="p-1.5 rounded-[4px] text-[#F23645] hover:bg-[#F23645]/15 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="w-4 h-px bg-[#2A2E39] my-0.5" />

            <button
              type="button"
              onClick={() => setIsLogScale((v) => !v)}
              title="Toggle Logarithmic Scale (Log)"
              className={`px-1 py-0.5 rounded-[4px] text-[9px] font-bold transition-colors cursor-pointer ${
                isLogScale
                  ? 'bg-[#2962FF]/25 text-[#2962FF]'
                  : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
              }`}
            >
              LOG
            </button>

            <button
              type="button"
              onClick={() => focusChartOnCurrentPrice(barsRef.current.length)}
              title="Reset Chart View & Auto-Fit to Live Price"
              className="p-1.5 rounded-[4px] text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D] transition-colors cursor-pointer mt-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main TradingView Lightweight Charts Column (Docked Top Controls + Canvas Area) */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Compact TradingView Chart Top Series & Indicator Bar (Zero canvas overlap on mobile & desktop) */}
          <div className="shrink-0 bg-[#131722] border-b border-[#2A2E39] px-2 py-1 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#D1D4DC] whitespace-nowrap shrink-0">
              <span>{spec.shortName}</span>
              <span className="text-[#787B86]">·</span>
              <span>{timeframeLabel}</span>
              <span className="hidden sm:inline-block text-[10px] font-semibold px-1.5 py-0.2 rounded bg-[#1E222D] border border-[#2A2E39] text-[#B2B5BE]">
                {exchangeBadge}
              </span>
              <span
                data-testid="chart-market-status-dot"
                className={`inline-flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap ${
                  !marketStatus.isOpen
                    ? 'text-[#F23645]'
                    : wsStatus === 'connected'
                    ? 'text-[#089981]'
                    : 'text-[#F59E0B]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    !marketStatus.isOpen
                      ? 'bg-[#F23645]'
                      : wsStatus === 'connected'
                      ? 'bg-[#089981]'
                      : 'bg-[#F59E0B]'
                  }`}
                />
                <span className="hidden md:inline">
                  {!marketStatus.isOpen
                    ? 'Closed'
                    : marketStatus.sessionLabel === '24/7 LIVE'
                    ? `24/7 · ${wsSourceLabel}`
                    : wsSourceLabel}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-[5px] bg-[#1E222D] border border-[#2A2E39] shrink-0 whitespace-nowrap">
              <select
                aria-label="Chart Type"
                value={activeChartType}
                onChange={(e) => handleChartTypeSelect(e.target.value as ChartTypeMode)}
                className="bg-transparent text-[11px] font-semibold text-[#D1D4DC] outline-none cursor-pointer pr-1"
              >
                {CHART_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-[#1E222D] text-[#D1D4DC]">
                    {opt.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setShowEma((v) => !v)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  showEma ? 'bg-[#2962FF]/25 text-[#4E8FFF]' : 'text-[#787B86] hover:text-[#D1D4DC]'
                }`}
              >
                EMA
              </button>
              <button
                type="button"
                onClick={() => setShowVwap((v) => !v)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  showVwap ? 'bg-[#E040FB]/25 text-[#E040FB]' : 'text-[#787B86] hover:text-[#D1D4DC]'
                }`}
              >
                VWAP
              </button>
              <button
                type="button"
                onClick={() => setShowBollinger((v) => !v)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  showBollinger
                    ? 'bg-[#2196F3]/25 text-[#64B5F6]'
                    : 'text-[#787B86] hover:text-[#D1D4DC]'
                }`}
              >
                BB
              </button>
              <button
                type="button"
                onClick={() => setShowVolume((v) => !v)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  showVolume ? 'bg-[#089981]/25 text-[#089981]' : 'text-[#787B86] hover:text-[#D1D4DC]'
                }`}
              >
                VOL
              </button>
              <button
                type="button"
                data-testid="chart-autoscale-btn"
                aria-label="Toggle price auto scale"
                onClick={() => {
                  if (barsRef.current.length === 0 || isUserTouchingChartRef.current) return;
                  const next = !isAutoScale;
                  setIsAutoScale(next);
                  try {
                    chartRef.current?.priceScale('right').applyOptions({ autoScale: next });
                  } catch {}
                  scheduleCoordTick();
                }}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  isAutoScale
                    ? 'bg-[#2962FF]/25 text-[#4E8FFF]'
                    : 'text-[#787B86] hover:text-[#D1D4DC]'
                }`}
                title="Toggle Auto Price Scaling (drag price axis vertically anytime)"
              >
                Auto
              </button>
              <button
                type="button"
                data-testid="chart-focus-current-price-btn"
                aria-label="Go to current price"
                onClick={() => focusChartOnCurrentPrice(barsRef.current.length)}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-[#28D6B0] hover:bg-[#28D6B0]/15 cursor-pointer transition-colors whitespace-nowrap"
                title="Redirect to Current Live Price"
              >
                Live →
              </button>
              <button
                type="button"
                aria-label="Fit chart content"
                onClick={() => focusChartOnCurrentPrice(barsRef.current.length)}
                className="p-1 rounded text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#2A2E39] cursor-pointer shrink-0"
                title="Reset & Focus Current Price"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="relative flex-1 min-h-0 overflow-hidden">
          {/* TradingView Subtle Centered Canvas Watermark */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center z-[1] select-none opacity-[0.045]">
            <div className="text-3xl sm:text-5xl font-black tracking-tight text-[#D1D4DC] uppercase">
              {symbol} · {timeframeLabel}
            </div>
            <div className="text-xs sm:text-base font-bold tracking-widest text-[#D1D4DC] uppercase mt-1">
              {spec.name} · {exchangeBadge}
            </div>
          </div>

          {/* TradingView Lightweight Charts Canvas Container */}
          <div ref={chartContainerRef} className="w-full h-full relative z-[2] touch-none" />

          {/* TradingView Authentic Top-Left OHLC Legend + Quick Buttons */}
          <div className="pointer-events-none absolute top-1.5 left-2.5 right-[84px] z-10 flex flex-col gap-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[#D1D4DC]">
              {activeBar && (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] sm:text-[11px] font-mono tabular-nums">
                  <span className="text-[#787B86]">
                    O<span className={`ml-0.5 ${isBullBar ? 'text-[#089981]' : 'text-[#F23645]'}`}>{activeBar.open.toFixed(spec.decimals)}</span>
                  </span>
                  <span className="text-[#787B86]">
                    H<span className={`ml-0.5 ${isBullBar ? 'text-[#089981]' : 'text-[#F23645]'}`}>{activeBar.high.toFixed(spec.decimals)}</span>
                  </span>
                  <span className="text-[#787B86]">
                    L<span className={`ml-0.5 ${isBullBar ? 'text-[#089981]' : 'text-[#F23645]'}`}>{activeBar.low.toFixed(spec.decimals)}</span>
                  </span>
                  <span className="text-[#787B86]">
                    C<span className={`ml-0.5 ${isBullBar ? 'text-[#089981]' : 'text-[#F23645]'}`}>{activeBar.close.toFixed(spec.decimals)}</span>
                  </span>
                  <span className={`font-semibold ${isBullBar ? 'text-[#089981]' : 'text-[#F23645]'}`}>
                    {barDiff >= 0 ? '+' : ''}
                    {barDiff.toFixed(spec.decimals)} ({barDiffPct >= 0 ? '+' : ''}
                    {barDiffPct.toFixed(2)}%)
                  </span>
                </div>
              )}

              {isLoadingHistory && (
                <span className="text-[10px] font-semibold text-[#2962FF] animate-pulse">
                  Loading Exchange OHLCV...
                </span>
              )}
            </div>

            <div className="pointer-events-auto flex items-center gap-1.5">
              {onExecuteMarketOrder && (
                <div className="hidden md:inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onExecuteMarketOrder('SELL', symbol)}
                    className="px-1.5 py-0.5 rounded-[3px] bg-[#F23645]/15 hover:bg-[#F23645] border border-[#F23645]/60 text-[#F23645] hover:text-white text-[10px] font-mono font-bold tabular-nums transition-colors cursor-pointer"
                    title="Instant Market SELL"
                  >
                    {displayBid.toFixed(spec.decimals)} SELL
                  </button>
                  <span className="text-[9.5px] font-mono text-[#787B86] tabular-nums px-0.5">
                    {Math.abs(displayAsk - displayBid).toFixed(spec.decimals)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onExecuteMarketOrder('BUY', symbol)}
                    className="px-1.5 py-0.5 rounded-[3px] bg-[#2962FF]/15 hover:bg-[#2962FF] border border-[#2962FF]/60 text-[#4E8FFF] hover:text-white text-[10px] font-mono font-bold tabular-nums transition-colors cursor-pointer"
                    title="Instant Market BUY"
                  >
                    BUY {displayAsk.toFixed(spec.decimals)}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setLegendCollapsed((v) => !v)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[3px] bg-[#1E222D]/90 border border-[#2A2E39] text-[10px] font-medium text-[#9598A1] hover:text-[#D1D4DC] cursor-pointer"
                title="Toggle TradingView Indicator Legend"
              >
                {legendCollapsed ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                <span>Indicators</span>
              </button>
            </div>

            {!legendCollapsed && (
              <div className="pointer-events-auto flex flex-col gap-0.5 text-[10px] font-mono">
                <div className="inline-flex items-center gap-1.5 text-[#9598A1]">
                  <button
                    type="button"
                    onClick={() => setShowVolume((v) => !v)}
                    className="text-[#787B86] hover:text-[#D1D4DC] cursor-pointer"
                    title="Toggle Volume Histogram"
                  >
                    {showVolume ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </button>
                  <span>Vol</span>
                  {showVolume && activeBar && (
                    <span className={isBullBar ? 'text-[#089981]' : 'text-[#F23645]'}>
                      {Math.round(activeBar.volume).toLocaleString()}
                    </span>
                  )}
                </div>

                {showEma && (
                  <div className="inline-flex items-center gap-2 text-[#9598A1]">
                    <button
                      type="button"
                      onClick={() => setShowEma(false)}
                      className="text-[#787B86] hover:text-[#D1D4DC] cursor-pointer"
                      title="Hide EMA 20 / 50"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    <span>
                      EMA 20{' '}
                      <strong className="text-[#2962FF]">
                        {activeIndicatorValues.ema20 !== null
                          ? activeIndicatorValues.ema20.toFixed(spec.decimals)
                          : '—'}
                      </strong>
                    </span>
                    <span>
                      EMA 50{' '}
                      <strong className="text-[#FF9800]">
                        {activeIndicatorValues.ema50 !== null
                          ? activeIndicatorValues.ema50.toFixed(spec.decimals)
                          : '—'}
                      </strong>
                    </span>
                  </div>
                )}

                {showVwap && (
                  <div className="inline-flex items-center gap-1.5 text-[#9598A1]">
                    <button
                      type="button"
                      onClick={() => setShowVwap(false)}
                      className="text-[#787B86] hover:text-[#D1D4DC] cursor-pointer"
                      title="Hide Session VWAP"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    <span>
                      VWAP{' '}
                      <strong className="text-[#E040FB]">
                        {activeIndicatorValues.vwap !== null
                          ? activeIndicatorValues.vwap.toFixed(spec.decimals)
                          : '—'}
                      </strong>
                    </span>
                  </div>
                )}

                {showBollinger && (
                  <div className="inline-flex items-center gap-1.5 text-[#9598A1]">
                    <button
                      type="button"
                      onClick={() => setShowBollinger(false)}
                      className="text-[#787B86] hover:text-[#D1D4DC] cursor-pointer"
                      title="Hide Bollinger Bands"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    <span>BB 20 2</span>
                    {activeIndicatorValues.bb && (
                      <>
                        <span className="text-[#FF6D00]">
                          {activeIndicatorValues.bb.middle.toFixed(spec.decimals)}
                        </span>
                        <span className="text-[#2196F3]">
                          {activeIndicatorValues.bb.upper.toFixed(spec.decimals)}
                        </span>
                        <span className="text-[#2196F3]">
                          {activeIndicatorValues.bb.lower.toFixed(spec.decimals)}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* TradingView Right Price Axis Live Price + Candle Countdown Badge (Live Price on top, Timer directly below) */}
          {latestSeriesBar && livePriceAxisY !== null && (
            <div
              data-testid="chart-axis-live-price-tag"
              style={{
                top: 0,
                transform: `translate3d(0, ${livePriceAxisY}px, 0) translateY(-50%)`,
              }}
              className={`pointer-events-none apex-chart-overlay-pill absolute right-0 z-20 flex flex-col items-end justify-center px-1.5 py-0.5 rounded-l-[3px] font-mono leading-tight shadow-md ${
                !marketStatus.isOpen
                  ? 'bg-[#363A45] text-[#D1D4DC]'
                  : isLatestBull
                  ? 'bg-[#089981] text-white'
                  : 'bg-[#F23645] text-white'
              }`}
            >
              <span className="text-[10.5px] font-bold tabular-nums">
                {liveTagPrice.toFixed(spec.decimals)}
              </span>
              <span
                data-testid="chart-axis-countdown"
                className="text-[9.5px] font-semibold tabular-nums opacity-95"
              >
                {marketStatus.isOpen ? computedCountdown : 'CLOSED'}
              </span>
            </div>
          )}

          {/* TradingView Floating Bottom-Right "Scroll to Real-Time (»)" Button */}
          <button
            type="button"
            onClick={() => focusChartOnCurrentPrice(barsRef.current.length)}
            title="Scroll to Real-Time Candle"
            className="pointer-events-auto absolute bottom-8 right-[82px] z-20 w-7 h-7 rounded-full bg-[#1E222D]/90 hover:bg-[#2A2E39] border border-[#363A45] text-[#D1D4DC] flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer text-xs font-bold"
          >
            »
          </button>

          {/* Interactive On-Chart Position, Stop Loss (SL), and Take Profit (TP) Overlay Controls */}
          {chartOverlayItems.length > 0 && (
            <div
              data-testid="chart-sltp-overlay-layer"
              className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
            >
              {chartOverlayItems.map((item) => {
                const {
                  pos,
                  pnlUsd,
                  effectiveSl,
                  effectiveTp,
                  riskUsd,
                  rewardUsd,
                  rrRatio,
                  isSlLockedProfit,
                  slSignedUsd,
                  breakevenPrice,
                  showBreakevenBtn,
                  entryY,
                  slY,
                  tpY,
                } = item;
                const isBuy = pos.side === 'BUY';
                const isDraggingSl =
                  dragState?.orderId === pos.id && dragState.targetType === 'sl';
                const isDraggingTp =
                  dragState?.orderId === pos.id && dragState.targetType === 'tp';

                return (
                  <React.Fragment key={pos.id}>
                    {/* 1. Position Entry Line Pill with Quick +SL / +TP / BE / Edit / Close */}
                    <div
                      data-testid={`chart-position-tag-${pos.id}`}
                      style={{
                        top: 0,
                        transform: `translate3d(0, ${entryY}px, 0) translateY(-50%)`,
                      }}
                      className={`pointer-events-auto apex-chart-overlay-pill absolute ${pillHorizontalClass} flex items-center gap-1 rounded-[5px] bg-[#131722]/95 border border-[#2A2E39] shadow-[0_4px_14px_rgba(0,0,0,0.65)] px-1.5 py-0.5 text-[10px] font-mono`}
                    >
                      <span
                        className={`px-1 py-0.2 rounded-[3px] font-extrabold ${
                          isBuy
                            ? 'bg-[#089981]/20 text-[#089981]'
                            : 'bg-[#F23645]/20 text-[#F23645]'
                        }`}
                      >
                        {pos.side} {pos.volume}
                      </span>
                      <span
                        className={`font-bold tabular-nums ${
                          pnlUsd >= 0 ? 'text-[#089981]' : 'text-[#F23645]'
                        }`}
                      >
                        {pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(2)}
                      </span>

                      {onModifyPositionSlTp && effectiveSl <= 0 && (
                        <button
                          type="button"
                          data-testid={`chart-quick-add-sl-${pos.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAddSlOrTp(pos, 'sl');
                          }}
                          title="Add protective Stop Loss (SL) on chart"
                          className="px-1.5 py-0.5 rounded-[3px] bg-[#F23645]/20 hover:bg-[#F23645] text-[#F23645] hover:text-white font-bold transition-colors cursor-pointer"
                        >
                          +SL
                        </button>
                      )}

                      {onModifyPositionSlTp && showBreakevenBtn && breakevenPrice !== null && (
                        <button
                          type="button"
                          data-testid={`chart-quick-be-${pos.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            optimisticSlTpRef.current.set(pos.id, {
                              sl: breakevenPrice,
                              tp: pos.takeProfit,
                              expiresAt: Date.now() + 900,
                            });
                            onModifyPositionSlTp(pos.id, breakevenPrice, pos.takeProfit);
                          }}
                          title="Move Stop Loss to Breakeven (Entry)"
                          className="px-1.5 py-0.5 rounded-[3px] bg-[#2962FF]/20 hover:bg-[#2962FF] text-[#60A5FA] hover:text-white font-bold transition-colors cursor-pointer"
                        >
                          BE
                        </button>
                      )}

                      {onModifyPositionSlTp && effectiveTp <= 0 && (
                        <button
                          type="button"
                          data-testid={`chart-quick-add-tp-${pos.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAddSlOrTp(pos, 'tp');
                          }}
                          title="Add 1:2 Take Profit (TP) on chart"
                          className="px-1.5 py-0.5 rounded-[3px] bg-[#089981]/20 hover:bg-[#089981] text-[#089981] hover:text-white font-bold transition-colors cursor-pointer"
                        >
                          +TP
                        </button>
                      )}

                      {onEditPositionModal && (
                        <button
                          type="button"
                          data-testid={`chart-edit-sltp-${pos.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditPositionModal(pos);
                          }}
                          title="Modify SL / TP modal"
                          className="p-0.5 rounded-[3px] text-[#B2B5BE] hover:text-white hover:bg-[#2A2E39] transition-colors cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                        </button>
                      )}

                      {onClosePosition && (
                        <button
                          type="button"
                          data-testid={`chart-close-pos-${pos.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onClosePosition(pos.id);
                          }}
                          title="Close position at market"
                          className="p-0.5 rounded-[3px] text-[#787B86] hover:text-[#F23645] hover:bg-[#F23645]/15 transition-colors cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* 2. Full-Width SL Horizontal Drag Rail + Draggable SL Handle Pill */}
                    {effectiveSl > 0 && slY !== null && (
                      <>
                        {onModifyPositionSlTp && (
                          <div
                            data-testid={`chart-sl-rail-${pos.id}`}
                            onPointerDown={(e) => startSlTpDrag(e, pos, 'sl', effectiveSl)}
                            style={{
                              top: 0,
                              transform: `translate3d(0, ${slY}px, 0) translateY(-50%)`,
                            }}
                            title="Drag anywhere along line to move Stop Loss"
                            className={`pointer-events-auto touch-none absolute left-0 right-[84px] h-3.5 cursor-ns-resize group ${
                              isDraggingSl
                                ? 'apex-chart-overlay-pill-dragging'
                                : 'apex-chart-overlay-pill'
                            }`}
                          >
                            <div
                              className={`w-full h-[2px] mt-[6px] transition-opacity ${
                                isDraggingSl
                                  ? 'opacity-100 bg-[#F23645] shadow-[0_0_10px_rgba(242,54,69,0.9)]'
                                  : 'opacity-0 group-hover:opacity-75 bg-[#F23645]/80'
                              }`}
                            />
                          </div>
                        )}
                        <div
                          data-testid={`chart-sl-handle-${pos.id}`}
                          data-sl-price={effectiveSl.toFixed(spec.decimals)}
                          style={{
                            top: 0,
                            transform: `translate3d(0, ${slY}px, 0) translateY(-50%)${
                              isDraggingSl ? ' scale(1.03)' : ''
                            }`,
                          }}
                          onPointerDown={(e) => startSlTpDrag(e, pos, 'sl', effectiveSl)}
                          title="Drag vertically to adjust Stop Loss (supports Breakeven & Profit Lock)"
                          className={`pointer-events-auto touch-none absolute ${pillHorizontalClass} flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-mono cursor-ns-resize ${
                            isDraggingSl
                              ? 'apex-chart-overlay-pill-dragging bg-[#F23645] text-white border border-white shadow-[0_0_18px_rgba(242,54,69,0.85)] z-30'
                              : isSlLockedProfit
                              ? 'apex-chart-overlay-pill bg-[#0F211D]/95 text-[#34D399] border border-[#089981]/80 hover:border-[#089981] shadow-[0_4px_12px_rgba(0,0,0,0.65)]'
                              : 'apex-chart-overlay-pill bg-[#1E1418]/95 text-[#FF6B78] border border-[#F23645]/80 hover:border-[#F23645] shadow-[0_4px_12px_rgba(0,0,0,0.65)]'
                          }`}
                        >
                          <GripVertical className="w-3 h-3 opacity-80 shrink-0" />
                          <span className="font-extrabold">SL</span>
                          <span className="tabular-nums font-semibold">
                            {effectiveSl.toFixed(spec.decimals)}
                          </span>
                          {slSignedUsd !== null && Number.isFinite(slSignedUsd) ? (
                            <span
                              className={`tabular-nums font-bold ${
                                isDraggingSl
                                  ? 'text-white'
                                  : isSlLockedProfit
                                  ? 'text-[#34D399]'
                                  : 'text-[#F23645]'
                              }`}
                            >
                              ({slSignedUsd >= 0 ? `+$${slSignedUsd.toFixed(2)}` : `-$${Math.abs(slSignedUsd).toFixed(2)}`})
                            </span>
                          ) : (
                            riskUsd !== null &&
                            Number.isFinite(riskUsd) && (
                              <span
                                className={`tabular-nums font-bold ${
                                  isDraggingSl ? 'text-white' : 'text-[#F23645]'
                                }`}
                              >
                                (-${riskUsd.toFixed(2)})
                              </span>
                            )
                          )}
                          {onModifyPositionSlTp && (
                            <button
                              type="button"
                              data-testid={`chart-clear-sl-${pos.id}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                optimisticSlTpRef.current.set(pos.id, {
                                  sl: 0,
                                  tp: pos.takeProfit,
                                  expiresAt: Date.now() + 900,
                                });
                                onModifyPositionSlTp(pos.id, 0, pos.takeProfit);
                              }}
                              title="Remove Stop Loss"
                              className="ml-0.5 p-0.5 rounded hover:bg-black/25 text-current cursor-pointer"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {/* 3. Full-Width TP Horizontal Drag Rail + Draggable TP Handle Pill */}
                    {effectiveTp > 0 && tpY !== null && (
                      <>
                        {onModifyPositionSlTp && (
                          <div
                            data-testid={`chart-tp-rail-${pos.id}`}
                            onPointerDown={(e) => startSlTpDrag(e, pos, 'tp', effectiveTp)}
                            style={{
                              top: 0,
                              transform: `translate3d(0, ${tpY}px, 0) translateY(-50%)`,
                            }}
                            title="Drag anywhere along line to move Take Profit"
                            className={`pointer-events-auto touch-none absolute left-0 right-[84px] h-3.5 cursor-ns-resize group ${
                              isDraggingTp
                                ? 'apex-chart-overlay-pill-dragging'
                                : 'apex-chart-overlay-pill'
                            }`}
                          >
                            <div
                              className={`w-full h-[2px] mt-[6px] transition-opacity ${
                                isDraggingTp
                                  ? 'opacity-100 bg-[#089981] shadow-[0_0_10px_rgba(8,153,129,0.9)]'
                                  : 'opacity-0 group-hover:opacity-75 bg-[#089981]/80'
                              }`}
                            />
                          </div>
                        )}
                        <div
                          data-testid={`chart-tp-handle-${pos.id}`}
                          data-tp-price={effectiveTp.toFixed(spec.decimals)}
                          style={{
                            top: 0,
                            transform: `translate3d(0, ${tpY}px, 0) translateY(-50%)${
                              isDraggingTp ? ' scale(1.03)' : ''
                            }`,
                          }}
                          onPointerDown={(e) => startSlTpDrag(e, pos, 'tp', effectiveTp)}
                          title="Drag vertically to adjust Take Profit on chart"
                          className={`pointer-events-auto touch-none absolute ${pillHorizontalClass} flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[10px] font-mono cursor-ns-resize ${
                            isDraggingTp
                              ? 'apex-chart-overlay-pill-dragging bg-[#089981] text-white border border-white shadow-[0_0_18px_rgba(8,153,129,0.85)] z-30'
                              : 'apex-chart-overlay-pill bg-[#0F211D]/95 text-[#34D399] border border-[#089981]/80 hover:border-[#089981] shadow-[0_4px_12px_rgba(0,0,0,0.65)]'
                          }`}
                        >
                          <GripVertical className="w-3 h-3 opacity-80 shrink-0" />
                          <span className="font-extrabold">TP</span>
                          <span className="tabular-nums font-semibold">
                            {effectiveTp.toFixed(spec.decimals)}
                          </span>
                          {rewardUsd !== null && Number.isFinite(rewardUsd) && (
                            <span
                              className={`tabular-nums font-bold ${
                                isDraggingTp ? 'text-white' : 'text-[#089981]'
                              }`}
                            >
                              (+${rewardUsd.toFixed(2)}
                              {rrRatio ? ` · 1:${rrRatio.toFixed(1)}` : ''})
                            </span>
                          )}
                          {onModifyPositionSlTp && (
                            <button
                              type="button"
                              data-testid={`chart-clear-tp-${pos.id}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                optimisticSlTpRef.current.set(pos.id, {
                                  sl: pos.stopLoss,
                                  tp: 0,
                                  expiresAt: Date.now() + 900,
                                });
                                onModifyPositionSlTp(pos.id, pos.stopLoss, 0);
                              }}
                              title="Remove Take Profit"
                              className="ml-0.5 p-0.5 rounded hover:bg-black/25 text-current cursor-pointer"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </React.Fragment>
                );
              })}

              {/* Pending order quick cancel badges on chart */}
              {symbolPendingOrders.map((ord) => {
                const series = mainSeriesRef.current;
                const container = chartContainerRef.current;
                const height = container?.clientHeight || 380;
                const rawY = series ? series.priceToCoordinate(ord.entryPrice) : null;
                if (rawY === null || !Number.isFinite(Number(rawY))) return null;
                const y = Math.max(30, Math.min(height - 30, Math.round(Number(rawY))));
                return (
                  <div
                    key={ord.id}
                    data-testid={`chart-pending-tag-${ord.id}`}
                    style={{
                      top: 0,
                      transform: `translate3d(0, ${y}px, 0) translateY(-50%)`,
                    }}
                    className={`pointer-events-auto apex-chart-overlay-pill absolute ${pillHorizontalClass} flex items-center gap-1 rounded-[5px] bg-[#1F1A10]/95 border border-amber-500/60 px-1.5 py-0.5 text-[10px] font-mono text-amber-300 shadow-lg`}
                  >
                    <span className="font-bold">
                      {ord.orderType} {ord.volume}
                    </span>
                    <span className="tabular-nums text-amber-200/80">
                      @ {ord.entryPrice.toFixed(spec.decimals)}
                    </span>
                    {onCancelPendingOrder && (
                      <button
                        type="button"
                        data-testid={`chart-cancel-pending-${ord.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancelPendingOrder(ord.id);
                        }}
                        title="Cancel pending order"
                        className="p-0.5 rounded hover:bg-amber-500/20 text-amber-300 hover:text-white cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Right-Click Chart Price Context Menu (SL/TP on Open Position + Pending Orders & Alerts) */}
          {contextMenu && pendingOrderPreview && (
            <div
              data-testid="chart-context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(e) => e.stopPropagation()}
              className="apex-scale-in absolute z-30 w-60 rounded-[8px] bg-[#1E222D] border border-[#2A2E39] shadow-2xl p-1.5 text-xs"
            >
              <div className="px-2 py-1 text-[10.5px] font-semibold text-[#787B86] border-b border-[#2A2E39] mb-1 tabular-nums flex items-center justify-between">
                <span>Level: {contextMenu.price.toFixed(spec.decimals)}</span>
                {!marketStatus.isOpen && (
                  <span className="text-[10px] font-bold text-[#F23645]">CLOSED</span>
                )}
              </div>

              {primaryOpenPosition && onModifyPositionSlTp && (
                <div className="border-b border-[#2A2E39] pb-1 mb-1 space-y-0.5">
                  <div className="px-2 py-0.5 text-[9.5px] font-mono uppercase tracking-wider text-[#9598A1]">
                    Position #{primaryOpenPosition.id.slice(-4)} ({primaryOpenPosition.side}{' '}
                    {primaryOpenPosition.volume})
                  </div>
                  {pendingOrderPreview.slPreview && (
                    <button
                      type="button"
                      data-testid="chart-ctx-set-sl"
                      onClick={() => {
                        onModifyPositionSlTp(
                          primaryOpenPosition.id,
                          pendingOrderPreview.slPreview!.clampedPrice,
                          primaryOpenPosition.takeProfit
                        );
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-[6px] hover:bg-[#F23645]/15 text-[#FF6B78] font-bold cursor-pointer flex items-center justify-between"
                    >
                      <span>
                        Set SL @ {pendingOrderPreview.slPreview.clampedPrice.toFixed(spec.decimals)}
                      </span>
                      {pendingOrderPreview.slPreview.riskUsd !== null && (
                        <span className="font-mono text-[10.5px]">
                          -${pendingOrderPreview.slPreview.riskUsd.toFixed(2)}
                        </span>
                      )}
                    </button>
                  )}
                  {pendingOrderPreview.tpPreview && (
                    <button
                      type="button"
                      data-testid="chart-ctx-set-tp"
                      onClick={() => {
                        onModifyPositionSlTp(
                          primaryOpenPosition.id,
                          primaryOpenPosition.stopLoss,
                          pendingOrderPreview.tpPreview!.clampedPrice
                        );
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-[6px] hover:bg-[#089981]/15 text-[#34D399] font-bold cursor-pointer flex items-center justify-between"
                    >
                      <span>
                        Set TP @ {pendingOrderPreview.tpPreview.clampedPrice.toFixed(spec.decimals)}
                      </span>
                      {pendingOrderPreview.tpPreview.rewardUsd !== null && (
                        <span className="font-mono text-[10.5px]">
                          +${pendingOrderPreview.tpPreview.rewardUsd.toFixed(2)}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              )}

              {onPlacePendingOrderAtPrice && marketStatus.isOpen && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onPlacePendingOrderAtPrice('BUY', contextMenu.price, symbol);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-[6px] hover:bg-[#089981]/15 text-[#089981] font-bold cursor-pointer"
                  >
                    Place {pendingOrderPreview.buyType} @ {contextMenu.price.toFixed(spec.decimals)}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onPlacePendingOrderAtPrice('SELL', contextMenu.price, symbol);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-[6px] hover:bg-[#F23645]/15 text-[#F23645] font-bold cursor-pointer"
                  >
                    Place {pendingOrderPreview.sellType} @ {contextMenu.price.toFixed(spec.decimals)}
                  </button>
                </>
              )}
              {onPlacePendingOrderAtPrice && !marketStatus.isOpen && (
                <div className="px-2.5 py-1.5 text-[11px] font-medium text-[#787B86]">
                  Market Closed (Sat–Sun). Orders open Sunday 22:00 UTC.
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setDrawnPriceLevels((prev) => [...prev, contextMenu.price]);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-1.5 text-left px-2.5 py-1.5 rounded-[6px] hover:bg-[#2A2E39] text-[#4E8FFF] font-semibold cursor-pointer mt-0.5"
              >
                <Minus className="w-3.5 h-3.5" />
                <span>Draw Horizontal Line @ {contextMenu.price.toFixed(spec.decimals)}</span>
              </button>

              {onQuickCreateAlert && (
                <button
                  type="button"
                  onClick={() => {
                    onQuickCreateAlert(contextMenu.price);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-1.5 text-left px-2.5 py-1.5 rounded-[6px] hover:bg-[#2A2E39] text-[#D1D4DC] font-semibold cursor-pointer mt-0.5"
                >
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                  <span>Add Price Alert</span>
                </button>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    );
  }
);

TradingTerminalChart.displayName = 'TradingTerminalChart';
