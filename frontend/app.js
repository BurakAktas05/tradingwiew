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

  const copilotStatus = document.querySelector(".copilot-status");
  if (copilotStatus) copilotStatus.textContent = `🟢 Aktif Grafik: ${fullSymbol}`;
  if (chatInput) chatInput.placeholder = `${shortSymbol} (${exchange}) veya herhangi bir soru sorun...`;

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
        activeSymbol: currentSymbol,
        activeExchange: currentExchange,
        activeShortSymbol: currentShortSymbol,
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
        // Invisible auto-retry with KuCoin
        if (exchange !== "KUCOIN") {
          try {
            console.warn("Primary exchange returned warning, auto-recovering with KuCoin...");
            const retryRes = await fetch("/api/tool/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tool: toolName, args: { ...args, exchange: "KUCOIN" } }),
            });
            const retryData = await retryRes.json();
            if (retryData.success && retryData.result && !retryData.result.error) {
              renderScreenerResults(retryData.result);
              return;
            }
          } catch (retryErr) {
            console.warn("Auto-recover attempt failed:", retryErr);
          }
        }

        tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder" style="color: #f59e0b; padding: 28px 16px;">
          ⏳ <strong>Piyasa verisi çekilirken bekleme uygulandı.</strong><br>
          Birkaç saniye sonra tekrar deneyin veya borsa olarak <strong>KUCOIN</strong> seçin.
        </td></tr>`;
        return;
      }
      renderScreenerResults(data.result);
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder" style="padding: 28px 16px;">
        Veri çekilemedi: ${data.error || "Sonuç bulunamadı"}<br>
        Lütfen filtreleri kontrol edip tekrar deneyin.
      </td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder" style="padding: 28px 16px;">
      Tarama sırasında bağlantı hatası oluştu: ${err.message}<br>
      Lütfen tekrar deneyin.
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
    items = result.gainers || result.losers || result.breakouts || result.items || result.market_overview || [];
  } else if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.gainers || parsed.losers || [parsed]);
    } catch (e) {}
  }

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-placeholder">Kriterlere uygun sonuç bulunamadı.</td></tr>`;
    return;
  }

  const activeExchange = (document.getElementById("screenerExchange")?.value || "BINANCE").toUpperCase();

  items.slice(0, 30).forEach((item) => {
    const tr = document.createElement("tr");
    const rawSym = item.symbol || item.coin || "---";
    const cleanSym = rawSym.replace(/.*:/, "").replace("-", "").replace(".IS", "");
    const itemEx = (item.exchange || (rawSym.includes(":") ? rawSym.split(":")[0] : activeExchange)).toUpperCase();
    const fullSym = item.full_symbol || (rawSym.includes(":") ? rawSym : `${itemEx}:${cleanSym}`);
    
    // Price
    const ind = item.indicators || {};
    const rawPrice = ind.close !== undefined ? ind.close : (item.price !== undefined ? item.price : (item.current_price !== undefined ? item.current_price : ind.open));
    let formattedPrice = "---";
    if (rawPrice !== undefined && rawPrice !== null && !isNaN(Number(rawPrice))) {
      const numP = Number(rawPrice);
      formattedPrice = numP < 1 ? `$${numP.toFixed(4)}` : `$${numP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Comprehensive Change parsing (Never 0 unless literally 0%)
    let rawChg = null;
    if (item.change_24h_percent !== undefined && item.change_24h_percent !== null) {
      rawChg = item.change_24h_percent;
    } else if (item.changePercent !== undefined && item.changePercent !== null) {
      rawChg = item.changePercent;
    } else if (item.change_percent !== undefined && item.change_percent !== null) {
      rawChg = item.change_percent;
    } else if (item.priceChangePercent !== undefined && item.priceChangePercent !== null) {
      rawChg = item.priceChangePercent;
    } else if (item.changeRate !== undefined && item.changeRate !== null) {
      rawChg = Number(item.changeRate) * 100;
    } else if (item.change !== undefined && item.change !== null) {
      rawChg = item.change;
    } else if (item.gain_percent !== undefined && item.gain_percent !== null) {
      rawChg = item.gain_percent;
    } else if (ind.changePercent !== undefined && ind.changePercent !== null) {
      rawChg = ind.changePercent;
    } else if (ind.change !== undefined && ind.change !== null) {
      rawChg = ind.change;
    }
    const chg = rawChg !== null ? Number(rawChg) : 0;
    const isUp = chg >= 0;

    // Volume formatting ($M / $K / $B)
    const rawVol = ind.volume || item.volume || item.volume_24h || item.volume_24h_usdt || item.quote_volume_24h;
    let formattedVol = "---";
    if (rawVol !== undefined && rawVol !== null && !isNaN(Number(rawVol)) && Number(rawVol) > 0) {
      const numV = Number(rawVol);
      if (numV >= 1e9) formattedVol = `$${(numV / 1e9).toFixed(2)}B`;
      else if (numV >= 1e6) formattedVol = `$${(numV / 1e6).toFixed(2)}M`;
      else if (numV >= 1e3) formattedVol = `$${(numV / 1e3).toFixed(1)}K`;
      else formattedVol = `$${numV.toLocaleString()}`;
    }

    // Technical / RSI status
    let techStatus = "---";
    const rawRsi = ind.RSI || item.rsi || item.rsi_14;
    if (rawRsi !== undefined && !isNaN(Number(rawRsi))) {
      const numRsi = Number(rawRsi);
      techStatus = `<span style="font-family: var(--font-mono); font-weight: 600;">RSI: ${numRsi.toFixed(1)}</span> <span style="font-size: 11px; color: var(--text-dim);">(${numRsi > 70 ? 'Aşırı Alım' : (numRsi < 30 ? 'Aşırı Satım' : 'Dengeli')})</span>`;
    } else {
      if (chg >= 10) techStatus = `<span style="color: var(--bullish); font-weight: 600;">🚀 Hacim Patlaması</span>`;
      else if (chg >= 3) techStatus = `<span style="color: var(--bullish); font-weight: 600;">🟢 Yükseliş Trendi</span>`;
      else if (chg > 0) techStatus = `<span style="color: #60a5fa;">📈 Pozitif Seyir</span>`;
      else if (chg <= -10) techStatus = `<span style="color: var(--bearish); font-weight: 600;">⚠️ Sert Düşüş</span>`;
      else if (chg <= -3) techStatus = `<span style="color: var(--bearish); font-weight: 600;">🔴 Satış Baskısı</span>`;
      else techStatus = `<span style="color: var(--text-dim);">⚪ Yatay / Dengeli</span>`;
    }

    tr.innerHTML = `
      <td>
        <span style="font-weight: 700; font-size: 13px;">${cleanSym}</span>
        <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.08); color: var(--text-dim); margin-left: 6px; font-weight: 600; text-transform: uppercase;">${itemEx}</span>
      </td>
      <td style="font-family: var(--font-mono);">${formattedPrice}</td>
      <td style="color: ${isUp ? 'var(--bullish)' : 'var(--bearish)'}; font-weight: 700; font-family: var(--font-mono);">
        ${isUp ? '+' : ''}${chg.toFixed(2)}%
      </td>
      <td style="font-family: var(--font-mono);">${formattedVol}</td>
      <td>${techStatus}</td>
      <td>
        <button class="primary-btn" style="padding: 4px 12px; font-size: 11px;" onclick="selectAndSwitchToChart('${fullSym}', '${itemEx}')">Grafik</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function detectExchange(sym) {
  if (!sym) return "BINANCE";
  const s = sym.toUpperCase().trim().replace(/.*:/, "").replace("-", "").replace(".IS", "");

  // BIST stocks
  const bistStocks = [
    "THYAO", "ASELS", "GARAN", "KCHOL", "ISCTR", "EREGL", "TUPRS", "BIMAS",
    "AKBNK", "SISE", "SAHOL", "FROTO", "YKBNK", "PGSUS", "PETKM", "TCELL",
    "ENKAI", "TOASO", "HEKTS", "SASA", "KOZAL", "GUBRF", "KOZAA", "ARCLK"
  ];
  if (bistStocks.includes(s) || sym.toUpperCase().endsWith(".IS")) {
    return "BIST";
  }

  // US Stocks / NASDAQ
  const usStocks = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "GOOG", "AMZN", "META", "TSLA", "AMD",
    "NFLX", "INTC", "AVGO", "QCOM", "COST", "COIN", "PLTR", "UBER", "DIS",
    "BABA", "BA", "PYPL", "SBUX", "CRM", "NKE"
  ];
  if (usStocks.includes(s)) {
    return "NASDAQ";
  }

  // Commodities
  if (s === "XAUUSD" || s === "GOLD" || s === "ALTIN" || s === "GC=F") {
    return "OANDA";
  }

  const screenerEx = document.getElementById("screenerExchange")?.value;
  if (screenerEx) return screenerEx.toUpperCase();

  return "BINANCE";
}

function selectAndSwitchToChart(rawSym, exchangeHint) {
  if (!rawSym || rawSym === "---") return;

  let full = rawSym.trim().toUpperCase();
  let ex = (exchangeHint || "").toUpperCase();
  let short = full;

  if (full.includes(":")) {
    const parts = full.split(":");
    ex = parts[0];
    short = parts[1];
  } else {
    if (!ex) {
      ex = detectExchange(full);
    }
    short = full.replace("-", "").replace(".IS", "");
    full = `${ex}:${short}`;
  }

  short = short.replace("-", "").replace(".IS", "");

  setSymbol(full, short, ex);

  const terminalTab = document.querySelector('[data-view="view-terminal"]');
  if (terminalTab) terminalTab.click();
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

const STRATEGY_TR_MAP = {
  rsi: "RSI Aşırı Alım / Satım (30/70)",
  macd: "MACD Sinyal Kesişimi",
  bollinger: "Bollinger Bant Geri Dönüşü",
  ema_cross: "EMA 9/21 Trend Kesişimi",
  supertrend: "Supertrend Trend Takipçisi",
  donchian: "Donchian Kanal Kırılımı",
  keltner_breakout: "Keltner Kanal Kırılımı",
  triple_ema: "Üçlü EMA Trend Kesişimi",
  rsi_pullback: "RSI Trend İçi Geri Çekilme",
};

function normalizeBacktestData(raw) {
  if (!raw) return null;
  let r = raw;

  // Handle stringified JSON
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch (e) {
      const match = r.match(/\{[\s\S]*\}/);
      if (match) {
        try { r = JSON.parse(match[0]); } catch (e2) {}
      }
    }
  }

  // Handle array wrapper
  if (Array.isArray(r)) {
    if (r.length === 1 && typeof r[0] === "object") {
      r = r[0];
    } else if (r.length > 1 && r[0].strategy && r[0].total_return_pct !== undefined) {
      r = { ranking: r };
    } else if (r.length > 0 && r[0].ranking) {
      r = r[0];
    }
  }

  // Handle MCP content wrapper { content: [{ type: "text", text: "..." }] }
  if (r && Array.isArray(r.content) && r.content[0] && r.content[0].text) {
    try {
      r = JSON.parse(r.content[0].text);
    } catch (e) {
      r = r.content[0].text;
    }
  }

  return (typeof r === "object" && r !== null) ? r : null;
}

function renderBacktestDashboard(r, defaultSymbol) {
  const container = document.getElementById("btSummaryBox");
  if (!container || !r) return;

  // 1. Leaderboard Mode (compare_all)
  if (r.ranking && Array.isArray(r.ranking) && r.ranking.length > 0) {
    const winner = r.ranking[0];
    const winRate = Number(winner.win_rate_pct !== undefined ? winner.win_rate_pct : (winner.win_rate ? winner.win_rate * 100 : 0)).toFixed(1);
    const totalReturn = Number(winner.total_return_pct !== undefined ? winner.total_return_pct : (winner.total_return || 0)).toFixed(2);
    const isWinnerProfit = Number(totalReturn) >= 0;

    // Update KPI cards with winner
    document.getElementById("btWinRate").textContent = `%${winRate}`;
    const retEl = document.getElementById("btTotalReturn");
    retEl.textContent = `${isWinnerProfit ? '+' : ''}${totalReturn}%`;
    retEl.className = isWinnerProfit ? "kpi-value up" : "kpi-value down";
    document.getElementById("btProfitFactor").textContent = Number(winner.profit_factor || 1).toFixed(2);
    document.getElementById("btSharpe").textContent = Number(winner.sharpe_ratio || 0).toFixed(2);
    document.getElementById("btTotalTrades").textContent = winner.total_trades || "---";

    const winnerName = STRATEGY_TR_MAP[winner.strategy] || winner.strategy_label || winner.strategy;

    let html = `
      <div class="bt-hero-banner ${isWinnerProfit ? '' : 'loss'}">
        <div>
          <div class="bt-hero-title">
            🏆 En Başarılı Strateji: <span>${winnerName}</span>
          </div>
          <div class="bt-hero-desc">
            ${r.symbol || defaultSymbol} üzerinde geçmiş 1 yıllık simülasyonda en yüksek net getiriyi sağladı.
          </div>
        </div>
        <div class="bt-hero-badge ${isWinnerProfit ? '' : 'down'}">
          ${isWinnerProfit ? '+' : ''}${totalReturn}% Net Getiri
        </div>
      </div>

      <div class="bt-table-wrapper">
        <table class="bt-table">
          <thead>
            <tr>
              <th style="width: 50px;">Sıra</th>
              <th>Strateji Adı</th>
              <th>Net Getiri</th>
              <th>Başarı (Kazanma)</th>
              <th>Kâr Katsayısı</th>
              <th>Sharpe</th>
              <th>İşlem Adedi</th>
            </tr>
          </thead>
          <tbody>
    `;

    r.ranking.forEach((s) => {
      const sRet = Number(s.total_return_pct !== undefined ? s.total_return_pct : (s.total_return || 0)).toFixed(2);
      const isUp = Number(sRet) >= 0;
      const sWin = Number(s.win_rate_pct !== undefined ? s.win_rate_pct : (s.win_rate ? s.win_rate * 100 : 0)).toFixed(1);
      const sName = STRATEGY_TR_MAP[s.strategy] || s.strategy_label || s.strategy;
      const rankBadgeClass = s.rank === 1 ? "rank-1" : (s.rank === 2 ? "rank-2" : (s.rank === 3 ? "rank-3" : ""));

      html += `
        <tr>
          <td><span class="bt-rank-badge ${rankBadgeClass}">#${s.rank}</span></td>
          <td style="font-family: var(--font-head); font-weight: 600; color: #fff;">${sName}</td>
          <td><span class="bt-pill ${isUp ? 'profit' : 'loss'}">${isUp ? '+' : ''}${sRet}%</span></td>
          <td>%${sWin}</td>
          <td>${Number(s.profit_factor || 1).toFixed(2)}</td>
          <td>${Number(s.sharpe_ratio || 0).toFixed(2)}</td>
          <td>${s.total_trades || 0} işlem</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
    return;
  }

  // 2. Single Strategy Mode
  const rawWinRate = r.win_rate_pct !== undefined ? r.win_rate_pct : (r.win_rate !== undefined ? r.win_rate * 100 : 0);
  const winRate = Number(rawWinRate || 0).toFixed(1);

  const rawReturn = r.total_return_pct !== undefined ? r.total_return_pct : (r.total_return !== undefined ? r.total_return : 0);
  const totalReturn = Number(rawReturn || 0).toFixed(2);
  const isProfit = Number(totalReturn) >= 0;

  const initialCap = Number(r.initial_capital || 10000);
  const finalCap = Number(r.final_capital || Math.round(initialCap * (1 + Number(totalReturn) / 100)));
  const netProfitUsd = finalCap - initialCap;

  const profitFactor = Number(r.profit_factor !== undefined ? r.profit_factor : 1).toFixed(2);
  const sharpe = Number(r.sharpe_ratio !== undefined ? r.sharpe_ratio : 0).toFixed(2);
  const totalTrades = Number(r.total_trades || (r.recent_trades ? r.recent_trades.length : 0));
  const winTrades = Number(r.winning_trades !== undefined ? r.winning_trades : Math.round((Number(winRate) / 100) * totalTrades));
  const loseTrades = Number(r.losing_trades !== undefined ? r.losing_trades : Math.max(0, totalTrades - winTrades));
  const maxDD = Math.abs(Number(r.max_drawdown_pct || 0)).toFixed(2);

  // Update top KPI cards
  document.getElementById("btWinRate").textContent = `%${winRate}`;
  const retEl = document.getElementById("btTotalReturn");
  retEl.textContent = `${isProfit ? '+' : ''}${totalReturn}%`;
  retEl.className = isProfit ? "kpi-value up" : "kpi-value down";
  document.getElementById("btProfitFactor").textContent = profitFactor;
  document.getElementById("btSharpe").textContent = sharpe;
  document.getElementById("btTotalTrades").textContent = totalTrades;

  const stratName = STRATEGY_TR_MAP[r.strategy] || r.strategy_label || r.strategy || "Teknik Strateji";
  const intervalName = r.timeframe === "1h" || r.interval === "1h" ? "1 Saatlik (1s)" : "1 Günlük (1g)";

  let html = `
    <div class="bt-hero-banner ${isProfit ? '' : 'loss'}">
      <div>
        <div class="bt-hero-title">
          📊 ${stratName}
        </div>
        <div class="bt-hero-desc">
          Varlık: <strong style="color: #fff;">${r.symbol || defaultSymbol}</strong> | Zaman Dilimi: <strong>${intervalName}</strong> | Test Süresi: <strong>1 Yıl</strong>
        </div>
      </div>
      <div class="bt-hero-badge ${isProfit ? '' : 'down'}">
        ${isProfit ? '+' : ''}${totalReturn}% Net Getiri
      </div>
    </div>

    <div class="bt-details-grid">
      <div class="bt-detail-item">
        <div class="bt-detail-label">Başlangıç Sermayesi</div>
        <div class="bt-detail-val">$${initialCap.toLocaleString()}</div>
      </div>
      <div class="bt-detail-item">
        <div class="bt-detail-label">Bitiş Sermayesi</div>
        <div class="bt-detail-val" style="color: ${isProfit ? 'var(--bullish)' : 'var(--bearish)'}">
          $${finalCap.toLocaleString()} (${isProfit ? '+' : ''}$${netProfitUsd.toLocaleString()})
        </div>
      </div>
      <div class="bt-detail-item">
        <div class="bt-detail-label">İşlem Dağılımı</div>
        <div class="bt-detail-val">
          <span style="color: var(--bullish);">${winTrades} Kâr</span> / <span style="color: var(--bearish);">${loseTrades} Zarar</span>
        </div>
      </div>
      <div class="bt-detail-item">
        <div class="bt-detail-label">Maksimum Düşüş (DD)</div>
        <div class="bt-detail-val" style="color: var(--bearish);">%${maxDD}</div>
      </div>
      <div class="bt-detail-item">
        <div class="bt-detail-label">Kâr Katsayısı (PF)</div>
        <div class="bt-detail-val">${profitFactor}</div>
      </div>
      <div class="bt-detail-item">
        <div class="bt-detail-label">Sharpe Oranı</div>
        <div class="bt-detail-val">${sharpe}</div>
      </div>
    </div>
  `;

  if (r.recent_trades && Array.isArray(r.recent_trades) && r.recent_trades.length > 0) {
    html += `
      <div style="margin-top: 6px;">
        <div style="font-family: var(--font-head); font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 8px;">
          ⏱️ Gerçekleşen Son İşlemler
        </div>
        <div class="bt-table-wrapper">
          <table class="bt-table">
            <thead>
              <tr>
                <th>Giriş Tarihi</th>
                <th>Giriş Fiyatı</th>
                <th>Çıkış Tarihi</th>
                <th>Çıkış Fiyatı</th>
                <th>Net Getiri</th>
                <th>Sonuç</th>
              </tr>
            </thead>
            <tbody>
    `;

    r.recent_trades.forEach((t) => {
      const tRet = Number(t.return_pct || 0).toFixed(2);
      const isTradeProfit = Number(tRet) >= 0;
      const enPrice = t.entry_price ? `$${Number(t.entry_price).toLocaleString()}` : "---";
      const exPrice = t.exit_price ? `$${Number(t.exit_price).toLocaleString()}` : "---";

      html += `
        <tr>
          <td>${t.entry_date || "---"}</td>
          <td>${enPrice}</td>
          <td>${t.exit_date || "---"}</td>
          <td>${exPrice}</td>
          <td><span class="bt-pill ${isTradeProfit ? 'profit' : 'loss'}">${isTradeProfit ? '+' : ''}${tRet}%</span></td>
          <td>
            <span style="font-size: 11px; font-weight: 600; color: ${isTradeProfit ? 'var(--bullish)' : 'var(--bearish)'}">
              ${isTradeProfit ? '✔ KÂR' : '✖ ZARAR'}
            </span>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
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
      const normalized = normalizeBacktestData(data.result);
      if (normalized) {
        renderBacktestDashboard(normalized, rawInput);
      } else {
        document.getElementById("btSummaryBox").innerHTML = `
          <div class="table-placeholder" style="padding: 24px; color: #f59e0b;">
            ⚠️ Simülasyon sonucu okunamadı. Lütfen sembolü kontrol edip tekrar deneyin.
          </div>
        `;
      }
    } else {
      document.getElementById("btSummaryBox").innerHTML = `
        <div class="table-placeholder" style="padding: 24px; color: #f59e0b;">
          ⚠️ Simülasyon çalıştırılırken veri alınamadı: ${data.error || "Sonuç bulunamadı"}<br>
          Lütfen sembolü kontrol edip tekrar deneyin.
        </div>
      `;
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Simülasyonu Başlat";
    document.getElementById("btSummaryBox").innerHTML = `
      <div class="table-placeholder" style="padding: 24px; color: #ef4444;">
        ❌ Bağlantı hatası oluştu: ${err.message}<br>
        Lütfen sayfayı yenileyip tekrar deneyin.
      </div>
    `;
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
    let q = e.target.dataset.q;
    if (q && q.includes("Bu varlığın")) {
      q = q.replace("Bu varlığın", `${currentShortSymbol} (${currentExchange}) varlığının`);
    }
    sendMessage(q);
  }
});

// Search input handling
symbolSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const val = symbolSearchInput.value.trim().toUpperCase();
    if (val) {
      selectAndSwitchToChart(val);
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
  const copilotStatus = document.querySelector(".copilot-status");
  if (copilotStatus) copilotStatus.textContent = `🟢 Aktif Grafik: ${currentSymbol}`;
  if (chatInput) chatInput.placeholder = `${currentShortSymbol} (${currentExchange}) veya herhangi bir soru sorun...`;

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

