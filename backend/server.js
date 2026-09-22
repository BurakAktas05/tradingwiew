require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { initMCP, getTools, callTool } = require("./mcpClient");
const { chatWithOpenAI } = require("./openaiService");
const { getFinancialNews } = require("./newsService");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, "..", "frontend")));

// 1. Health & Status
app.get("/api/status", (req, res) => {
  const tools = getTools();
  res.json({
    status: "online",
    toolsCount: tools.length,
    provider: "OpenAI",
    model: process.env.OPENAI_MODEL || "gpt-4o",
    hasApiKey: Boolean(process.env.OPENAI_API_KEY),
  });
});

// 2. Available Tools List
app.get("/api/tools", (req, res) => {
  const tools = getTools();
  res.json({
    count: tools.length,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    })),
  });
});

// 3. Direct Tool Call (Fast API for Dashboard Widgets)
app.post("/api/tool/execute", async (req, res) => {
  const { tool, args } = req.body;
  if (!tool) {
    return res.status(400).json({ error: "Tool name is required." });
  }

  try {
    const result = await callTool(tool, args || {});
    res.json({ success: true, result });
  } catch (err) {
    console.error(`[API] Error executing tool ${tool}:`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Financial News & Sentiment (Cached to save resources & 100% free)
app.get("/api/news", async (req, res) => {
  try {
    const force = req.query.force === "true";
    const data = await getFinancialNews(force);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error("[API] News error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. OpenAI Chat with TradingView MCP Function Calling
app.post("/api/chat", async (req, res) => {
  const { message, history, apiKey } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    const response = await chatWithOpenAI(message, history || [], apiKey);
    res.json({
      success: true,
      reply: response.reply,
      toolCalls: response.toolCalls,
    });
  } catch (err) {
    console.error("[API] Chat error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to process chat with OpenAI.",
    });
  }
});

// Start server after MCP is initialized
async function start() {
  try {
    console.log("Initializing TradingView MCP connection...");
    await initMCP();
    app.listen(PORT, () => {
      console.log(`===================================================`);
      console.log(`🚀 TRADEX AI (OpenAI GPT-4o + TradingView MCP)`);
      console.log(`🌐 Web Dashboard: http://localhost:${PORT}`);
      console.log(`🤖 AI Engine:    OpenAI ${process.env.OPENAI_MODEL || 'gpt-4o'}`);
      console.log(`🛠️  Tools Loaded: ${getTools().length}`);
      console.log(`===================================================`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
