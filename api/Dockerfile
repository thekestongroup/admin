# No BuildKit-only features (RUN --mount): Cloud Run builds repositories with
# the classic docker build.

# Keston API: one small static binary (no dependencies beyond Go's own).
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /keston-api ./cmd/keston-api

# No shell, no package manager, a non-root user.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /keston-api /keston-api
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD ["/keston-api", "healthcheck"]
ENTRYPOINT ["/keston-api"]
CMD ["serve"]
