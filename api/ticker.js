const BINANCE_TICKER_URL = "https://data-api.binance.vision/api/v3/ticker/24hr";
const INTERVAL = "1h";
const CANDLE_LIMIT = 200;
const MAX_SYMBOLS = 12;

export default async function handler(req, res) {
  try {
    const tickerRes = await fetch(BINANCE_TICKER_URL);
    if (!tickerRes.ok) {
      return sendError(res, 502, `Ticker fetch failed (${tickerRes.status})`);
    }
    const tickers = await tickerRes.json();
    const usdt = tickers
      .filter((s) => typeof s.symbol === "string" && s.symbol.endsWith("USDT"))
      .map((s) => ({
        symbol: s.symbol.replace("USDT", ""),
        pair: s.symbol,
        price: numberOrZero(s.lastPrice),
        change: numberOrZero(s.priceChangePercent),
        quoteVolume: numberOrZero(s.quoteVolume),
        fundFlow: numberOrZero(s.quoteVolume) * (numberOrZero(s.priceChangePercent) / 100),
      }))
      .sort((a, b) => b.quoteVolume - a.quoteVolume)
      .slice(0, MAX_SYMBOLS);

    const enriched = [];
    for (const base of usdt) {
      const candleUrl = `https://data-api.binance.vision/api/v3/klines?symbol=${base.pair}&interval=${INTERVAL}&limit=${CANDLE_LIMIT}`;
      try {
        const candleRes = await fetch(candleUrl);
        if (!candleRes.ok) {
          enriched.push(withError(base, `klines ${candleRes.status}`));
          continue;
        }
        const klines = await candleRes.json();
        if (!Array.isArray(klines) || klines.length === 0) {
          enriched.push(withError(base, "no candles"));
          continue;
        }

        const indicators = computeIndicators(klines);
        if (!indicators.ready) {
          enriched.push({ ...base, ...indicators, signal: buildPendingSignal(indicators.reason) });
          continue;
        }

        const signal = buildSignal(base.price, indicators);
        enriched.push({ ...base, ...indicators, signal });
      } catch (err) {
        enriched.push(withError(base, err.message || "klines fetch error"));
      }
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      ts: Date.now(),
      interval: INTERVAL,
      count: enriched.length,
      data: enriched,
    });
  } catch (err) {
    return sendError(res, 500, err.message || "unhandled error");
  }
}

function computeIndicators(klines) {
  const closes = klines.map((c) => numberOrZero(c[4]));
  const highs = klines.map((c) => numberOrZero(c[2]));
  const lows = klines.map((c) => numberOrZero(c[3]));
  const volumes = klines.map((c) => numberOrZero(c[5]));
  const typicalPrices = klines.map(
    (_, i) => (highs[i] + lows[i] + closes[i]) / 3
  );

  const ema12 = emaLatest(closes, 12);
  const ema48 = emaLatest(closes, 48);
  const ema192 = emaLatest(closes, 192);
  const vwap = computeVWAP(typicalPrices, volumes);

  if ([ema12, ema48, ema192, vwap].some((val) => val === null)) {
    return { ready: false, reason: "Not enough candles to compute EMAs/VWAP" };
  }

  const rsi = computeRSI(closes, 14, 3);
  const macd = computeMACD(closes, 12, 48, 192);

  if (!rsi.ready) {
    return { ready: false, reason: rsi.reason };
  }
  if (!macd.ready) {
    return { ready: false, reason: macd.reason };
  }

  return {
    ready: true,
    ema12,
    ema48,
    ema192,
    vwap,
    rsi: rsi.value,
    rsiSignal: rsi.signal,
    macdLine: macd.macd,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
  };
}

function buildSignal(price, ind) {
  const priceStackBull =
    price > ind.ema12 && price > ind.ema48 && price > ind.ema192 && price > ind.vwap;
  const priceStackBear =
    price < ind.ema12 && price < ind.ema48 && price < ind.ema192 && price < ind.vwap;

  const rsiBull = ind.rsi > ind.rsiSignal && ind.rsi > 55;
  const rsiBear = ind.rsi < ind.rsiSignal && ind.rsi < 45;

  const macdBull = ind.macdHistogram > 0 && ind.macdLine > ind.macdSignal;
  const macdBear = ind.macdHistogram < 0 && ind.macdLine < ind.macdSignal;

  const bullReady = priceStackBull && rsiBull && macdBull;
  const bearReady = priceStackBear && rsiBear && macdBear;

  if (bullReady) {
    return {
      side: "buy",
      label: "馃煝 Strong Buy",
      reasons: [
        "✅ Price stacked above EMA12/48/192 + VWAP",
        "✅ RSI 14 > EMA3 & > 55",
        "✅ MACD histogram positive & line > signal",
      ],
    };
  }

  if (bearReady) {
    return {
      side: "sell",
      label: "馃敶 Strong Sell",
      reasons: [
        "⚠️ Price below EMA12/48/192 & VWAP",
        "⚠️ RSI 14 < EMA3 & < 45",
        "⚠️ MACD histogram negative & line < signal",
      ],
    };
  }

  const blendedReasons = [
    priceStackBull
      ? "馃嚡 Price riding above EMA stack"
      : priceStackBear
      ? "馃敶 Price sinking below EMA stack"
      : "鈿狅笍 Price tangled near EMAs/VWAP",
    rsiBull
      ? "馃憦 RSI momentum > 55 and leading"
      : rsiBear
      ? "馃 RSI momentum < 45 and lagging"
      : "鈿狅笍 RSI undecided",
    macdBull
      ? "馃搳 MACD momentum trending up"
      : macdBear
      ? "馃挧 MACD momentum trending down"
      : "鈿狅笍 MACD flat",
  ];

  const positiveCount = [priceStackBull, rsiBull, macdBull].filter(Boolean).length;
  const negativeCount = [priceStackBear, rsiBear, macdBear].filter(Boolean).length;

  let label = "馃 Neutral";
  if (positiveCount >= 2) label = "馃煛 Watch (Bullish lean)";
  if (negativeCount >= 2) label = "鈿狅笍 Watch (Bearish lean)";

  return {
    side: positiveCount >= 2 ? "watch-bull" : negativeCount >= 2 ? "watch-bear" : "neutral",
    label,
    reasons: blendedReasons,
  };
}

function buildPendingSignal(reason) {
  return {
    side: "neutral",
    label: "鈿狅笍 Waiting for data",
    reasons: [`Indicator pending: ${reason}`],
  };
}

function withError(base, msg) {
  return {
    ...base,
    ema12: null,
    ema48: null,
    ema192: null,
    vwap: null,
    rsi: null,
    rsiSignal: null,
    macdLine: null,
    macdSignal: null,
    macdHistogram: null,
    signal: {
      side: "neutral",
      label: "鈿狅笍 Data error",
      reasons: [`${msg}`],
    },
  };
}

function sendError(res, status, message) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(status).json({ error: message });
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function emaLatest(values, period) {
  const out = emaSeries(values, period);
  return out ? out.latest : null;
}

function emaSeries(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = average(values.slice(0, period));
  const series = [ema];
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    series.push(ema);
  }
  return { series, offset: period - 1, latest: series[series.length - 1] };
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((acc, v) => acc + v, 0) / arr.length;
}

function computeVWAP(typicalPrices, volumes) {
  if (typicalPrices.length !== volumes.length || volumes.length === 0) return null;
  let sumPV = 0;
  let sumVol = 0;
  for (let i = 0; i < volumes.length; i++) {
    sumPV += typicalPrices[i] * volumes[i];
    sumVol += volumes[i];
  }
  if (sumVol === 0) return null;
  return sumPV / sumVol;
}

function computeRSI(closes, period, smoothingPeriod = 3) {
  if (closes.length < period + smoothingPeriod) {
    return { ready: false, reason: "Not enough closes for RSI" };
  }

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum += -change;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  const rsiSeries = [];
  rsiSeries.push(calcRS(avgGain, avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsiSeries.push(calcRS(avgGain, avgLoss));
  }

  const smoothed = emaSeries(rsiSeries, smoothingPeriod);
  if (!smoothed) {
    return {
      ready: false,
      reason: "Not enough RSI points for smoothing",
    };
  }

  return {
    ready: true,
    value: rsiSeries[rsiSeries.length - 1],
    signal: smoothed.latest,
  };
}

function calcRS(avgGain, avgLoss) {
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeMACD(values, fast, slow, signalPeriod) {
  if (values.length < slow + signalPeriod) {
    return { ready: false, reason: "Not enough closes for MACD" };
  }

  const fastEma = emaSeries(values, fast);
  const slowEma = emaSeries(values, slow);
  if (!fastEma || !slowEma) {
    return { ready: false, reason: "EMA series failed" };
  }

  const alignmentOffset = slowEma.offset - fastEma.offset;
  const macdSeries = [];
  for (let i = 0; i < slowEma.series.length; i++) {
    const fastIdx = i + alignmentOffset;
    if (fastIdx >= 0 && fastIdx < fastEma.series.length) {
      macdSeries.push(fastEma.series[fastIdx] - slowEma.series[i]);
    }
  }

  const signalEma = emaSeries(macdSeries, signalPeriod);
  if (!signalEma) {
    return { ready: false, reason: "Not enough MACD points for signal EMA" };
  }

  const macd = macdSeries[macdSeries.length - 1];
  const signal = signalEma.latest;
  const histogram = macd - signal;

  return {
    ready: true,
    macd,
    signal,
    histogram,
  };
}
