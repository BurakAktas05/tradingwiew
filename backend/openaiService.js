const OpenAI = require("openai");
const { getTools, callTool } = require("./mcpClient");

const SYSTEM_INSTRUCTION = `Sen son derece deneyimli, profesyonel bir Kıdemli Finansal Analist ve Algoritmik İşlem Uzmanısın.
Sana sağlanan TradingView MCP araçlarını (tools) kullanarak kullanıcının sorduğu kripto paralar, hisse senetleri (BIST, ABD), emtialar (Altın, Gümüş, Petrol) veya döviz kurları için derinlemesine analiz yapacaksın.

Önemli Kurallar:
1. Kullanıcı bir hisse, kripto veya piyasa durumu sorduğunda MUTLAKA ilgili araçları (coin_analysis, combined_analysis, multi_timeframe_analysis, top_gainers, volume_breakout_scanner, backtest_strategy vb.) çağırarak EN GÜNCEL canlı veriyi çek. Asla tahmini veya ezbere veri üretme.
2. Analizlerini son derece net, yapılandırılmış, profesyonel ve %100 akıcı Türkçe ile sun. Yanıtlarında gereksiz İngilizce terimler bırakma; teknik kavramların Türkçe karşılıklarını kullan (örn: Bullish yerine Boğa / Yükseliş Eğilimi, Bearish yerine Ayı / Düşüş Eğilimi, Support/Resistance yerine Destek/Direnç Seviyeleri, Breakout yerine Hacimli Kırılım, Strong Buy yerine Güçlü Al vb.):
   - 📌 **Genel Görünüm & Anlık Fiyat Durumu**
   - 📊 **Teknik Göstergeler (RSI, MACD, Bollinger Bantları, Hareketli Ortalamalar)**
   - 🎯 **Destek, Direnç ve Pivot Seviyeleri**
   - ⚡ **Hacim, Kırılım ve Momentum Durumu**
   - 🧭 **Stratejik Değerlendirme & Yön Eğilimi**
3. Backtest ve simülasyon sorularında başarı oranı (kazanma yüzdesi), kâr çarpanı, Sharpe oranı ve toplam işlem sayısını anlaşılır Türkçe ile vurgula.
4. Yanıtının sonuna şu yasal uyarıyı kısa bir not olarak ekle: "⚠️ Not: Bu analiz eğitim ve bilgilendirme amaçlıdır; yatırım tavsiyesi niteliği taşımaz."
`;

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

async function chatWithOpenAI(message, history = [], userApiKey = null) {
  const apiKey = userApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY bulunamadı! Lütfen arayüzden veya .env dosyasından anahtarınızı girin.");
  }

  const openai = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const openAITools = getOpenAITools();

  const messages = [
    { role: "system", content: SYSTEM_INSTRUCTION },
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

    const response = await openai.chat.completions.create({
      model,
      messages,
      tools: openAITools.length > 0 ? openAITools : undefined,
      tool_choice: "auto",
    });

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
