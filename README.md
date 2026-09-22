# TRADEX AI — TradingView MCP & Gemini Finans Analiz Platformu

Bu proje, [atilaahmettaner/tradingview-mcp](https://github.com/atilaahmettaner/tradingview-mcp) sunucusunu **Google Gemini API** ile birleştirerek gerçek zamanlı teknik analiz, piyasa taraması, backtest ve yapay zeka destekli yatırım asistanı sunan modern bir web uygulamasıdır.

---

## 🌟 Özellikler

1. **TradingView Canlı Mum Grafiği:**
   - Kripto (Binance, KuCoin), ABD Borsaları (NASDAQ, NYSE), Borsa İstanbul (BIST), Emtialar (Altın, Gümüş, Petrol) ve Forex.
   - Zaman dilimleri (15m, 1h, 1d), göstergeler (RSI, MA, Bollinger Bantları) ve çizim araçları.

2. **Gemini AI Finans Asistanı:**
   - **37 TradingView MCP aracı** doğrudan Gemini'nin Function Calling yeteneğine bağlıdır.
   - "THYAO için çoklu zaman analizi yap", "NVDA destek direnç seviyeleri nedir?", "Binance'teki hacim patlamalarını bul" gibi sorulara canlı verileri çekerek detaylı Türkçe yanıt verir.

3. **Canlı Piyasa Tarayıcısı (Screener):**
   - En çok yükselenler (Top Gainers), en çok düşenler (Top Losers), hacim patlaması (Volume Breakout) ve Bollinger sıkışması (Squeeze).

4. **Strateji Backtest Laboratuvarı:**
   - RSI Pullback, Keltner Breakout, Triple EMA ve strateji kıyaslaması.
   - Kazanma oranı (Win Rate), Sharpe oranı, kâr çarpanı ve geçmiş işlem dökümü.

5. **Kullanıcı Dostu & Paylaşılabilir:**
   - Arkadaşınız tarayıcıdan açtığında doğrudan kullanabilir.
   - Arayüzden tek tıkla Gemini API anahtarı girilebilir veya `.env` dosyasında tanımlanabilir.

---

## 🚀 Hızlı Başlangıç (Yerel Çalıştırma)

### Gereksinimler:
* **Node.js** (v18 veya üstü) — Bilgisayarınızda kuruludur.
* **UV / Python 3.12** — Kurulum adımlarında otomatik olarak yapılandırılmıştır.

### 1. Gemini API Anahtarı Alma (Ücretsiz)
1. [Google AI Studio](https://aistudio.google.com/) adresine gidin.
2. "Get API key" butonuna tıklayarak ücretsiz bir API anahtarı oluşturun.
3. `backend/.env` dosyasını açıp anahtarınızı yapıştırın:
   ```env
   GEMINI_API_KEY=AIzaSy...
   ```
   *(İsterseniz web arayüzündeki Ayarlar çark simgesinden de girebilirsiniz).*

### 2. Sunucuyu Başlatma
Terminalde `backend` klasörüne gidip başlatın:
```powershell
cd backend
npm start
```

Tarayıcınızda açın:
👉 **`http://localhost:3000`**

---

## 🌐 Arkadaşınızla Paylaşma & Canlıya Alma (Deployment)

### Yöntem 1: Yerel Ağda (Aynı Wi-Fi) Arkadaşınızla Paylaşma
1. Bilgisayarınızın yerel IP adresini öğrenin (PowerShell'de `ipconfig` yazın, örn: `192.168.1.35`).
2. Arkadaşınız kendi telefonundan veya bilgisayarından şu adrese girsin:
   `http://192.168.1.35:3000`

### Yöntem 2: Docker ile Canlıya Alma (Render / Railway / VPS)
Proje içerisinde hazır `Dockerfile` ve `docker-compose.yml` bulunmaktadır.

1. **Docker Compose ile Çalıştırma:**
   ```bash
   docker compose up -d
   ```
2. **Railway veya Render'da Yayınlama:**
   - Bu repoyu GitHub'a yükleyin.
   - [Railway.app](https://railway.app) veya [Render.com](https://render.com)'a bağlayın.
   - Ortam değişkeni (Environment Variable) olarak `GEMINI_API_KEY` ekleyin.
   - Size verilen `https://proje-adi.up.railway.app` adresini arkadaşınıza gönderin!

---

## 📁 Proje Yapısı

```
tradinwiew/
├── backend/
│   ├── package.json          # Express, Gemini & MCP bağımlılıkları
│   ├── server.js             # REST API ve statik dosya sunucusu
│   ├── mcpClient.js          # TradingView MCP bağlantı adaptörü (37 araç)
│   ├── geminiService.js      # Gemini Function Calling & Analiz servisi
│   └── .env                  # Port ve API anahtarı ayarları
├── frontend/
│   ├── index.html            # Dashboard, grafik ve sohbet arayüzü
│   ├── index.css             # Koyu tema, glassmorphism ve neon tasarım
│   └── app.js                # TradingView widget, canlı analiz ve sekmeler
├── Dockerfile                # Node + Python + UV içeren konteyner
├── docker-compose.yml        # Tek komutla yayınlama
└── README.md
```

---

## ⚠️ Yasal Uyarı
Bu platformdaki tüm analizler, indikatörler ve yapay zeka yorumları eğitim ve bilgilendirme amaçlıdır; yatırım tavsiyesi niteliği taşımaz.
