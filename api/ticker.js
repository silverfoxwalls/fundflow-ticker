// api/ticker.js
const BINANCE_URL = "https://data-api.binance.vision/api/v3/ticker/24hr";

module.exports = async (req, res) => {
  try {
    const r = await fetch(BINANCE_URL, { method: "GET" });
    if (!r.ok) {
      return res.status(502).json({ error: "Failed to fetch Binance data", status: r.status });
    }
    const all = await r.json();
    const usdt = all.filter((s) => typeof s.symbol === "string" && s.symbol.endsWith("USDT"));
    const mapped = usdt.map((c) => {
      const lastPrice = parseFloat(c.lastPrice || "0");
      const changePct = parseFloat(c.priceChangePercent || "0");
      const quoteVol = parseFloat(c.quoteVolume || "0");
      const fundFlow = quoteVol * (changePct / 100);
      return {
        symbol: c.symbol.replace("USDT", ""),
        pair: c.symbol,
        price: +lastPrice.toFixed(8),
        change: +changePct.toFixed(2),
        quoteVolume: +quoteVol.toFixed(2),
        fundFlow: +fundFlow.toFixed(2),
      };
    });
    const top = mapped.sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, 30);
    const result = top.map((t) => ({ ...t, spark: [] }));
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ ts: Date.now(), data: result });
  } catch (err) {
    console.error("ticker error", err);
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(500).json({ error: String(err) });
  }
};
