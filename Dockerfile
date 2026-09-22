# Multi-runtime Dockerfile (Node.js 20 + Python 3.12 + UV)
FROM node:20-bookworm-slim

# Install system dependencies & Python 3.12 + pip + curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install UV
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Install Python TradingView MCP Server globally
RUN uv pip install --system --break-system-packages tradingview-mcp-server

# Copy backend dependencies and install
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install --production

# Copy application source code
WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

WORKDIR /app/backend
CMD ["node", "server.js"]
