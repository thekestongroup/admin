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

# ── 2. The server (Go): serves the app, and its own API at /api ─────────────
FROM golang:1.27-alpine AS server
WORKDIR /src
COPY api/go.mod ./
COPY api/cmd ./cmd
COPY api/internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /keston-admin ./cmd/keston-admin

# ── 3. Run it: no shell, no package manager, a non-root user ────────────────
# KESTON_ID_URL (Keston ID's public address, for signing in) and
# KESTON_API_SERVICES (where its services are) are set on the container.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=server /keston-admin /keston-admin
COPY --from=build /app/dist /srv
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD ["/keston-admin", "healthcheck"]
ENTRYPOINT ["/keston-admin"]
CMD ["serve"]
