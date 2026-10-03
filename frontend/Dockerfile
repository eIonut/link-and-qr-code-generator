# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

RUN npm install --global pnpm@11.8.0
WORKDIR /app

# Keep dependency installation cached when only application code changes.
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=frontend-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

COPY . .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
