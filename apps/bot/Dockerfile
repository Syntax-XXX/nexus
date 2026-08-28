FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/bot/package.json apps/bot/package.json
COPY packages packages
COPY plugins plugins
RUN pnpm install --frozen-lockfile
COPY apps/bot apps/bot
RUN pnpm --filter @nexus/bot... build && pnpm deploy --legacy --filter @nexus/bot --prod /runtime

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PLUGIN_DIRECTORY=plugins
WORKDIR /app
COPY --from=build --chown=node:node /runtime ./
COPY --from=build --chown=node:node /app/plugins ./plugins
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT:-3002}/health || exit 1
CMD ["node", "dist/main.js"]
