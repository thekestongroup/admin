// Package gateway is Keston Admin's own backend, in one container with the
// Keston Admin web app: the app is served from /, and its API at /api. The API
// sits in front of Keston ID and the other Keston apps. It is not Keston's
// public API. Anything else (a bot, an integration, an app) uses Keston ID's
// API, or that app's own, directly with its own token.
//
//   - Most requests are passed on to the service that owns them, as they are.
//   - A request that touches more than one service is answered here: it's
//     split up, each part goes to the right service, and the answers come
//     back as one (see bulkupdate.go).
//   - Signing in (and, when it exists, resetting your own password) never
//     comes through here: those go straight to Keston ID.
//
// The caller's Keston ID access token goes on to each service, which checks
// it and enforces its own rules. The gateway grants nothing itself.
package gateway

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/thekestongroup/admin/api/internal/upstream"
)

type Gateway struct {
	services *upstream.Registry
	app      http.Handler
}

// New: services are what the API sits in front of, app is the web app.
func New(services *upstream.Registry, app http.Handler) *Gateway {
	return &Gateway{services: services, app: app}
}

func (g *Gateway) Handler() http.Handler {
	// The API, as its services see it (/v1/…).
	api := http.NewServeMux()

	// Requests that span services are answered here. Add them above the
	// catch-all: the more specific route wins.
	api.HandleFunc("POST /v1/organisations/{orgID}/users/bulk-update", g.bulkUpdate)

	// Everything else is Keston ID's, for now. When another app owns part of
	// the management API, route its paths to it here:
	//   api.Handle("/v1/organisations/{orgID}/work/", g.services.Get("work").Proxy())
	api.Handle("/v1/", g.services.Get("id").Proxy())

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := g.services.Get("id").Ready(r.Context()); err != nil {
			slog.Warn("not ready", "error", err)
			upstream.WriteError(w, http.StatusServiceUnavailable, "not_ready", "Not ready.")
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	// /api/x is /v1/x to the services.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		r.URL.Path = "/v1" + strings.TrimPrefix(r.URL.Path, "/api")
		r.URL.RawPath = ""
		api.ServeHTTP(w, r)
	})
	mux.Handle("/", g.app)

	return recoverer(requestID(accessLog(mux)))
}

type ctxKey struct{}

// requestID tags each request (or keeps the one it came with), passes it on
// to services and back to the caller, so one action can be followed through
// every service's logs.
func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if id == "" || len(id) > 64 {
			b := make([]byte, 8)
			_, _ = rand.Read(b)
			id = hex.EncodeToString(b)
		}
		r.Header.Set("X-Request-Id", id)
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, id)))
	})
}

func idOf(r *http.Request) string { id, _ := r.Context().Value(ctxKey{}).(string); return id }

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(code int) { s.status = code; s.ResponseWriter.WriteHeader(code) }

func (s *statusWriter) Unwrap() http.ResponseWriter { return s.ResponseWriter }

func accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "status", sw.status,
			"ms", time.Since(start).Milliseconds(), "request", idOf(r))
	})
}

func recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil && v != http.ErrAbortHandler {
				slog.Error("request panicked", "path", r.URL.Path, "panic", v, "request", idOf(r))
				upstream.WriteError(w, http.StatusInternalServerError, "server_error", "Something went wrong. Try again.")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// bearer is the caller's access token, if they sent one.
func bearer(r *http.Request) (string, bool) {
	t, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	return t, ok && t != ""
}
