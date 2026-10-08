# syntax=docker/dockerfile:1

FROM node:24-alpine AS base

RUN npm install --global pnpm@11.8.0
WORKDIR /app
COPY package.json pnpm-lock.yaml ./

FROM base AS build

# Cache dependencies independently of the application source.
RUN --mount=type=cache,id=api-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY . .
RUN pnpm build

FROM base AS production-dependencies

RUN --mount=type=cache,id=api-pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --store-dir=/pnpm/store

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/package.json ./
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/', { signal: AbortSignal.timeout(2000) }).then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
