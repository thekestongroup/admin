// Keston Admin's backend: the one address the Keston Admin web app talks to,
// in front of Keston ID and Keston's other apps. Not a public API: other
// clients use each service's own API. See internal/gateway.
//
//	keston-api serve         run the API
//	keston-api healthcheck   for Docker: exits 0 when it's running
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/thekestongroup/admin/api/internal/config"
	"github.com/thekestongroup/admin/api/internal/gateway"
	"github.com/thekestongroup/admin/api/internal/upstream"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cmd := "serve"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	cfg, err := config.Load()
	if err != nil {
		fatal(err)
	}
	switch cmd {
	case "serve":
		serve(cfg)
	case "healthcheck":
		healthcheck(cfg)
	default:
		fatal(errors.New("unknown command " + cmd + " (serve, healthcheck)"))
	}
}

func serve(cfg *config.Config) {
	services, err := upstream.Parse(cfg.Services)
	if err != nil {
		fatal(err)
	}
	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           gateway.New(services, cfg.Origins).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		slog.Info("keston-api listening", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			fatal(err)
		}
	}()
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
}

func healthcheck(cfg *config.Config) {
	_, port, _ := net.SplitHostPort(cfg.Addr)
	c := &http.Client{Timeout: 2 * time.Second}
	res, err := c.Get("http://127.0.0.1:" + port + "/healthz")
	if err != nil || res.StatusCode != http.StatusOK {
		os.Exit(1)
	}
}

func fatal(err error) {
	slog.Error("keston-api", "error", err)
	os.Exit(1)
}
