import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (for CSS, JS, etc.)
app.use(express.static(path.join(__dirname, "public")));

app.get("/", async (req, res) => {
  try {
    const response = await fetch("http://localhost:3000/api/ticker");
    const data = await response.json();

    let tableRows = data.data
      .map(
        (coin) => `
        <tr class="border-b border-gray-800">
          <td class="p-2 font-semibold">${coin.symbol}</td>
          <td class="p-2">$${coin.price.toLocaleString()}</td>
          <td class="p-2 ${coin.change > 0 ? "text-green-400" : "text-red-400"}">${coin.change}%</td>
          <td class="p-2">$${(coin.quoteVolume / 1e6).toFixed(2)}M</td>
          <td class="p-2 ${coin.fundFlow > 0 ? "text-green-400" : "text-red-400"}">$${(coin.fundFlow / 1e6).toFixed(2)}M</td>
          <td class="p-2">${coin.signal.label}</td>
        </tr>`
      )
      .join("");

    const html = `
    <html>
      <head>
        <title>Fund Flow Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
      </head>
      <body class="bg-gray-900 text-white">
        <div class="p-6">
          <h1 class="text-3xl font-bold mb-6 text-center">📊 Fund Flow Dashboard</h1>
          <table class="w-full text-sm">
            <thead class="bg-gray-800">
              <tr>
                <th class="p-2">Symbol</th>
                <th class="p-2">Price</th>
                <th class="p-2">Change</th>
                <th class="p-2">Volume</th>
                <th class="p-2">Fund Flow</th>
                <th class="p-2">Signal</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </body>
    </html>`;
    res.send(html);
  } catch (err) {
    res.send(`<pre style="color:red;">Error loading data: ${err.message}</pre>`);
  }
});

app.listen(PORT, () => console.log(`🚀 Dashboard running at http://localhost:${PORT}`));
