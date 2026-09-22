import asyncio
import json
from tradingview_mcp.server import mcp

async def main():
    tools = await mcp.list_tools()
    print(f"Total tools found: {len(tools)}")
    for t in tools:
        print(f"- {t.name}: {t.description[:80] if t.description else ''}...")

if __name__ == "__main__":
    asyncio.run(main())
