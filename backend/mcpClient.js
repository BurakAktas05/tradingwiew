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
    description: "Kripto, hisse veya emtia için anlık fiyat, RSI, MACD, Bollinger, EMA ve teknik analiz kararını çeker.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Varlık sembolü (örn: BTCUSDT, NVDA, THYAO, XAUUSD)" },
        exchange: { type: "string", description: "Borsa adı (örn: BINANCE, NASDAQ, BIST)" },
        interval: { type: "string", description: "Zaman aralığı: 15m, 1h, 1D" },
      },
      required: ["symbol"],
    },
  },
  {
    name: "market_snapshot",
    description: "Genel piyasa durumunu, büyük kriptoları, hisse ve altın fiyatlarını özetleyen anlık piyasa fotoğrafı çeker.",
    inputSchema: {
      type: "object",
      properties: {},
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
  const isWindows = process.platform === "win32";
  const homeDir = process.env.USERPROFILE || process.env.HOME || "";
  const ext = isWindows ? ".exe" : "";
  const localBin = path.join(homeDir, ".local", "bin", `uvx${ext}`);
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  // Check common Linux/Docker install paths
  const systemPaths = ["/bin/uvx", "/usr/local/bin/uvx", "/usr/bin/uvx"];
  if (!isWindows) {
    for (const p of systemPaths) {
      if (fs.existsSync(p)) return p;
    }
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

    const isWindows = process.platform === "win32";
    const homeDir = process.env.USERPROFILE || process.env.HOME || "";
    const currentPath = process.env.PATH || "";
    const localBinDir = path.join(homeDir, ".local", "bin");
    const pathSep = isWindows ? ";" : ":";
    const envWithUv = {
      ...process.env,
      PATH: `${localBinDir}${pathSep}${currentPath}`,
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

    // Add connection timeout for cloud environments (Render etc.)
    const MCP_CONNECT_TIMEOUT = 15000; // 15 seconds max
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("MCP connection timed out after 15s")), MCP_CONNECT_TIMEOUT)
    );
    await Promise.race([connectPromise, timeoutPromise]);
    mcpClient = client;

    const result = await client.listTools();
    cachedTools = (result.tools && result.tools.length > 0) ? result.tools : DEFAULT_TOOLS;
    console.log(`[MCP] Successfully connected! Loaded ${cachedTools.length} TradingView tools.`);

    return { client: mcpClient, tools: cachedTools };
  } catch (err) {
    console.warn("[MCP] Warning: Could not connect to TradingView MCP server process, using high-speed fallback APIs:", err.message);
    mcpClient = null; // Explicitly null so fallback is always used
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
// DIRECT HIGH-SPEED FALLBACK ENGINE (Binance + Yahoo Finance + TA math)
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
// Calculate EMA as a full series (returns array of EMA values)
function calculateEMASeries(data, period) {
  if (!data || data.length < period) return data ? [...data] : [];
  const k = 2 / (period + 1);
  const emaSeries = new Array(period - 1).fill(null);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emaSeries.push(ema);
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    emaSeries.push(ema);
  }
  return emaSeries;
}

function calculateMACD(closes) {
  if (!closes || closes.length < 26) {
    return { macd: 0, signal: 0, hist: 0 };
  }

  // Calculate full EMA12 and EMA26 series
  const ema12Series = calculateEMASeries(closes, 12);
  const ema26Series = calculateEMASeries(closes, 26);

  // MACD line = EMA12 - EMA26 (only where both exist)
  const macdSeries = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12Series[i] !== null && ema26Series[i] !== null) {
      macdSeries.push(ema12Series[i] - ema26Series[i]);
    }
  }

  if (macdSeries.length === 0) {
    return { macd: 0, signal: 0, hist: 0 };
  }

  // Signal line = EMA(9) of MACD series
  const signalSeries = calculateEMASeries(macdSeries, 9);

  const macdVal = Number(macdSeries[macdSeries.length - 1].toFixed(4));
  const signalVal = signalSeries[signalSeries.length - 1] !== null
    ? Number(signalSeries[signalSeries.length - 1].toFixed(4))
    : 0;
  const histVal = Number((macdVal - signalVal).toFixed(4));

  return { macd: macdVal, signal: signalVal, hist: histVal };
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

async function fallbackKucoinAnalysis(rawSymbol, interval = "15m") {
  let kuInterval = "15min";
  if (interval === "1h") kuInterval = "1hour";
  if (interval === "1D" || interval === "1d") kuInterval = "1day";

  let kuSym = (rawSymbol || "BTCUSDT").toUpperCase().replace(/.*:/, "");
  if (!kuSym.includes("-")) {
    if (kuSym.endsWith("USDT")) kuSym = kuSym.replace(/USDT$/, "-USDT");
    else kuSym = `${kuSym}-USDT`;
  }

  console.log(`[Fallback] Fetching KuCoin live market & technical data for ${kuSym}...`);
  const [statsRes, candlesRes] = await Promise.all([
    fetch(`https://api.kucoin.com/api/v1/market/stats?symbol=${kuSym}`),
    fetch(`https://api.kucoin.com/api/v1/market/candles?type=${kuInterval}&symbol=${kuSym}`),
  ]);

  const statsJson = await statsRes.json();
  const candlesJson = await candlesRes.json();

  if (statsJson.code !== "200000" || !statsJson.data) {
    throw new Error(`KuCoin stats failed for ${kuSym}: ${statsJson.msg || "not found"}`);
  }
  if (candlesJson.code !== "200000" || !Array.isArray(candlesJson.data) || candlesJson.data.length === 0) {
    throw new Error(`KuCoin candles failed for ${kuSym}: ${candlesJson.msg || "no candles"}`);
  }

  const stats = statsJson.data;
  // Kucoin candles are [time, open, close, high, low, volume, turnover] in reverse order (newest first)
  const candles = [...candlesJson.data].reverse();
  const closes = candles.map((c) => Number(c[2]));
  const highs = candles.map((c) => Number(c[3]));
  const lows = candles.map((c) => Number(c[4]));

  const currentPrice = Number(stats.last);
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
    source: "KuCoin Real-Time Data (Instant Cloud Engine)",
    symbol: kuSym.replace("-", ""),
    exchange: "KUCOIN",
    price_data: {
      current_price: currentPrice,
      change_percent: Number((Number(stats.changeRate || 0) * 100).toFixed(2)),
      high_24h: Number(stats.high || currentPrice),
      low_24h: Number(stats.low || currentPrice),
      volume_24h: Number(stats.vol || 0),
      quote_volume_24h: Math.round(Number(stats.volValue || 0)),
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
}

async function fallbackCoinAnalysis(rawSymbol, exchange = "BINANCE", interval = "15m") {
  const isKucoin = (exchange || "").toUpperCase() === "KUCOIN";
  if (isKucoin) {
    try {
      return await fallbackKucoinAnalysis(rawSymbol, interval);
    } catch (err) {
      console.warn(`[Fallback] KuCoin analysis failed: ${err.message}, trying Yahoo Finance...`);
      return await fallbackYahooFinance(rawSymbol);
    }
  }

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
    if (!Array.isArray(klines)) throw new Error("Binance klines is not an array");

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
    console.warn(`[Fallback] Binance analysis failed for ${cleanSym} (${err.message}), trying KuCoin...`);
    try {
      return await fallbackKucoinAnalysis(cleanSym, interval);
    } catch (kErr) {
      console.warn(`[Fallback] KuCoin analysis also failed (${kErr.message}), trying Yahoo Finance...`);
      return await fallbackYahooFinance(rawSymbol);
    }
  }
}

async function fallbackYahooFinance(rawSymbol) {
  let sym = (rawSymbol || "").toUpperCase().replace(/.*:/, "");
  if (sym === "XAUUSD" || sym === "GOLD" || sym === "ALTIN") sym = "GC=F";
  if (sym.endsWith("USDT")) sym = sym.replace(/USDT$/, "-USD");
  if (["THYAO", "ASELS", "GARAN", "KCHOL", "ISCTR", "EREGL", "TUPRS", "BIMAS"].includes(sym)) {
    sym = `${sym}.IS`;
  }

  console.log(`[Fallback] Fetching Yahoo Finance data for ${sym}...`);
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=30d`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!res.ok) throw new Error(`Yahoo Finance query failed: ${res.statusText}`);
    const data = await res.json();
    const result = data.chart && data.chart.result && data.chart.result[0];
    if (!result) throw new Error("No data returned from Yahoo Finance");

    const meta = result.meta;
    const currentPrice = Number(meta.regularMarketPrice || meta.chartPreviousClose || 0);
    const prevClose = Number(meta.chartPreviousClose || currentPrice);
    const chgPct = Number((((currentPrice - prevClose) / (prevClose || 1)) * 100).toFixed(2));

    const quotes = result.indicators.quote[0] || {};
    const closes = (quotes.close || []).filter((c) => c !== null);
    const rsi = calculateRSI(closes, 14);
    const macd = calculateMACD(closes);
    const bb = calculateBB(closes, 20, 2);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);

    let bias = "NEUTRAL";
    if (rsi > 55 && currentPrice > ema20) bias = "BUY";
    if (rsi > 68 && currentPrice > ema20) bias = "STRONG_BUY";
    if (rsi < 45 && currentPrice < ema20) bias = "SELL";
    if (rsi < 32 && currentPrice < ema20 && ema20 < ema50) bias = "STRONG_SELL";

    // Calculate real pivot-based support/resistance from available data
    const highs = (quotes.high || []).filter((h) => h !== null);
    const lowsArr = (quotes.low || []).filter((l) => l !== null);
    const lastHigh = highs.length > 1 ? highs[highs.length - 2] : currentPrice * 1.01;
    const lastLow = lowsArr.length > 1 ? lowsArr[lowsArr.length - 2] : currentPrice * 0.99;
    const lastClose = closes.length > 1 ? closes[closes.length - 2] : currentPrice;
    const pivot = Number(((lastHigh + lastLow + lastClose) / 3).toFixed(2));
    const r1 = Number((2 * pivot - lastLow).toFixed(2));
    const s1 = Number((2 * pivot - lastHigh).toFixed(2));

    return {
      success: true,
      source: "Yahoo Finance Global Market Engine",
      symbol: sym,
      exchange: meta.exchangeName || "GLOBAL",
      price_data: {
        current_price: currentPrice,
        change_percent: chgPct,
        high_24h: Number(meta.regularMarketDayHigh || currentPrice),
        low_24h: Number(meta.regularMarketDayLow || currentPrice),
        volume_24h: Number(meta.regularMarketVolume || 0),
        quote_volume_24h: Number((meta.regularMarketVolume || 0) * currentPrice),
      },
      technical_indicators: {
        oscillators: { rsi_14: rsi, macd },
        moving_averages: { ema_20: ema20, ema_50: ema50 },
      },
      bollinger_bands: bb,
      support_resistance: {
        pivot,
        resistance_1: r1,
        support_1: s1,
      },
      summary: { recommendation: bias },
      timeframe_context: { bias },
    };
  } catch (err) {
    console.warn(`[Fallback] Yahoo Finance error for ${sym}:`, err.message);
    return { error: err.message, symbol: rawSymbol };
  }
}

async function fallbackMarketSnapshot() {
  console.log("[Fallback] Generating live multi-market snapshot...");
  const results = [];

  try {
    // 1. Binance crypto
    const bRes = await fetch("https://api.binance.com/api/v3/ticker/24hr");
    const bData = await bRes.json();
    const bMap = {};
    if (Array.isArray(bData)) {
      bData.forEach((t) => { if (t && t.symbol) bMap[t.symbol] = t; });
    } else {
      console.warn("[Fallback] Binance snapshot returned non-array:", JSON.stringify(bData).slice(0, 200));
    }

    ["BTCUSDT", "ETHUSDT", "SOLUSDT"].forEach((s) => {
      if (bMap[s]) {
        results.push({
          symbol: s,
          name: s.replace("USDT", ""),
          price: Number(bMap[s].lastPrice),
          change_24h_percent: Number(bMap[s].priceChangePercent),
          volume_usdt: Math.round(Number(bMap[s].quoteVolume)),
        });
      }
    });

    // 2. Stocks & Gold via Yahoo
    const yfSymbols = [
      { sym: "NVDA", name: "NVIDIA (ABD)" },
      { sym: "THYAO.IS", name: "Türk Hava Yolları (BIST)" },
      { sym: "GC=F", name: "Altın (Ons)" }
    ];

    for (const item of yfSymbols) {
      try {
        const yRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${item.sym}?interval=1d&range=2d`, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const yData = await yRes.json();
        const meta = yData.chart.result[0].meta;
        const cur = Number(meta.regularMarketPrice);
        const prev = Number(meta.chartPreviousClose || cur);
        const chg = Number((((cur - prev) / (prev || 1)) * 100).toFixed(2));
        results.push({
          symbol: item.sym,
          name: item.name,
          price: cur,
          change_24h_percent: chg,
          currency: meta.currency,
        });
      } catch (e) {}
    }

    // Generate dynamic sentiment from actual data
    let bullCount = 0;
    let bearCount = 0;
    results.forEach((r) => {
      if (r.change_24h_percent > 0) bullCount++;
      else if (r.change_24h_percent < 0) bearCount++;
    });
    let sentimentSummary;
    if (bullCount > bearCount) {
      sentimentSummary = `Takip edilen ${results.length} varlıktan ${bullCount} tanesi yükselişte. Piyasalarda genel olarak pozitif bir hava hakim.`;
    } else if (bearCount > bullCount) {
      sentimentSummary = `Takip edilen ${results.length} varlıktan ${bearCount} tanesi düşüşte. Piyasalarda temkinli bir hava gözlemleniyor.`;
    } else {
      sentimentSummary = `Piyasalarda karışık sinyaller var. Yükselenler ve düşenler dengeli seyrediyor.`;
    }

    return {
      success: true,
      source: "Live Multi-Market Cloud Engine",
      timestamp: new Date().toISOString(),
      market_overview: results,
      sentiment_summary: sentimentSummary,
    };
  } catch (err) {
    console.error("[Fallback] Snapshot error:", err.message);
    return { error: err.message };
  }
}

async function fallbackKucoinScanner(type, limit = 20) {
  console.log(`[Fallback] Running KuCoin market scanner for ${type} (limit: ${limit})...`);
  const res = await fetch("https://api.kucoin.com/api/v1/market/allTickers");
  if (!res.ok) throw new Error(`KuCoin API returned ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (!json.data || !Array.isArray(json.data.ticker)) {
    throw new Error(json.msg || "KuCoin API did not return ticker array");
  }

  const usdtPairs = json.data.ticker.filter(
    (t) => t && t.symbol && t.symbol.endsWith("-USDT") && Number(t.volValue) > 200000 && !t.symbol.includes("3L") && !t.symbol.includes("3S")
  );

  let sorted = [];
  if (type === "top_gainers") {
    sorted = usdtPairs.sort((a, b) => Number(b.changeRate) - Number(a.changeRate)).slice(0, limit);
  } else if (type === "top_losers") {
    sorted = usdtPairs.sort((a, b) => Number(a.changeRate) - Number(b.changeRate)).slice(0, limit);
  } else {
    // volume_breakout / volume scanner / bollinger
    sorted = usdtPairs.sort((a, b) => Number(b.volValue) - Number(a.volValue)).slice(0, limit);
  }

  return {
    success: true,
    source: "KuCoin Live Scanner (Cloud Engine)",
    count: sorted.length,
    items: sorted.map((t) => ({
      symbol: t.symbol.replace("-", ""),
      price: Number(t.last),
      change_24h_percent: Number((Number(t.changeRate) * 100).toFixed(2)),
      volume_24h: Math.round(Number(t.volValue)),
      volume: Math.round(Number(t.volValue)),
      high_24h: Number(t.high),
      low_24h: Number(t.low),
    })),
  };
}

async function fallbackStockScanner(exchange = "NASDAQ", type = "top_gainers", limit = 15) {
  const isBist = (exchange || "").toUpperCase() === "BIST";
  const symbols = isBist
    ? ["THYAO.IS", "ASELS.IS", "GARAN.IS", "KCHOL.IS", "ISCTR.IS", "EREGL.IS", "TUPRS.IS", "BIMAS.IS", "AKBNK.IS", "SISE.IS", "SAHOL.IS", "FROTO.IS", "YKBNK.IS"]
    : ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AMD", "NFLX", "INTC", "AVGO", "QCOM", "COST"];

  const results = await Promise.allSettled(
    symbols.map(async (sym) => {
      const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const data = await res.json();
      const meta = data.chart.result[0].meta;
      const price = Number(meta.regularMarketPrice || meta.chartPreviousClose || 0);
      const prev = Number(meta.chartPreviousClose || price);
      const chg = Number((((price - prev) / (prev || 1)) * 100).toFixed(2));
      return {
        symbol: isBist ? sym.replace(".IS", "") : sym,
        price,
        change_24h_percent: chg,
        volume_24h: Number(meta.regularMarketVolume || 0),
        volume: Number(meta.regularMarketVolume || 0),
      };
    })
  );

  let items = results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value);

  if (type === "top_gainers") {
    items.sort((a, b) => b.change_24h_percent - a.change_24h_percent);
  } else if (type === "top_losers") {
    items.sort((a, b) => a.change_24h_percent - b.change_24h_percent);
  } else {
    items.sort((a, b) => b.volume_24h - a.volume_24h);
  }

  return {
    success: true,
    source: `${isBist ? "BIST" : "NASDAQ"} Market Scanner (Yahoo Finance Engine)`,
    count: items.length,
    items: items.slice(0, limit),
  };
}

async function fallbackMarketScanner(type, args = {}) {
  const limit = args.limit || 20;
  const exchange = (args.exchange || "BINANCE").toUpperCase();
  console.log(`[Fallback] Running market scanner for ${type} on ${exchange} (limit: ${limit})...`);

  // 1. If stock exchange requested (NASDAQ or BIST)
  if (exchange === "NASDAQ" || exchange === "BIST") {
    try {
      return await fallbackStockScanner(exchange, type, limit);
    } catch (err) {
      console.warn(`[Fallback] Stock scanner failed: ${err.message}, switching to KuCoin crypto...`);
      return await fallbackKucoinScanner(type, limit);
    }
  }

  // 2. If KuCoin explicitly requested
  if (exchange === "KUCOIN") {
    return await fallbackKucoinScanner(type, limit);
  }

  // 3. Default to Binance, with automatic instant failover to KuCoin if Binance is blocked or down
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr");
    if (!res.ok) {
      throw new Error(`Binance API returned ${res.status}: ${res.statusText}`);
    }
    const tickers = await res.json();

    if (!Array.isArray(tickers)) {
      throw new Error(tickers.msg || tickers.message || "Binance API did not return ticker array");
    }

    const usdtPairs = tickers.filter(
      (t) => t && t.symbol && t.symbol.endsWith("USDT") && Number(t.quoteVolume) > 3000000 && !t.symbol.includes("UP") && !t.symbol.includes("DOWN")
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
        volume_24h: Math.round(Number(t.quoteVolume)),
        volume: Math.round(Number(t.quoteVolume)),
        high_24h: Number(t.highPrice),
        low_24h: Number(t.lowPrice),
      })),
    };
  } catch (err) {
    console.warn(`[Fallback] Binance scanner failed (${err.message}), seamlessly switching to KuCoin cloud scanner...`);
    return await fallbackKucoinScanner(type, limit);
  }
}

async function callTool(name, args = {}) {
  let result = null;
  let hasError = false;

  if (mcpClient) {
    try {
      console.log(`[MCP] Calling tool: ${name} with args:`, JSON.stringify(args));
      
      // Add per-call timeout to prevent hanging on cloud
      const TOOL_TIMEOUT = 20000; // 20 seconds
      const callPromise = mcpClient.callTool({ name, arguments: args });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool ${name} timed out after 20s`)), TOOL_TIMEOUT)
      );
      const response = await Promise.race([callPromise, timeoutPromise]);

      if (response && response.content && response.content.length > 0) {
        const textBlocks = response.content
          .filter((c) => c.type === "text")
          .map((c) => c.text);
        
        const combined = textBlocks.join("\n");
        result = parseMcpResponse(combined);
      } else {
        result = response;
      }

      if (typeof result === "string" && (result.includes("transient TA error") || result.includes("JSONDecodeError") || result.includes("error") || result.includes("failed"))) {
        console.warn(`[MCP] Tool ${name} returned error in text, falling back...`);
        hasError = true;
      }
      if (result && typeof result === "object" && result.error) {
        console.warn(`[MCP] Tool ${name} returned error object, falling back...`);
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
      const res = await fallbackCoinAnalysis(args.symbol, args.exchange, args.interval || "15m");
      if (res && res.error) {
        return await fallbackYahooFinance(args.symbol);
      }
      return res;
    }
    if (name === "market_snapshot") {
      return await fallbackMarketSnapshot();
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
