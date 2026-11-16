// Package config reads Keston API's settings from environment variables.
package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	// Where to listen.
	Addr string
	// The services behind the API, "name=url" separated by commas. "id" is
	// required (Keston ID). Add each new Keston app here as it appears.
	Services string
	// Sites allowed to call the API from a browser (exact origins, e.g.
	// https://admin.keston.co). Empty: none, which is right when the API is
	// reached on the same origin as the web app (admin.keston.co/api).
	Origins []string
}

func Load() (*Config, error) {
	c := &Config{
		Addr:     env("KESTON_API_ADDR", ":8080"),
		Services: env("KESTON_API_SERVICES", "id=http://keston-id:4444"),
	}
	for _, o := range strings.Split(os.Getenv("KESTON_API_ORIGINS"), ",") {
		if o = strings.TrimRight(strings.TrimSpace(o), "/"); o != "" {
			c.Origins = append(c.Origins, o)
		}
	}
	if c.Addr == "" {
		return nil, fmt.Errorf("KESTON_API_ADDR is empty")
	}
	return c, nil
}

func env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}
