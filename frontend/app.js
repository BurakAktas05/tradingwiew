// State
let currentSymbol = "BINANCE:BTCUSDT";
let currentExchange = "BINANCE";
let currentShortSymbol = "BTCUSDT";
let tvWidget = null;
let chatHistory = [];

// DOM Elements
const symbolSearchInput = document.getElementById("symbolSearchInput");
const displaySymbol = document.getElementById("displaySymbol");
const displayExchange = document.getElementById("displayExchange");
const currentPriceVal = document.getElementById("currentPriceVal");
const priceChangeVal = document.getElementById("priceChangeVal");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const clearChatBtn = document.getElementById("clearChatBtn");

// (API key and settings are securely managed on the backend)

// VIEW SWITCHER
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view-panel").forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    const targetView = btn.dataset.view;
    const panel = document.getElementById(targetView);
    if (panel) {
      panel.classList.add("active");
    }

    if (targetView === "view-terminal" && !tvWidget) {
      loadTradingViewChart(currentSymbol);
    }
    if (targetView === "view-news" && !newsLoaded) {
      loadNews(false);
    }
  });
});

// Load TradingView Chart
function loadTradingViewChart(symbol) {
  const container = document.getElementById("tradingview_chart_container");
  if (!container) return;
  container.innerHTML = "";

  if (typeof TradingView !== "undefined") {
    tvWidget = new TradingView.widget({
      autosize: true,
      symbol: symbol,
      interval: "15",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "tr",
      toolbar_bg: "#0c1018",
      enable_publishing: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      container_id: "tradingview_chart_container",
      studies: ["RSI@tv-basicstudies", "MASimple@tv-basicstudies"],
      disabled_features: ["header_saveload"],
    });
  }
}

// Fetch Technical Data for Active Symbol
async function loadTechnicalData(symbol, exchange) {
  try {
    const cleanSym = symbol.includes(":") ? symbol.split(":")[1] : symbol;
    const res = await fetch("/api/tool/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: "coin_analysis",
        args: {
          symbol: cleanSym,
          exchange: exchange || "BINANCE",
          interval: "15m",
        },
      }),
    });

    const data = await res.json();
    if (data.success && data.result) {
      updateTechnicalUI(data.result);
    }
  } catch (err) {
    console.warn("Could not load instant technical data:", err);
  }
}

// Update UI with technical analysis result
function updateTechnicalUI(result) {
  if (!result) return;

  const priceData = result.price_data || {};
  if (priceData.current_price) {
    currentPriceVal.textContent = `$${Number(priceData.current_price).toLocaleString()}`;
  }
  if (priceData.change_percent !== undefined) {
    const chg = Number(priceData.change_percent);
    const isUp = chg >= 0;
    priceChangeVal.textContent = `${isUp ? "+" : ""}${chg.toFixed(2)}%`;
    priceChangeVal.className = `live-chg ${isUp ? "up" : "down"}`;
  }

  // Bottom Indicator Bar
  const ind = result.technical_indicators || {};
  const osc = ind.oscillators || {};
  const mas = ind.moving_averages || {};

  // RSI
  if (osc.rsi_14 !== undefined) {
    document.getElementById("ind-rsi").textContent = Number(osc.rsi_14).toFixed(1);
  } else if (result.rsi && result.rsi.value) {
    document.getElementById("ind-rsi").textContent = Number(result.rsi.value).toFixed(1);
  }

  // MACD
  if (osc.macd && osc.macd.macd !== undefined) {
    document.getElementById("ind-macd").textContent = Number(osc.macd.macd).toFixed(2);
  } else if (result.macd && result.macd.macd_line) {
    document.getElementById("ind-macd").textContent = Number(result.macd.macd_line).toFixed(2);
  }

  // Bollinger Squeeze
  if (result.bollinger_bands) {
    const isSqueeze = result.bollinger_bands.squeeze;
    document.getElementById("ind-bb").textContent = isSqueeze ? "SIKIŞMA VAR" : "Normal";
    document.getElementById("ind-bb").className = isSqueeze ? "val up" : "val";
  }

  // EMA
  if (mas.ema_20 || (result.ema && result.ema.ema20)) {
    const emaVal = mas.ema_20 || result.ema.ema20;
    const isAbove = Number(priceData.current_price) > Number(emaVal);
    const el = document.getElementById("ind-ema");
    el.textContent = isAbove ? "Üstünde (Boğa)" : "Altında (Ayı)";
    el.className = isAbove ? "val up" : "val down";
  }

  // Pivot
  if (result.support_resistance && result.support_resistance.pivot) {
    document.getElementById("ind-pivot").textContent = `$${Number(result.support_resistance.pivot).toFixed(1)}`;
  }

  // Technical Verdict
  const rec = (result.summary && result.summary.recommendation) || (result.timeframe_context && result.timeframe_context.bias) || "NÖTR";
  const vEl = document.getElementById("ind-verdict");
  const translatedVerdict = formatVerdict(rec);
  vEl.textContent = translatedVerdict;
  const recLower = String(rec).toLowerCase();
  if (recLower.includes("buy") || recLower.includes("al") || recLower.includes("bull")) {
    vEl.style.color = "var(--bullish)";
  } else if (recLower.includes("sell") || recLower.includes("sat") || recLower.includes("bear")) {
    vEl.style.color = "var(--bearish)";
  } else {
    vEl.style.color = "#fff";
  }

  if (drawerBtnText) {
    drawerBtnText.textContent = `Teknik: ${translatedVerdict}`;
  }
}

function formatVerdict(rec) {
  if (!rec) return "NÖTR";
  const r = String(rec).toUpperCase();
  if (r.includes("STRONG_BUY") || r.includes("STRONG BUY") || r.includes("GÜÇLÜ AL")) return "GÜÇLÜ AL";
  if (r.includes("BUY") || r.includes("AL") || r.includes("BULLISH")) return "AL (YÜKSELİŞ)";
  if (r.includes("STRONG_SELL") || r.includes("STRONG SELL") || r.includes("GÜÇLÜ SAT")) return "GÜÇLÜ SAT";
  if (r.includes("SELL") || r.includes("SAT") || r.includes("BEARISH")) return "SAT (DÜŞÜŞ)";
  if (r.includes("NEUTRAL") || r.includes("NÖTR")) return "NÖTR / BEKLE-GÖR";
  return rec;
}

// BRAND LOGO CLICK -> HOME (TERMINAL)
const brandLogo = document.getElementById("brandLogo");
if (brandLogo) {
  brandLogo.addEventListener("click", () => {
    const terminalTab = document.querySelector('[data-view="view-terminal"]');
    if (terminalTab) terminalTab.click();
  });
}

// DRAWER TOGGLE (Açılır/Kapanır Canlı Teknik Göstergeler)
const toggleDrawerBtn = document.getElementById("toggleDrawerBtn");
const closeDrawerBtn = document.getElementById("closeDrawerBtn");
const techDrawer = document.getElementById("techDrawer");
const drawerBtnText = document.getElementById("drawerBtnText");

if (toggleDrawerBtn && techDrawer) {
  toggleDrawerBtn.addEventListener("click", () => {
    const isOpen = techDrawer.classList.toggle("open");
    toggleDrawerBtn.classList.toggle("active", isOpen);
  });
}

if (closeDrawerBtn && techDrawer) {
  closeDrawerBtn.addEventListener("click", () => {
    techDrawer.classList.remove("open");
    if (toggleDrawerBtn) toggleDrawerBtn.classList.remove("active");
  });
}

// COPILOT / ZEN MODE TOGGLE (Temiz Grafik / Asistanı Gizle-Göster)
const toggleCopilotBtn = document.getElementById("toggleCopilotBtn");
const terminalGrid = document.getElementById("terminalGrid");
const copilotBtnText = document.getElementById("copilotBtnText");
const terminalResizer = document.getElementById("terminalResizer");

// Restore saved copilot width if available (clamped to screen)
const savedCopilotWidth = localStorage.getItem("tradex_copilot_width");
if (savedCopilotWidth && terminalGrid) {
  const parsedWidth = parseInt(savedCopilotWidth, 10);
  const maxAllowed = Math.max(260, Math.floor(window.innerWidth * 0.45));
  if (!isNaN(parsedWidth) && parsedWidth >= 260) {
    const safeWidth = Math.min(parsedWidth, maxAllowed);
    terminalGrid.style.setProperty("--copilot-width", `${safeWidth}px`);
  }
}

// Draggable Resizer Handler
let isResizing = false;
if (terminalResizer && terminalGrid) {
  terminalResizer.addEventListener("mousedown", (e) => {
    isResizing = true;
    terminalGrid.classList.add("resizing");
    terminalResizer.classList.add("active");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const containerWidth = terminalGrid.getBoundingClientRect().width;
    const newWidth = Math.max(260, Math.min(containerWidth - 250, window.innerWidth - e.clientX));
    terminalGrid.style.setProperty("--copilot-width", `${newWidth}px`);
  });

  window.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      terminalGrid.classList.remove("resizing");
      terminalResizer.classList.remove("active");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const currentW = terminalGrid.style.getPropertyValue("--copilot-width");
      if (currentW) {
        localStorage.setItem("tradex_copilot_width", parseInt(currentW, 10));
      }
    }
  });
}

if (toggleCopilotBtn && terminalGrid) {
  toggleCopilotBtn.addEventListener("click", () => {
    const isCollapsed = terminalGrid.classList.toggle("copilot-collapsed");
    toggleCopilotBtn.classList.toggle("active", isCollapsed);
    if (copilotBtnText) {
      copilotBtnText.textContent = isCollapsed ? "Asistanı Göster" : "Asistanı Gizle";
    }
  });
}

// Switch Symbol
function setSymbol(fullSymbol, shortSymbol, exchange) {
  currentSymbol = fullSymbol;
  currentShortSymbol = shortSymbol;
  currentExchange = exchange;

  displaySymbol.textContent = fullSymbol;
  displayExchange.textContent = exchange;

  const drawerSym = document.getElementById("drawerSymbolLabel");
  if (drawerSym) drawerSym.textContent = fullSymbol;

  document.querySelectorAll(".asset-chips .chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.sym === fullSymbol);
  });

  loadTradingViewChart(fullSymbol);
  loadTechnicalData(fullSymbol, exchange);
}

// Chat Flow
async function sendMessage(text) {
  if (!text || !text.trim()) return;

  const userQuery = text.trim();
  chatInput.value = "";
  chatInput.style.height = "24px";

  appendMessage("user", userQuery);

  const loadingMsgId = "loading-" + Date.now();
  appendLoadingMessage(loadingMsgId);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const storedApiKey = localStorage.getItem("tradex_openai_key") || "";
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userQuery,
        history: chatHistory,
        apiKey: storedApiKey || null,
      }),
    });

    const data = await res.json();
    removeLoadingMessage(loadingMsgId);

    if (data.success) {
      appendMessage("assistant", data.reply, data.toolCalls);
      chatHistory.push({ role: "user", content: userQuery });
      chatHistory.push({ role: "assistant", content: data.reply });
    } else {
      appendErrorMessage(data.error || "OpenAI GPT-4o yanıt oluştururken bir hata ile karşılaştı.");
    }
  } catch (err) {
    removeLoadingMessage(loadingMsgId);
    appendErrorMessage("Sunucu hatası: " + err.message);
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMessage(role, content, toolCalls = []) {
  const msgEl = document.createElement("div");
  msgEl.className = `msg ${role === "user" ? "user-msg" : "ai-msg"}`;

  const avatarEl = document.createElement("div");
  avatarEl.className = "msg-avatar";
  avatarEl.textContent = role === "user" ? "Sen" : "YZ";

  const contentEl = document.createElement("div");
  contentEl.className = "msg-content";

  if (toolCalls && toolCalls.length > 0) {
    const pill = document.createElement("div");
    pill.className = "mcp-pill";
    pill.innerHTML = `⚡ <span>Canlı Piyasa & Teknik Göstergeler Analiz Edildi</span>`;
    contentEl.appendChild(pill);
  }

  const textDiv = document.createElement("div");
  textDiv.innerHTML = formatMarkdown(content);
  contentEl.appendChild(textDiv);

  msgEl.appendChild(avatarEl);
  msgEl.appendChild(contentEl);
  chatMessages.appendChild(msgEl);
}

function appendLoadingMessage(id) {
  const msgEl = document.createElement("div");
  msgEl.id = id;
  msgEl.className = "msg ai-msg";
  msgEl.innerHTML = `
    <div class="msg-avatar">YZ</div>
    <div class="msg-content">
      <div class="mcp-pill" style="animation: pulse-dot 1.5s infinite">
        ⚡ Canlı piyasa verileri çekiliyor ve Fatih için analiz hazırlanıyor...
      </div>
    </div>
  `;
  chatMessages.appendChild(msgEl);
}

function removeLoadingMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function appendErrorMessage(errText) {
  const msgEl = document.createElement("div");
  msgEl.className = "msg ai-msg";
  msgEl.innerHTML = `
    <div class="msg-avatar" style="background: var(--bearish)">!</div>
    <div class="msg-content" style="border-color: rgba(239, 68, 68, 0.4)">
      <p>😅 <strong>Ufak bir aksilik oldu Fatih abi:</strong> ${errText}</p>
      <p style="font-size: 11.5px; color: var(--text-dim); margin-top: 6px;">
        Bir daha dene istersen, yine olmazsa direkt Burak'a söyle hemen baksın! 🛠️
      </p>
    </div>
  `;
  chatMessages.appendChild(msgEl);
}

function formatMarkdown(text) {
  if (!text) return "";
  
  // Extract and preserve code blocks
  const codeBlocks = [];
  let processed = text.replace(/```([a-zA-Z]*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`);
    return id;
  });

  // Extract and format markdown tables
  processed = processed.replace(/((?:\|[^\n]+\|\n?)+)/g, (match) => {
    const rows = match.trim().split("\n").filter(r => r.includes("|"));
    if (rows.length < 2) return match;
    let tableHtml = "<table>";
    let isHeader = true;
    for (let r of rows) {
      if (r.match(/^\|?\s*[-:]+[-| :]*\|?\s*$/)) {
        isHeader = false;
        continue;
      }
      const rawCells = r.split("|").map(c => c.trim());
      const cells = rawCells.slice(1, rawCells.length - 1);
      if (cells.length === 0) continue;
      tableHtml += "<tr>";
      const tag = isHeader ? "th" : "td";
      for (let c of cells) {
        tableHtml += `<${tag}>${formatInlineMarkdown(escapeHtml(c))}</${tag}>`;
      }
      tableHtml += "</tr>";
      isHeader = false;
    }
    tableHtml += "</table>";
    return tableHtml;
  });

  // Format paragraphs and inline styles
  let html = formatInlineMarkdown(escapeHtml(processed))
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");

  // Restore code blocks
  codeBlocks.forEach((cb, idx) => {
    html = html.replace(`__CODE_BLOCK_${idx}__`, cb);
  });

  return `<p>${html}</p>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatInlineMarkdown(str) {
  return str
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

// -------------------------------------------------------------
// SCREENER EXECUTION (With Rate-Limit Cooldown Handling)
// -------------------------------------------------------------
document.getElementById("runScreenerBtn").addEventListener("click", async () => {
  const exchange = document.getElementById("screenerExchange").value;
  const type = document.getElementById("screenerType").value;
  const tbody = document.getElementById("screenerTableBody");

  tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder">Canlı piyasa taranıyor (${exchange} - ${type})...</td></tr>`;

  try {
    let toolName = "top_gainers";
    let args = { exchange, timeframe: "1D", limit: 25 };

    if (type === "top_losers") {
      toolName = "top_losers";
      args = { exchange, timeframe: "1D", limit: 25 };
    } else if (type === "volume_breakout") {
      toolName = "volume_breakout_scanner";
      args = { exchange, timeframe: "15m", limit: 25 };
    } else if (type === "bollinger_squeeze") {
      toolName = "bollinger_scan";
      args = { exchange, timeframe: "15m", limit: 25 };
    }

    const res = await fetch("/api/tool/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: toolName, args }),
    });

    const data = await res.json();
    if (data.success && data.result) {
      if (data.result.error) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder" style="color: #f59e0b; padding: 28px 16px;">
          ⏳ <strong>TradingView sunucusu kısa bir mola verdi Fatih abi!</strong><br>
          Ardışık taramalarda 30-60 saniyelik güvenlik beklemesi uygulanıyor.<br>
          Az sonra bir daha dene, yine gelmezse Burak'a söyle baksın! (Borsa olarak <strong>KUCOIN</strong> de deneyebilirsin).
        </td></tr>`;
        return;
      }
      renderScreenerResults(data.result);
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder" style="padding: 28px 16px;">
        😅 <strong>Veri çekilemedi Fatih abi:</strong> ${data.error || "Sonuç bulunamadı"}<br>
        Bir daha dene, yine olmazsa Burak'a söyle bi el atsın!
      </td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder" style="padding: 28px 16px;">
      😅 <strong>Tarama sırasında ufak bir pürüz çıktı Fatih abi:</strong> ${err.message}<br>
      Bir daha dene, olmazsa Burak'a söyle baksın!
    </td></tr>`;
  }
});

function renderScreenerResults(result) {
  const tbody = document.getElementById("screenerTableBody");
  tbody.innerHTML = "";

  let items = [];
  if (Array.isArray(result)) {
    items = result;
  } else if (typeof result === "object" && result !== null) {
    items = result.gainers || result.losers || result.breakouts || result.items || [];
  } else if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      items = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {}
  }

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder">Kriterlere uygun sonuç bulunamadı.</td></tr>`;
    return;
  }

  items.slice(0, 30).forEach((item) => {
    const tr = document.createElement("tr");
    const rawSym = item.symbol || item.coin || "---";
    const cleanSym = rawSym.replace(/.*:/, "");
    
    // Price
    const ind = item.indicators || {};
    const price = ind.close || item.price || item.current_price || ind.open || "---";
    
    // Change
    const chg = item.changePercent !== undefined ? item.changePercent : (item.change !== undefined ? item.change : (item.change_percent || item.gain_percent || 0));
    const isUp = Number(chg) >= 0;
    
    // Volume
    const vol = ind.volume || item.volume || item.volume_24h || "---";
    
    // RSI
    const rsiVal = ind.RSI || item.rsi || item.rsi_14 || "---";

    tr.innerHTML = `
      <td><strong>${rawSym}</strong></td>
      <td>$${typeof price === "number" ? price.toLocaleString() : price}</td>
      <td style="color: ${isUp ? 'var(--bullish)' : 'var(--bearish)'}; font-weight: 600;">
        ${isUp ? '+' : ''}${Number(chg).toFixed(2)}%
      </td>
      <td>${typeof vol === "number" ? vol.toLocaleString() : vol}</td>
      <td>${typeof rsiVal === "number" ? rsiVal.toFixed(1) : rsiVal}</td>
      <td>
        <button class="primary-btn" style="padding: 3px 10px; font-size: 11px;" onclick="selectAndSwitchToChart('${rawSym}')">Grafik</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function selectAndSwitchToChart(rawSym) {
  const ex = rawSym.includes(":") ? rawSym.split(":")[0] : "BINANCE";
  const short = rawSym.replace(/.*:/, "");
  const full = rawSym.includes(":") ? rawSym : `BINANCE:${rawSym}`;
  setSymbol(full, short, ex);
  document.querySelector('[data-view="view-terminal"]').click();
}

// -------------------------------------------------------------
// BACKTEST / SIMULATION (Fixed & Yahoo Finance Symbol Mapping)
// -------------------------------------------------------------
function toYahooSymbol(sym) {
  if (!sym) return "BTC-USD";
  const s = sym.trim().toUpperCase().replace(/.*:/, "");
  
  if (s === "BTC" || s === "BTCUSDT") return "BTC-USD";
  if (s === "ETH" || s === "ETHUSDT") return "ETH-USD";
  if (s === "SOL" || s === "SOLUSDT") return "SOL-USD";
  if (s === "XRP" || s === "XRPUSDT") return "XRP-USD";
  if (s === "BNB" || s === "BNBUSDT") return "BNB-USD";
  if (s === "DOGE" || s === "DOGEUSDT") return "DOGE-USD";
  
  // BIST
  if (s === "THYAO" || s === "THYAO.IS") return "THYAO.IS";
  if (s === "ASELS" || s === "ASELS.IS") return "ASELS.IS";
  if (s === "GARAN" || s === "GARAN.IS") return "GARAN.IS";
  if (s === "EREGL" || s === "EREGL.IS") return "EREGL.IS";

  // Commodities & US stocks
  if (s === "XAUUSD" || s === "GOLD") return "GC=F";
  return s;
}

document.getElementById("runBacktestBtn").addEventListener("click", async () => {
  const rawInput = document.getElementById("btSymbol").value.trim() || "BTC";
  const symbol = toYahooSymbol(rawInput);
  const strategy = document.getElementById("btStrategy").value;
  const interval = document.getElementById("btInterval").value;

  const btn = document.getElementById("runBacktestBtn");
  btn.disabled = true;
  btn.textContent = "Simüle Ediliyor...";

  try {
    const isCompare = strategy === "compare_all";
    const tool = isCompare ? "compare_strategies" : "backtest_strategy";
    const args = isCompare
      ? { symbol, interval, period: "1y" }
      : { symbol, strategy, interval, period: "1y" };

    const res = await fetch("/api/tool/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args }),
    });

    const data = await res.json();
    btn.disabled = false;
    btn.textContent = "Simülasyonu Başlat";

    if (data.success && data.result) {
      const r = data.result;

      if (r.ranking && Array.isArray(r.ranking)) {
        // Multi-strategy compare leaderboard
        const winner = r.ranking[0];
        document.getElementById("btWinRate").textContent = `${winner.win_rate_pct}%`;
        
        const totalReturn = `${winner.total_return_pct}%`;
        const retEl = document.getElementById("btTotalReturn");
        retEl.textContent = totalReturn;
        retEl.className = totalReturn.startsWith("-") ? "kpi-value down" : "kpi-value up";

        document.getElementById("btProfitFactor").textContent = winner.profit_factor;
        document.getElementById("btSharpe").textContent = winner.sharpe_ratio;
        document.getElementById("btTotalTrades").textContent = winner.total_trades;

        const STRATEGY_TR_MAP = {
          "rsi": "RSI Aşırı Alım / Satım",
          "macd": "MACD Sinyal Kesişimi",
          "bollinger": "Bollinger Bant Geri Dönüşü",
          "ema_cross": "EMA 9/21 Trend Kesişimi",
          "supertrend": "Supertrend Takipçisi",
          "donchian": "Donchian Kanal Kırılımı",
          "keltner_breakout": "Keltner Kanal Kırılımı",
          "triple_ema": "Üçlü EMA Trend Kesişimi",
          "rsi_pullback": "RSI Trend İçi Geri Çekilme"
        };

        let summaryText = `🏆 EN İYİ PERFORMANS GÖSTEREN STRATEJİ: ${(STRATEGY_TR_MAP[winner.strategy] || winner.strategy_label).toUpperCase()} (Net Getiri: %${winner.total_return_pct})\n\n`;
        summaryText += `Sıra | Strateji Adı                          | Getiri (%) | Başarı (%) | Sharpe | İşlem\n`;
        summaryText += `------------------------------------------------------------------------------------\n`;
        r.ranking.forEach((s) => {
          const stratName = STRATEGY_TR_MAP[s.strategy] || s.strategy_label;
          summaryText += `#${s.rank}   | ${stratName.padEnd(38)} | %${String(s.total_return_pct).padEnd(8)} | %${String(s.win_rate_pct).padEnd(6)} | ${String(s.sharpe_ratio).padEnd(6)} | ${s.total_trades}\n`;
        });
        document.getElementById("btSummaryBox").textContent = summaryText;
      } else {
        // Single strategy
        const winRate = r.win_rate_pct !== undefined ? `${r.win_rate_pct}%` : (r.win_rate !== undefined ? `${(r.win_rate * 100).toFixed(1)}%` : "---");
        document.getElementById("btWinRate").textContent = winRate;

        const totalReturn = r.total_return_pct !== undefined ? `${r.total_return_pct.toFixed(2)}%` : (r.total_return !== undefined ? `${r.total_return.toFixed(2)}%` : "---");
        const retEl = document.getElementById("btTotalReturn");
        retEl.textContent = totalReturn;
        retEl.className = totalReturn.startsWith("-") ? "kpi-value down" : "kpi-value up";

        document.getElementById("btProfitFactor").textContent = r.profit_factor !== undefined ? Number(r.profit_factor).toFixed(2) : "---";
        document.getElementById("btSharpe").textContent = r.sharpe_ratio !== undefined ? Number(r.sharpe_ratio).toFixed(2) : "---";
        document.getElementById("btTotalTrades").textContent = r.total_trades || r.trades_count || "---";

        const STRATEGY_TR_MAP = {
          "rsi": "RSI Aşırı Alım / Satım",
          "macd": "MACD Sinyal Kesişimi",
          "bollinger": "Bollinger Bant Geri Dönüşü",
          "ema_cross": "EMA 9/21 Trend Kesişimi",
          "supertrend": "Supertrend Takipçisi",
          "donchian": "Donchian Kanal Kırılımı",
          "keltner_breakout": "Keltner Kanal Kırılımı",
          "triple_ema": "Üçlü EMA Trend Kesişimi",
          "rsi_pullback": "RSI Trend İçi Geri Çekilme"
        };
        const stratName = STRATEGY_TR_MAP[r.strategy] || r.strategy_label || r.strategy;
        const intervalName = r.timeframe === "1h" || r.interval === "1h" ? "1 Saatlik (1s)" : "1 Günlük (1g)";

        let summaryText = `Strateji: ${stratName}\n`;
        summaryText += `Varlık: ${r.symbol} | Veri Dönemi: 1 Yıllık Geçmiş | Zaman Dilimi: ${intervalName}\n`;
        summaryText += `Başlangıç Sermayesi: $${r.initial_capital} -> Bitiş Sermayesi: $${r.final_capital}\n`;
        summaryText += `Başarı Oranı: ${winRate} | Toplam İşlem: ${r.total_trades} (Kazanan: ${r.winning_trades}, Kaybeden: ${r.losing_trades})\n`;
        summaryText += `Maksimum Değer Kaybı (Drawdown): %${r.max_drawdown_pct} | Kâr Katsayısı: ${r.profit_factor}\n`;
        if (r.recent_trades && r.recent_trades.length > 0) {
          summaryText += `\nSon Gerçekleşen İşlemler:\n`;
          r.recent_trades.forEach((t) => {
            summaryText += `  • Giriş: ${t.entry_date} ($${t.entry_price}) -> Çıkış: ${t.exit_date} ($${t.exit_price}) | Net Getiri: %${t.return_pct}\n`;
          });
        }
        document.getElementById("btSummaryBox").textContent = summaryText;
      }
    } else {
      alert("😅 Fatih abi simülasyonu çalıştırırken bir pürüz çıktı: " + (data.error || "Bilinmeyen hata") + "\n\nBir daha dene, yine olmazsa Burak'a söyle baksın!");
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Simülasyonu Başlat";
    alert("😅 Fatih abi simülasyon tarafında ufak bir aksilik oldu: " + err.message + "\n\nBir daha dene, çözülmezse Burak'a söyle bi el atsın!");
  }
});

// Event Listeners
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(chatInput.value);
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(chatInput.value);
  }
});

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 90) + "px";
});

clearChatBtn.addEventListener("click", () => {
  chatHistory = [];
  const starter = chatMessages.firstElementChild;
  chatMessages.innerHTML = "";
  if (starter) chatMessages.appendChild(starter);
});

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("prompt-chip")) {
    const q = e.target.dataset.q;
    sendMessage(q);
  }
});

// Search input handling
symbolSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const val = symbolSearchInput.value.trim().toUpperCase();
    if (val) {
      let full = val;
      let ex = "BINANCE";
      if (val.includes(":")) {
        const parts = val.split(":");
        ex = parts[0];
        full = val;
      } else {
        full = `BINANCE:${val}`;
      }
      setSymbol(full, val.replace(/.*:/, ""), ex);
      symbolSearchInput.value = "";
    }
  }
});

// Asset Chips
document.querySelectorAll(".asset-chips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    setSymbol(chip.dataset.sym, chip.dataset.short, chip.dataset.ex);
  });
});

// Initialize on Load
window.addEventListener("DOMContentLoaded", () => {
  loadTradingViewChart(currentSymbol);
  loadTechnicalData(currentSymbol, currentExchange);
  loadNews(false); // Background initial load for news & sentiment
});

// -------------------------------------------------------------
// NEWS & SENTIMENT (Cached, 100% Free, Auto-refreshing)
// -------------------------------------------------------------
let newsLoaded = false;

async function loadNews(force = false) {
  const refreshBtn = document.getElementById("refreshNewsBtn");
  const refreshIcon = document.getElementById("refreshNewsIcon");
  const lastUpdatedEl = document.getElementById("newsLastUpdated");
  const feedBox = document.getElementById("newsFeed");

  if (refreshBtn) refreshBtn.disabled = true;
  if (refreshIcon) refreshIcon.style.animation = "spin 1s linear infinite";

  try {
    const res = await fetch(`/api/news?force=${force}`);
    const data = await res.json();

    if (data.success) {
      newsLoaded = true;

      // Update Sentiment Score
      const s = data.sentiment || {};
      const scoreEl = document.getElementById("sentimentVal");
      if (scoreEl && s.score !== undefined) {
        scoreEl.textContent = `${s.score} / 100`;
        scoreEl.style.color = s.score >= 55 ? "var(--bullish)" : (s.score <= 45 ? "var(--bearish)" : "var(--text-main)");
      }

      const badgeEl = document.querySelector(".sentiment-badge");
      if (badgeEl && s.label) {
        badgeEl.textContent = s.label;
        badgeEl.className = `sentiment-badge ${s.sentimentClass || "neutral"}`;
      }

      // Update Fatih 1-Paragraph Executive Summary
      const summaryEl = document.getElementById("fatihSummaryText");
      if (summaryEl && data.executiveSummary) {
        summaryEl.textContent = data.executiveSummary;
      }

      if (lastUpdatedEl && data.lastUpdated) {
        lastUpdatedEl.textContent = `Son Güncelleme: ${data.lastUpdated}`;
      }

      // Render News Cards
      if (feedBox && data.items && data.items.length > 0) {
        feedBox.innerHTML = "";
        data.items.forEach((item) => {
          const card = document.createElement("div");
          card.className = "news-card";
          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span class="news-tag">${item.source}</span>
              <span style="font-size: 10.5px; color: var(--text-dim); font-family: var(--font-mono);">${item.pubDate ? new Date(item.pubDate).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
            </div>
            <h3 class="news-head">
              <a href="${item.link}" target="_blank" rel="noopener noreferrer" style="color: #fff; text-decoration: none; transition: color 0.15s;">
                ${item.title}
              </a>
            </h3>
            <p class="news-summary">${item.summary}</p>
          `;
          feedBox.appendChild(card);
        });
      }
    }
  } catch (err) {
    console.warn("Could not load news:", err);
    if (feedBox) {
      feedBox.innerHTML = `
        <div class="news-card" style="border-color: rgba(245, 158, 11, 0.35); text-align: center; padding: 24px;">
          <span class="news-tag" style="color: #f59e0b;">Bağlantı Notu</span>
          <h3 class="news-head" style="margin-top: 6px;">😅 Haberleri çekerken ufak bir pürüz çıktı Fatih abi</h3>
          <p class="news-summary">'Yenile' butonuna basıp bir daha dene istersen. Yine olmazsa Burak'a söyle baksın!</p>
        </div>
      `;
    }
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
    if (refreshIcon) refreshIcon.style.animation = "";
  }
}

// Event listener for manual refresh
const refreshNewsBtn = document.getElementById("refreshNewsBtn");
if (refreshNewsBtn) {
  refreshNewsBtn.addEventListener("click", () => loadNews(true));
}

// Auto-refresh news every 5 minutes (zero cost, background update)
setInterval(() => {
  loadNews(false);
}, 5 * 60 * 1000);

