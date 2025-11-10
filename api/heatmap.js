export default async function handler(req, res) {
  try {
    const symbol = "BTCUSDT";
    const url = `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=100`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const bids = data.bids.slice(0, 50).map(([price, quantity]) => ({
      price: parseFloat(price),
      quantity: parseFloat(quantity),
      total: parseFloat(price) * parseFloat(quantity)
    }));

    const asks = data.asks.slice(0, 50).map(([price, quantity]) => ({
      price: parseFloat(price),
      quantity: parseFloat(quantity),
      total: parseFloat(price) * parseFloat(quantity)
    }));

    res.status(200).json({
      symbol,
      timestamp: Date.now(),
      bids,
      asks,
      currentPrice: bids.length && asks.length
        ? (bids[0].price + asks[0].price) / 2
        : null
    });
  } catch (error) {
    console.error("Heatmap API error:", error);
    res.status(500).json({ error: error.message || "Heatmap fetch failed" });
  }
}
