import crypto from "crypto";

const BASE_URL = "https://fapi.binance.com";

export async function signedFetch(path, method = "GET", params = {}) {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("Binance API credentials missing");
  }

  const timestamp = Date.now();
  const signature = signParams({ ...params, timestamp }, apiSecret);

  const query = new URLSearchParams({ ...params, timestamp, signature }).toString();
  const url = `${BASE_URL}${path}?${query}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": apiKey,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Binance ${method} ${path} failed (${res.status}): ${body}`);
  }

  return res.json();
}

function signParams(params, secret) {
  const query = new URLSearchParams(params).toString();
  return crypto.createHmac("sha256", secret).update(query).digest("hex");
}
