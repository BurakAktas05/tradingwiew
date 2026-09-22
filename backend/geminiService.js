const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getGeminiFunctionDeclarations, callTool } = require("./mcpClient");

const SYSTEM_INSTRUCTION = `Sen son derece deneyimli, profesyonel bir Kıdemli Finansal Analist ve Algoritmik İşlem Uzmanısın (Trading & Financial Analyst AI).
Sana verilen TradingView araçlarını (tools) kullanarak kullanıcının sorduğu kripto paralar, hisse senetleri (BIST, ABD), emtialar (Altın, Petrol) veya döviz kurları için analiz yapacaksın.

Önemli Kurallar:
1. Kullanıcı bir hisse, kripto veya piyasa durumu sorduğunda MUTLAKA ilgili araçları (coin_analysis, combined_analysis, multi_timeframe_analysis, top_gainers, volume_breakout_scanner vb.) çağırarak EN GÜNCEL canlı veriyi çek. Tahmini veya eski veri üretme.
2. Analizlerini net, yapılandırılmış, profesyonel ve okunması kolay Türkçe ile sun:
   - **Genel Bakış & Anlık Fiyat Durumu**
   - **Teknik İndikatörler (RSI, MACD, Hareketli Ortalamalar)**
   - **Destek ve Direnç Seviyeleri / Pivotlar**
   - **Hacim ve Trend Analizi**
   - **Kısa/Orta Vadeli Görünüm (Boğa/Ayı/Nötr Eğilim)**
3. Backtest sorularında (backtest_strategy, compare_strategies) strateji kazanma oranını (win rate), kâr katsayısını ve işlem sayısını net bir şekilde belirt.
4. Yanıtlarının sonuna daima şu yasal uyarıyı kısa bir not olarak ekle: "⚠️ Not: Bu analiz eğitim ve bilgilendirme amaçlıdır; yatırım tavsiyesi niteliği taşımaz."
`;

async function getGeminiModel(apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY bulunamadı! Lütfen arayüzdeki Ayarlar menüsünden veya .env dosyasından bir Gemini API Anahtarı girin."
    );
  }

  const genAI = new GoogleGenerativeAI(key);
  const functionDeclarations = getGeminiFunctionDeclarations();

  // Prefer gemini-2.5-flash or gemini-1.5-flash / gemini-2.0-flash
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  return genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_INSTRUCTION,
    tools: [
      {
        functionDeclarations,
      },
    ],
  });
}

/**
 * Handle a chat turn with Gemini and automatic tool calling
 */
async function chatWithTradingAI(message, history = [], apiKey = null) {
  const model = await getGeminiModel(apiKey);

  const formattedHistory = (history || []).map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content || "" }],
  }));

  const chat = model.startChat({
    history: formattedHistory,
  });

  let result = await chat.sendMessage(message);
  let response = result.response;
  let toolCallsExecuted = [];

  // Loop to handle function calling (Gemini may call 1 or more tools)
  let loopCount = 0;
  const maxLoops = 5;

  while (response.functionCalls() && response.functionCalls().length > 0 && loopCount < maxLoops) {
    loopCount++;
    const functionCalls = response.functionCalls();
    console.log(`[Gemini] Model requested ${functionCalls.length} function calls:`, functionCalls.map(f => f.name));

    const functionResponses = [];

    for (const call of functionCalls) {
      const toolName = call.name;
      const toolArgs = call.args;

      try {
        const toolResult = await callTool(toolName, toolArgs);
        toolCallsExecuted.push({
          tool: toolName,
          args: toolArgs,
          result: toolResult,
        });

        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: { content: toolResult },
          },
        });
      } catch (toolErr) {
        console.error(`[Gemini] Error calling tool ${toolName}:`, toolErr);
        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: { error: toolErr.message },
          },
        });
      }
    }

    // Send the tool results back to Gemini
    result = await chat.sendMessage(functionResponses);
    response = result.response;
  }

  return {
    reply: response.text(),
    toolCalls: toolCallsExecuted,
  };
}

module.exports = {
  chatWithTradingAI,
};
