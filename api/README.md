# Keston Admin API

Keston Admin's own backend: the one address the Keston Admin web app talks
to, in front of Keston ID and (later) the other Keston apps.

It is **only for Keston Admin**. Everything else (a bot that sends messages,
an integration, another app) uses the regular APIs directly: Keston ID's,
or that app's own, with its own token. Nothing else should be pointed here.

```
browser (Keston Admin)
   │  sign in, password reset ───────────────► Keston ID   (straight there)
   │  everything else, with the access token
   ▼
Admin API ──passes on as it is────────────► Keston ID
           ──splits and combines───────────► Keston ID + other apps
```

- Passes the caller's own Keston ID access token on to each service. Each
  service checks it and applies its own rules. The API grants nothing itself.
- Never passes on cookies or browser headers.
- Errors keep Keston's one format: `{"error", "message", "field"}`.
- No dependencies beyond Go's standard library.

## Adding a Keston app

1. Add it to `KESTON_API_SERVICES`: `id=http://keston-id:8080,work=http://work:3000`
2. Give it its routes in `internal/gateway/gateway.go`:
   `mux.Handle("/v1/organisations/{orgID}/work/", g.services.Get("work").Proxy())`
3. A request that touches several services is a handler like `bulkupdate.go`:
   check the request, send each part to its service with `Do`, merge answers.

## Settings

| | Default |
|---|---|
| `KESTON_API_ADDR` | `:8080` |
| `KESTON_API_SERVICES` | `id=http://keston-id:8080` |
| `KESTON_API_ORIGINS` | none. Sites allowed to call it from a browser, for when it has its own address (`https://api.keston.co`) |

## Run

```bash
go test ./...
docker compose up -d --build   # from the admin folder, with the id stack running
```
