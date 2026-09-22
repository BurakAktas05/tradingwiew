const OpenAI = require("openai");
const { getTools, callTool } = require("./mcpClient");

function buildSystemInstruction(context = {}) {
  const activeSym = context.activeSymbol || "BINANCE:BTCUSDT";
  const activeShort = context.activeShortSymbol || activeSym.replace(/.*:/, "").replace(".IS", "");
  const activeEx = context.activeExchange || (activeSym.includes(":") ? activeSym.split(":")[0] : "BINANCE");

  return `Sen son derece deneyimli, profesyonel bir Kıdemli Finansal Analist ve Algoritmik İşlem Uzmanısın.
Sana sağlanan TradingView MCP araçlarını (tools) kullanarak kullanıcının sorduğu kripto paralar, hisse senetleri (BIST, ABD), emtialar (Altın, Gümüş, Petrol) veya döviz kurları için derinlemesine analiz yapacaksın.

🎯 KULLANICININ EKRANINDA ŞU AN AÇIK OLAN CANLI GRAFİK VE AKTİF VARLIK BİLGİSİ:
- Tam Sembol: ${activeSym}
- Varlık Kısa Adı: ${activeShort}
- İşlem Gördüğü Borsa: ${activeEx}

⚡ KRİTİK KURAL (AKTİF GRAFİK / CANLI TEKNİK ANALİZ VARSAYIMI):
Kullanıcı mesajında ("canlı teknik analiz", "teknik analiz", "grafiği incele", "durum nasıl", "alınır mı", "destek direnç", "bu coin/hisse", "göstergeler ne durumda", "fiyat hedefi", "trend nedir" gibi ifadelerle) özel olarak BAŞKA bir varlığın adını (örneğin ETH, SOL, AAPL gibi açıkça farklı bir sembol) belirtmediyse, MUTLAKA VE KESİNLİKLE sol ekranda açık olan aktif grafikteki varlığı (${activeShort}, Borsa: ${activeEx}) sorduğunu varsayacaksın!
Bu durumda ASLA "Hangi varlığı sormuştunuz?" veya "Lütfen bir sembol belirtin" diye sorma! Doğrudan ekrandaki aktif varlık (${activeShort}, ${activeEx}) için 'coin_analysis' (symbol: "${activeShort}", exchange: "${activeEx}") veya ilgili aracı çağır ve sol ekrandaki grafiğin canlı teknik analizini sun.

Önemli Kurallar:
1. Kullanıcı bir hisse, kripto veya piyasa durumu sorduğunda MUTLAKA ilgili araçları (coin_analysis, combined_analysis, multi_timeframe_analysis, top_gainers, volume_breakout_scanner, backtest_strategy vb.) çağırarak EN GÜNCEL canlı veriyi çek. Eğer bir araç anlık olarak veri döndüremezse veya hata verirse, ASLA "veriye erişemedim / bir sorun yaşıyoruz" diyerek kullanıcıyı boş çevirme; eldeki veriler, genel piyasa durumu, popüler varlıklar (BTC, ETH, SOL, THYAO, NVDA vb.), teknik seviyeler ve stratejik önerilerle detaylı, doyurucu ve rehberlik eden bir yanıt sun.
2. Analizlerini son derece net, yapılandırılmış, profesyonel ve %100 akıcı Türkçe ile sun. Yanıtlarında gereksiz İngilizce terimler bırakma; teknik kavramların Türkçe karşılıklarını kullan (örn: Bullish yerine Boğa / Yükseliş Eğilimi, Bearish yerine Ayı / Düşüş Eğilimi, Support/Resistance yerine Destek/Direnç Seviyeleri, Breakout yerine Hacimli Kırılım, Strong Buy yerine Güçlü Al vb.):
   - 📌 **Genel Görünüm & Anlık Fiyat Durumu** (${activeShort} / ${activeEx})
   - 📊 **Teknik Göstergeler (RSI, MACD, Bollinger Bantları, Hareketli Ortalamalar)**
   - 🎯 **Destek, Direnç ve Pivot Seviyeleri**
   - ⚡ **Hacim, Kırılım ve Momentum Durumu**
   - 🧭 **Stratejik Değerlendirme & Yön Eğilimi**
3. Backtest ve simülasyon sorularında (backtest_strategy, compare_strategies) ASLA ham JSON veya kod bloğu döndürme! Sonuçları son derece akıcı, profesyonel Türkçe ile yapılandır:
   - 🎯 **Strateji & Dönem**: Hangi strateji, hangi zaman dilimi (1 günlük, 1 saatlik) ve varlık.
   - 💰 **Sermaye Gelişimi**: $10.000 başlangıç -> Bitiş sermayesi ve Net Kâr/Zarar oranı (%).
   - 📈 **Performans Metrikleri**: Kazanma oranı (Win Rate %), Kâr Katsayısı (Profit Factor) ve Sharpe Oranı.
   - ⚖️ **İşlem Sayısı & Dağılım**: Toplam işlem, kazanan ve kaybeden işlem adedi.
   - 💡 **Uzman Yorumu**: Stratejinin güçlü ve zayıf yönleri hakkında 1-2 cümlelik pratik değerlendirme.
4. Yanıtının sonuna şu yasal uyarıyı kısa bir not olarak ekle: "⚠️ Not: Bu analiz eğitim ve bilgilendirme amaçlıdır; yatırım tavsiyesi niteliği taşımaz."
`;
}

function getOpenAITools() {
  const tools = getTools();
  return tools.map((tool) => {
    // Sanitize inputSchema for OpenAI
    const schema = JSON.parse(JSON.stringify(tool.inputSchema || { type: "object", properties: {} }));
    delete schema["$schema"];
    delete schema["title"];
    delete schema["default"];

    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || `TradingView tool: ${tool.name}`,
        parameters: schema,
      },
    };
  });
}

async function chatWithOpenAI(message, history = [], userApiKey = null, context = {}) {
  const apiKey = userApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY bulunamadı! Lütfen arayüzden veya .env dosyasından anahtarınızı girin.");
  }

  const activeSym = context.activeSymbol || "BINANCE:BTCUSDT";
  const activeShort = context.activeShortSymbol || activeSym.replace(/.*:/, "").replace(".IS", "");
  const activeEx = context.activeExchange || (activeSym.includes(":") ? activeSym.split(":")[0] : "BINANCE");

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const openAITools = getOpenAITools();

  const messages = [
    { role: "system", content: buildSystemInstruction({ activeSymbol: activeSym, activeExchange: activeEx, activeShortSymbol: activeShort }) },
    ...(history || []).map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content || "",
    })),
    { role: "user", content: message },
  ];

  let toolCallsExecuted = [];
  let iterations = 0;
  const maxIterations = 6;

  while (iterations < maxIterations) {
    iterations++;

    let response;
    try {
      response = await openai.chat.completions.create({
        model,
        messages,
        tools: openAITools.length > 0 ? openAITools : undefined,
        tool_choice: "auto",
      });
    } catch (apiErr) {
      if (model !== "gpt-4o-mini" && (apiErr.status === 429 || String(apiErr.message).includes("rate") || apiErr.status >= 500)) {
        console.warn(`[OpenAI] ${model} unavailable (${apiErr.message}), falling back to gpt-4o-mini...`);
        response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          tools: openAITools.length > 0 ? openAITools : undefined,
          tool_choice: "auto",
        });
      } else {
        throw apiErr;
      }
    }

    const choice = response.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // If no tool calls, return final response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return {
        reply: assistantMessage.content || "",
        toolCalls: toolCallsExecuted,
      };
    }

    // Process tool calls
    for (const toolCall of assistantMessage.tool_calls) {
      const functionName = toolCall.function.name;
      let functionArgs = {};
      try {
        functionArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch (e) {
        functionArgs = {};
      }

      // Default to active chart asset if no specific symbol provided
      if (["coin_analysis", "combined_analysis", "multi_timeframe_analysis", "backtest_strategy"].includes(functionName)) {
        if (!functionArgs.symbol || functionArgs.symbol.toLowerCase() === "active" || functionArgs.symbol.toLowerCase() === "current") {
          functionArgs.symbol = activeShort;
        }
        if (!functionArgs.exchange && (functionArgs.symbol.toUpperCase() === activeShort.toUpperCase() || functionArgs.symbol.toUpperCase() === activeSym.toUpperCase())) {
          functionArgs.exchange = activeEx;
        }
      }

      console.log(`[OpenAI] Invoking MCP tool: ${functionName} with:`, functionArgs);

      try {
        const result = await callTool(functionName, functionArgs);
        toolCallsExecuted.push({
          tool: functionName,
          args: functionArgs,
          result,
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: typeof result === "object" ? JSON.stringify(result) : String(result),
        });
      } catch (err) {
        console.error(`[OpenAI] Tool error ${functionName}:`, err);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: JSON.stringify({ error: err.message }),
        });
      }
    }
  }

  // If reached max iterations, return last assistant message
  const lastMsg = messages[messages.length - 1];
  return {
    reply: lastMsg.content || "Analiz tamamlandı.",
    toolCalls: toolCallsExecuted,
  };
}

module.exports = {
  chatWithOpenAI,
};
