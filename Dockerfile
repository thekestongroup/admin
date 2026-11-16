# No BuildKit-only features (RUN --mount): Cloud Run builds repositories with
# the classic docker build.

# ── 0. Development: the Vite dev server, for compose.dev.yaml ───────────────
# Nothing is built into the image: the source is mounted, so edits show up in
# the browser at once. See compose.dev.yaml.
FROM node:24-alpine AS dev
WORKDIR /app
RUN corepack enable
EXPOSE 8080
CMD ["sh", "-c", "pnpm install --frozen-lockfile=false && pnpm dev"]

# ── 1. Build the app (Vue + Keston UI) ──────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ── 2. Serve it: static files, index.html for the app's own routes ──────────
# KESTON_ID_URL and KESTON_API_URL (set on the container) tell the app where
# Keston ID and the Admin API are: see /config.json in the Caddyfile.
FROM caddy:2.10-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
