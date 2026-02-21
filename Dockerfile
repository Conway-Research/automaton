# ── Build stage ──────────────────────────────────────────────
FROM node:20-slim AS build

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# Native build deps for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/cli/package.json packages/cli/
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ src/
COPY packages/ packages/
RUN pnpm build

# ── Runtime stage ────────────────────────────────────────────
FROM node:20-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash automaton
RUN mkdir -p /home/automaton/.automaton && chown automaton:automaton /home/automaton/.automaton
USER automaton
WORKDIR /home/automaton/app

COPY --from=build --chown=automaton:automaton /app/dist ./dist
COPY --from=build --chown=automaton:automaton /app/node_modules ./node_modules
COPY --from=build --chown=automaton:automaton /app/packages ./packages
COPY --from=build --chown=automaton:automaton /app/package.json ./

ENV HOME=/home/automaton
ENV NODE_ENV=production

STOPSIGNAL SIGTERM

ENTRYPOINT ["node", "dist/index.js"]
CMD ["--run"]
