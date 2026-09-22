const OpenAI = require("openai");

let cachedNews = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache to keep API cost near zero

function parseRssXml(xmlText, sourceName) {
  const items = [];
  const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>/gi) || [];

  for (const itemXml of itemMatches.slice(0, 8)) {
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/i);
    const linkMatch = itemXml.match(/<link>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/link>/i);
    const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/i);
    const descMatch = itemXml.match(/<description>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/description>/i);

    const title = (titleMatch ? (titleMatch[1] || titleMatch[2]) : "").trim();
    const link = (linkMatch ? (linkMatch[1] || linkMatch[2]) : "").trim();
    const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";
    let summary = (descMatch ? (descMatch[1] || descMatch[2]) : "").replace(/<[^>]+>/g, "").trim();

    if (summary.length > 150) {
      summary = summary.substring(0, 150) + "...";
    }

    if (title) {
      items.push({
        title,
        link,
        pubDate,
        summary: summary || "Detaylar için habere tıklayın.",
        source: sourceName,
      });
    }
  }

  return items;
}

async function summarizeAndTranslateForFatih(rawItems) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      executiveSummary: "Piyasalarda genel hareketlilik sürüyor. Güncel haberler ve grafikler üzerinden yönü takip edebilirsiniz.",
      translatedItems: rawItems,
      sentiment: { score: 70, label: "Dengeli / Boğa Eğilimi", sentimentClass: "bullish" },
    };
  }

  const openai = new OpenAI({ apiKey });
  const headlinesText = rawItems.map((it, idx) => `[${idx + 1}] (${it.source}) ${it.title} - ${it.summary}`).join("\n");

  const prompt = `Aşağıda Yahoo Finance ve Cointelegraph'tan alınan en güncel finans/kripto haberleri yer alıyor:

${headlinesText}

GÖREVLERİN:
1. "executiveSummary": Fatih için tam 1 paragraflık (3-4 cümle), net, hap gibi ve akıcı bir Türkçe piyasa özeti yaz. Fatih uzun haber okumaz; ona şu an piyasanın genel havasını, Bitcoin/kripto durumunu ve hisse/altın eğilimini doğrudan özetle.
2. "sentimentScore": Bu haberlere göre piyasa duygu puanını 10 ile 90 arasında bir tamsayı olarak belirle (örn: 72).
3. "sentimentLabel": Duygu etiketini belirle (örn: "Pozitif Risk İştahı / Boğa Eğilimi", "Dengeli / Bekle-Gör", "Korku / Satış Baskısı").
4. "translatedItems": İlk 8 haberin başlığını ("title") ve 1 cümlelik özetini ("summary") anlaşılır, temiz Türkçeye çevir.

Aşağıdaki JSON formatında yanıt ver:
{
  "executiveSummary": "...",
  "sentimentScore": 72,
  "sentimentLabel": "...",
  "translatedItems": [
    { "index": 1, "title": "...", "summary": "..." }
  ]
}`;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Very fast, cheap, high quality translation
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const parsed = JSON.parse(res.choices[0].message.content || "{}");
    const score = parsed.sentimentScore || 70;
    const sentimentClass = score >= 60 ? "bullish" : (score <= 40 ? "bearish" : "neutral");

    const translatedMap = {};
    if (Array.isArray(parsed.translatedItems)) {
      parsed.translatedItems.forEach((t) => {
        translatedMap[t.index] = t;
      });
    }

    const finalItems = rawItems.slice(0, 8).map((it, idx) => {
      const trans = translatedMap[idx + 1];
      return {
        ...it,
        title: trans && trans.title ? trans.title : it.title,
        summary: trans && trans.summary ? trans.summary : it.summary,
      };
    });

    return {
      executiveSummary: parsed.executiveSummary || "Piyasalarda genel hareketlilik sürüyor. Fatih için özet hazırlanıyor...",
      translatedItems: finalItems,
      sentiment: {
        score,
        label: parsed.sentimentLabel || "Pozitif Risk İştahı",
        sentimentClass,
      },
    };
  } catch (err) {
    console.error("[News] OpenAI translation error:", err);
    return {
      executiveSummary: "Piyasalarda genel hava hareketli. Bitcoin ve hisse senedi piyasalarında trend takip edilmeye devam ediyor.",
      translatedItems: rawItems,
      sentiment: { score: 70, label: "Dengeli Piyasa", sentimentClass: "bullish" },
    };
  }
}

async function getFinancialNews(force = false) {
  const now = Date.now();
  if (!force && cachedNews && now - lastFetchTime < CACHE_TTL_MS) {
    return {
      ...cachedNews,
      fromCache: true,
      cacheExpiresInSeconds: Math.round((CACHE_TTL_MS - (now - lastFetchTime)) / 1000),
    };
  }

  console.log("[News] Fetching live financial news feeds...");
  const rawItems = [];

  // 1. Yahoo Finance RSS
  try {
    const yfRes = await fetch("https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,BTC-USD,NVDA,THYAO.IS&region=US&lang=en-US", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (yfRes.ok) {
      const xml = await yfRes.text();
      rawItems.push(...parseRssXml(xml, "Yahoo Finans"));
    }
  } catch (err) {
    console.warn("[News] Yahoo Finance RSS error:", err.message);
  }

  // 2. Cointelegraph RSS
  try {
    const ctRes = await fetch("https://cointelegraph.com/rss", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (ctRes.ok) {
      const xml = await ctRes.text();
      rawItems.push(...parseRssXml(xml, "Cointelegraph"));
    }
  } catch (err) {
    console.warn("[News] Cointelegraph RSS error:", err.message);
  }

  // Process with GPT-4o-mini for 1-paragraph summary & Turkish translation (cached 5 min)
  const processed = await summarizeAndTranslateForFatih(rawItems);

  cachedNews = {
    executiveSummary: processed.executiveSummary,
    sentiment: processed.sentiment,
    items: processed.translatedItems,
    lastUpdated: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    fromCache: false,
  };
  lastFetchTime = now;

  return cachedNews;
}

module.exports = {
  getFinancialNews,
};
