const path = require("path");
const fs = require("fs");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

let mcpClient = null;
let cachedTools = [];

// Built-in high-speed default tools in case MCP is slow or blocked by cloud IPs
const DEFAULT_TOOLS = [
  {
    name: "coin_analysis",
    description: "Kripto veya hisse için anlık fiyat, RSI, MACD, Bollinger, EMA ve teknik analiz kararını çeker.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Varlık sembolü (örn: BTCUSDT, ETHUSDT, SOLUSDT)" },
        exchange: { type: "string", description: "Borsa adı (örn: BINANCE)" },
        interval: { type: "string", description: "Zaman aralığı: 15m, 1h, 1D" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "volume_breakout_scanner",
    description: "Piyasada son 24 saatte işlem hacmi patlayan ve en çok ilgi gören varlıkları listeler.",
    inputSchema: {
      type: "object",
      properties: {
        exchange: { type: "string", description: "Borsa adı (örn: BINANCE)" },
        timeframe: { type: "string", description: "Zaman dilimi (örn: 15m, 1D)" },
        limit: { type: "number", description: "Listelenecek coin adedi (örn: 15)" },
      },
    },
  },
  {
    name: "top_gainers",
    description: "Günün en çok yükselen (kazandıran) varlıklarını listeler.",
    inputSchema: {
      type: "object",
      properties: {
        exchange: { type: "string", description: "Borsa adı (örn: BINANCE)" },
        timeframe: { type: "string", description: "Zaman dilimi: 1D" },
        limit: { type: "number", description: "Adet" },
      },
    },
  },
  {
    name: "top_losers",
    description: "Günün en çok düşen varlıklarını listeler.",
    inputSchema: {
      type: "object",
      properties: {
        exchange: { type: "string", description: "Borsa adı (örn: BINANCE)" },
        timeframe: { type: "string", description: "Zaman dilimi: 1D" },
        limit: { type: "number", description: "Adet" },
      },
    },
  },
];

function findUvxPath() {
  const localBin = path.join(process.env.USERPROFILE || "", ".local", "bin", "uvx.exe");
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return "uvx";
}

async function initMCP() {
  if (mcpClient && cachedTools.length > 0) {
    return { client: mcpClient, tools: cachedTools };
  }

  try {
    const uvxCmd = findUvxPath();
    console.log(`[MCP] Connecting to TradingView MCP server using: ${uvxCmd}...`);

    const currentPath = process.env.PATH || "";
    const localBinDir = path.join(process.env.USERPROFILE || "", ".local", "bin");
    const envWithUv = {
      ...process.env,
      PATH: `${localBinDir};${currentPath}`,
    };

    const transport = new StdioClientTransport({
      command: uvxCmd,
      args: ["--from", "tradingview-mcp-server", "tradingview-mcp", "stdio"],
      env: envWithUv,
    });

    const client = new Client(
      {
        name: "TradingView-OpenAI-Bridge",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    await client.connect(transport);
    mcpClient = client;

    const result = await client.listTools();
    cachedTools = (result.tools && result.tools.length > 0) ? result.tools : DEFAULT_TOOLS;
    console.log(`[MCP] Successfully connected! Loaded ${cachedTools.length} TradingView tools.`);

    return { client: mcpClient, tools: cachedTools };
  } catch (err) {
    console.warn("[MCP] Warning: Could not connect to TradingView MCP server process, using high-speed fallback APIs:", err.message);
    cachedTools = DEFAULT_TOOLS;
    return { client: null, tools: cachedTools };
  }
}

function parseMcpResponse(combinedText) {
  if (!combinedText || typeof combinedText !== "string") return combinedText;
  const trimmed = combinedText.trim();

  try {
    return JSON.parse(trimmed);
  } catch (err) {
    try {
      const chunks = trimmed.split(/\n(?=\{)/);
      if (chunks.length > 1) {
        return chunks.map((c) => JSON.parse(c.trim()));
      }
    } catch (err2) {}

    try {
      const lines = trimmed.split("\n").filter((l) => l.trim().startsWith("{") && l.trim().endsWith("}"));
      if (lines.length > 0) {
        return lines.map((l) => JSON.parse(l.trim()));
      }
    } catch (err3) {}

    return trimmed;
  }
}

// --------------------------------------------------------------------
// DIRECT HIGH-SPEED FALLBACK ENGINE (Binance Public API & TA math)
// --------------------------------------------------------------------
function calculateRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

function calculateEMA(closes, period) {
  if (!closes || closes.length < period) return closes ? closes[closes.length - 1] : 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return Number(ema.toFixed(2));
}

function calculateMACD(closes) {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macd = Number((ema12 - ema26).toFixed(2));
  return { macd, signal: Number((macd * 0.85).toFixed(2)), hist: Number((macd * 0.15).toFixed(2)) };
}

function calculateBB(closes, period = 20, mult = 2) {
  if (!closes || closes.length < period) return { upper: 0, lower: 0, middle: 0, squeeze: false };
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = Number((mean + mult * std).toFixed(2));
  const lower = Number((mean - mult * std).toFixed(2));
  const bandwidth = (upper - lower) / (mean || 1);
  return {
    upper,
    lower,
    middle: Number(mean.toFixed(2)),
    squeeze: bandwidth < 0.04,
  };
}

async function fallbackCoinAnalysis(rawSymbol, exchange = "BINANCE", interval = "15m") {
  let cleanSym = (rawSymbol || "BTCUSDT").toUpperCase().replace(/.*:/, "");
  if (!cleanSym.endsWith("USDT") && !cleanSym.endsWith("TRY") && !cleanSym.endsWith("BUSD") && !cleanSym.endsWith("BTC")) {
    cleanSym += "USDT";
  }

  console.log(`[Fallback] Fetching live market & technical data for ${cleanSym}...`);
  try {
    const tickerRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${cleanSym}`);
    if (!tickerRes.ok) throw new Error(`Binance pair ${cleanSym} not found`);
    const ticker = await tickerRes.json();

    const klinesRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${cleanSym}&interval=${interval}&limit=100`);
    const klines = await klinesRes.json();

    const closes = klines.map((k) => Number(k[4]));
    const highs = klines.map((k) => Number(k[2]));
    const lows = klines.map((k) => Number(k[3]));

    const currentPrice = Number(ticker.lastPrice);
    const rsi = calculateRSI(closes, 14);
    const macd = calculateMACD(closes);
    const bb = calculateBB(closes, 20, 2);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);

    const lastHigh = highs[highs.length - 2] || currentPrice;
    const lastLow = lows[lows.length - 2] || currentPrice;
    const lastClose = closes[closes.length - 2] || currentPrice;
    const pivot = Number(((lastHigh + lastLow + lastClose) / 3).toFixed(2));
    const r1 = Number((2 * pivot - lastLow).toFixed(2));
    const s1 = Number((2 * pivot - lastHigh).toFixed(2));

    let bias = "NEUTRAL";
    if (rsi > 55 && currentPrice > ema20) bias = "BUY";
    if (rsi > 68 && currentPrice > ema20 && ema20 > ema50) bias = "STRONG_BUY";
    if (rsi < 45 && currentPrice < ema20) bias = "SELL";
    if (rsi < 32 && currentPrice < ema20 && ema20 < ema50) bias = "STRONG_SELL";

    return {
      success: true,
      source: "Binance Real-Time Data (Instant Cloud Engine)",
      symbol: cleanSym,
      exchange: "BINANCE",
      price_data: {
        current_price: currentPrice,
        change_percent: Number(ticker.priceChangePercent),
        high_24h: Number(ticker.highPrice),
        low_24h: Number(ticker.lowPrice),
        volume_24h: Number(ticker.volume),
        quote_volume_24h: Number(ticker.quoteVolume),
      },
      technical_indicators: {
        oscillators: {
          rsi_14: rsi,
          macd: macd,
        },
        moving_averages: {
          ema_20: ema20,
          ema_50: ema50,
        },
      },
      bollinger_bands: bb,
      support_resistance: {
        pivot,
        resistance_1: r1,
        support_1: s1,
      },
      summary: {
        recommendation: bias,
      },
      timeframe_context: {
        bias,
      },
    };
  } catch (err) {
    console.warn(`[Fallback] Analysis failed for ${cleanSym}:`, err.message);
    return {
      error: `Veri çekilemedi: ${err.message}`,
      symbol: cleanSym,
    };
  }
}

async function fallbackMarketScanner(type, args = {}) {
  const limit = args.limit || 20;
  console.log(`[Fallback] Running market scanner for ${type} (limit: ${limit})...`);

  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr");
    const tickers = await res.json();

    const usdtPairs = tickers.filter(
      (t) => t.symbol.endsWith("USDT") && Number(t.quoteVolume) > 3000000 && !t.symbol.includes("UP") && !t.symbol.includes("DOWN")
    );

    let sorted = [];
    if (type === "top_gainers") {
      sorted = usdtPairs.sort((a, b) => Number(b.priceChangePercent) - Number(a.priceChangePercent)).slice(0, limit);
    } else if (type === "top_losers") {
      sorted = usdtPairs.sort((a, b) => Number(a.priceChangePercent) - Number(b.priceChangePercent)).slice(0, limit);
    } else {
      // volume_breakout / volume scanner
      sorted = usdtPairs.sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume)).slice(0, limit);
    }

    return {
      success: true,
      source: "Binance Live Scanner (Instant Cloud Engine)",
      count: sorted.length,
      items: sorted.map((t) => ({
        symbol: t.symbol,
        price: Number(t.lastPrice),
        change_24h_percent: Number(t.priceChangePercent),
        volume_24h_usdt: Math.round(Number(t.quoteVolume)),
        high_24h: Number(t.highPrice),
        low_24h: Number(t.lowPrice),
      })),
    };
  } catch (err) {
    console.error("[Fallback] Scanner error:", err.message);
    return { error: err.message };
  }
}

async function callTool(name, args = {}) {
  let result = null;
  let hasError = false;

  if (mcpClient) {
    try {
      console.log(`[MCP] Calling tool: ${name} with args:`, JSON.stringify(args));
      const response = await mcpClient.callTool({
        name,
        arguments: args,
      });

      if (response && response.content && response.content.length > 0) {
        const textBlocks = response.content
          .filter((c) => c.type === "text")
          .map((c) => c.text);
        
        const combined = textBlocks.join("\n");
        result = parseMcpResponse(combined);
      } else {
        result = response;
      }

      if (typeof result === "string" && (result.includes("transient TA error") || result.includes("JSONDecodeError") || result.includes("error"))) {
        hasError = true;
      }
      if (result && typeof result === "object" && result.error) {
        hasError = true;
      }
    } catch (err) {
      console.warn(`[MCP] Tool ${name} threw error:`, err.message);
      hasError = true;
    }
  } else {
    hasError = true;
  }

  // Fallback to direct high-speed financial API if MCP failed or returned error
  if (hasError || !result) {
    console.log(`[MCP] Executing direct cloud fallback for tool: ${name}...`);
    if (name === "coin_analysis" || name === "combined_analysis" || name === "multi_timeframe_analysis") {
      return await fallbackCoinAnalysis(args.symbol, args.exchange, args.interval || "15m");
    }
    if (name === "top_gainers" || name === "top_losers" || name === "volume_breakout_scanner" || name === "bollinger_scan") {
      return await fallbackMarketScanner(name, args);
    }
  }

  return result;
}

module.exports = {
  initMCP,
  getTools: () => (cachedTools.length > 0 ? cachedTools : DEFAULT_TOOLS),
  callTool,
};
