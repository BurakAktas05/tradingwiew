const { initMCP, callTool } = require("./mcpClient");

async function run() {
  try {
    console.log("Testing MCP Connection...");
    const { tools } = await initMCP();
    console.log("Connected! Total tools:", tools.length);
    console.log("First 5 tools:", tools.slice(0, 5).map(t => t.name));

    console.log("\nTesting tool execution: coin_analysis for BTCUSDT...");
    const btcResult = await callTool("coin_analysis", {
      symbol: "BTCUSDT",
      exchange: "BINANCE",
      interval: "1d"
    });
    console.log("Tool execution successful! Result preview:");
    console.log(typeof btcResult === "object" ? JSON.stringify(btcResult, null, 2).slice(0, 500) : String(btcResult).slice(0, 500));
    console.log("\nAll tests passed!");
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

run();
