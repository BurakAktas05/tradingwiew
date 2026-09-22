const path = require("path");
const fs = require("fs");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

let mcpClient = null;
let cachedTools = [];

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
  cachedTools = result.tools || [];
  console.log(`[MCP] Successfully connected! Loaded ${cachedTools.length} TradingView tools.`);

  return { client: mcpClient, tools: cachedTools };
}

function parseMcpResponse(combinedText) {
  if (!combinedText || typeof combinedText !== "string") return combinedText;
  const trimmed = combinedText.trim();

  // Try standard JSON.parse first
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    // Check if it is multiple concatenated JSON objects separated by newlines
    try {
      const chunks = trimmed.split(/\n(?=\{)/);
      if (chunks.length > 1) {
        return chunks.map((c) => JSON.parse(c.trim()));
      }
    } catch (err2) {}

    // Check line by line JSON
    try {
      const lines = trimmed.split("\n").filter((l) => l.trim().startsWith("{") && l.trim().endsWith("}"));
      if (lines.length > 0) {
        return lines.map((l) => JSON.parse(l.trim()));
      }
    } catch (err3) {}

    return trimmed;
  }
}

async function callTool(name, args = {}) {
  if (!mcpClient) {
    await initMCP();
  }

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
    return parseMcpResponse(combined);
  }

  return response;
}

module.exports = {
  initMCP,
  getTools: () => cachedTools,
  callTool,
};
