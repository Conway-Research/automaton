FROM node:20-slim

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

# HOME=/app so ~/.automaton aligns with Railway volume mount at /app/.automaton
ENV HOME=/app

# Copy package files first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json web/
COPY packages/cli/package.json packages/cli/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build TypeScript → dist/
RUN pnpm run build

# Railway sets PORT (default 8080)
# x402 payment server runs internally on 4020
EXPOSE 8080

# Run both: web server (this process) + full autonomous agent (child process)
CMD ["node", "web/start.mjs"]
