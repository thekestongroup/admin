# Keston Admin's server

Keston Admin runs as one container: this Go server serves the web app (from
`/srv`) and Keston Admin's own API at `/api`, in front of Keston ID and (later)
the other Keston apps.

The API is **only for Keston Admin**. Everything else (a bot that sends
messages, an integration, another app) uses the regular APIs directly:
Keston ID's, or that app's own, with its own token. Nothing else should be
pointed here.

```
browser (Keston Admin)
   │  sign in, password reset ───────────────► Keston ID   (straight there)
   │  /api (with the access token)
   ▼
Keston Admin ──passes on as it is──────────► Keston ID
             ──splits and combines─────────► Keston ID + other apps
```

- Passes the caller's own Keston ID access token on to each service. Each
  service checks it and applies its own rules. The API grants nothing itself.
- Never passes on cookies or browser headers.
- Errors keep Keston's one format: `{"error", "message", "field"}`.
- No dependencies beyond Go's standard library.

## Adding a Keston app

1. Add it to `KESTON_API_SERVICES`: `id=http://keston-id:8080,work=http://work:3000`
2. Give it its routes in `internal/gateway/gateway.go`:
   `api.Handle("/v1/organisations/{orgID}/work/", g.services.Get("work").Proxy())`
3. A request that touches several services is a handler like `bulkupdate.go`:
   check the request, send each part to its service with `Do`, merge answers.

## Settings

| | Default |
|---|---|
| `KESTON_ADMIN_ADDR` | `:8080` |
| `KESTON_API_SERVICES` | `id=http://keston-id:8080` |
| `KESTON_ID_URL` | none. Keston ID's public address, for signing in; blank: worked out from the app's own address (`admin.keston.co` → `id.keston.co`) |
| `KESTON_ADMIN_WEB_DIR` | `/srv` |

## Run

```bash
go test ./...
docker compose up -d --build   # from the admin folder, with the id stack running
```
